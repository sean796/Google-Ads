import { loadApiKey } from "@/lib/api";
import { OptimizationFileManager, type OptimizationFile } from "@/lib/optimization-file-manager";
import { type WordPressSite } from "@/components/integrations/types";
import type { LinkCheckResult } from "@/lib/wordpress-api/validate-internal-links";
import {
  extractGeographicEntityWithAI,
  generateLocalKeywordForEntityPage,
  selectBestKeywordForEntityPage,
} from "@/lib/content-optimization-helpers";
import type { GeographicSiteContext } from "@/lib/content-optimization/entity";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";
import {
  mergeRunProgress,
  reportRunProgress,
  computeBatchProgressFromSiteEntry,
  type BulkProgressMeta,
  type ContentOptimizerStepId,
  type RunProgressPatch,
} from "@/lib/content-optimization/content-optimizer-run-progress";
import type {
  GscResultLike,
  OptimizationProgressState,
  PendingOptimization,
} from "@/hooks/content-optimization/use-optimization-state";

export type { GscResultLike };
import { clearSiteCache } from "@/lib/wordpress-site-cache";
import { clearValidationCache } from "@/lib/cached-link-validation";
import { clearRelevanceCache } from "@/lib/content-generation/ai-link-relevance-filter";

// ============================================================================
// State Management Helpers
// ============================================================================

export type OptimizationProgressPatch = RunProgressPatch &
  Partial<{
    generatedFiles: OptimizationFile[];
    bulkMeta?: BulkProgressMeta;
  }> &
  Record<string, unknown>;

export type OptimizationProgressMap = Record<string, OptimizationProgressState>;

export type MapSetter<V> = (
  updater: (prev: Record<string, V>) => Record<string, V>,
) => void;

export type ProgressSetter = MapSetter<OptimizationProgressState>;

function syncSiteProgressToBatchKey(
  prev: OptimizationProgressMap,
  siteId: string,
  siteEntry: OptimizationProgressState,
): OptimizationProgressMap {
  const batchKey = `${siteId}-batch`;
  const batchEntry = prev[batchKey] as
    | (OptimizationProgressState & { bulkMeta?: BulkProgressMeta })
    | undefined;
  if (!batchEntry?.bulkMeta) return prev;
  const batchProgress = computeBatchProgressFromSiteEntry(siteEntry, batchEntry.bulkMeta);
  return mergeRunProgress(prev, batchKey, {
    stepId: siteEntry.stepId,
    subProgress: siteEntry.subProgress ?? 0,
    message: siteEntry.message,
    batchProgress,
    harnessSections: siteEntry.harnessSections,
    harnessPlannedSectionCount: siteEntry.harnessPlannedSectionCount,
    linkCheckResults: siteEntry.linkCheckResults,
  }) as OptimizationProgressMap;
}

function resolveProgressPatch(
  prevEntry: Record<string, unknown>,
  incoming: OptimizationProgressPatch,
): { stepId?: ContentOptimizerStepId; subProgress?: number } {
  const stepId = (incoming.stepId ?? prevEntry.stepId) as ContentOptimizerStepId | undefined;
  let subProgress = incoming.subProgress ?? (prevEntry.subProgress as number | undefined);
  if (subProgress == null && stepId != null && typeof incoming.progress === "number") {
    subProgress = Math.min(1, Math.max(0, incoming.progress / 100));
  }
  return { stepId, subProgress };
}

function attachGeneratedFiles(
  prevEntry: Record<string, unknown>,
  nextEntry: Record<string, unknown>,
  incoming: OptimizationProgressPatch,
): void {
  if (incoming.generatedFiles == null) {
    if (prevEntry.generatedFiles != null) nextEntry.generatedFiles = prevEntry.generatedFiles;
    return;
  }
  if (incoming.generatedFiles.length === 0) {
    nextEntry.generatedFiles = [];
    return;
  }
  const map = new Map<string, OptimizationFile>();
  for (const f of (prevEntry.generatedFiles as OptimizationFile[] | undefined) ?? []) {
    if (f?.name) map.set(f.name, f);
  }
  for (const f of incoming.generatedFiles) {
    if (f?.name) map.set(f.name, f);
  }
  nextEntry.generatedFiles = [...map.values()];
}

/**
 * Merges a progress update for one key (stepId + subProgress → monotonic progress).
 * Legacy callers may pass `{ step, progress, message }` only; inherits stepId/subProgress from prev when present.
 */
export function mergeOptimizationProgress(
  prev: OptimizationProgressMap,
  key: string,
  incoming: OptimizationProgressPatch,
): OptimizationProgressMap {
  const prevEntry: Partial<OptimizationProgressState> = prev[key] ?? {};
  const { stepId, subProgress } = resolveProgressPatch(
    prevEntry as Record<string, unknown>,
    incoming,
  );

  if (stepId != null && subProgress != null) {
    const merged = mergeRunProgress(prev, key, {
      ...incoming,
      stepId,
      subProgress,
    });
    const nextEntry = merged[key]!;
    attachGeneratedFiles(
      prevEntry as Record<string, unknown>,
      nextEntry as Record<string, unknown>,
      incoming,
    );
    return merged as OptimizationProgressMap;
  }

  // Legacy overview / prep harness: raw step + progress without stepId contract
  const siteNext: Record<string, unknown> = { ...prevEntry, ...incoming };
  if (typeof incoming.progress === "number") {
    const prevProgress = typeof prevEntry.progress === "number" ? prevEntry.progress : 0;
    siteNext.progress = Math.max(prevProgress, incoming.progress);
  }
  return { ...prev, [key]: siteNext as unknown as OptimizationProgressState };
}

/** Attach latest fileManager snapshot so download buttons update during a run (metadata only). */
export function progressWithGeneratedFiles(
  patch: OptimizationProgressPatch,
  fileManager: OptimizationFileManager,
): OptimizationProgressPatch {
  return {
    ...patch,
    filesRevision: Date.now(),
    generatedFileNames: fileManager.getFiles().map((f) => f.name),
  };
}

/** Apply a progress patch via setState (for nested callbacks from blueprint / keyword research). */
export function patchOptimizationProgress(
  setProgress: ProgressSetter,
  key: string,
  incoming: Partial<OptimizationProgressPatch> & Record<string, unknown>,
) {
  setProgress((prev) =>
    mergeOptimizationProgress(prev, key, incoming as OptimizationProgressPatch),
  );
}

/** Extra text / content harness lives on site.id; bulk UI also reads `${siteId}-batch`. */
export function mergeHarnessProgressSiteAndBatch(
  prev: OptimizationProgressMap,
  siteId: string,
  incoming: OptimizationProgressPatch,
): OptimizationProgressMap {
  const prevEntry: Partial<OptimizationProgressState> = prev[siteId] ?? {};
  const batchKey = `${siteId}-batch`;
  const { stepId, subProgress } = resolveProgressPatch(
    prevEntry as Record<string, unknown>,
    incoming,
  );

  if (stepId != null && subProgress != null) {
    let next = mergeOptimizationProgress(prev, siteId, {
      ...incoming,
      stepId,
      subProgress,
    });
    next = syncSiteProgressToBatchKey(
      next,
      siteId,
      next[siteId] ??
        ({ ...incoming, stepId, subProgress } as unknown as OptimizationProgressState),
    );
    return next;
  }

  // Legacy overview / prep harness: raw step + progress without stepId contract
  const siteNext = { ...prevEntry, ...incoming };
  let next: OptimizationProgressMap = {
    ...prev,
    [siteId]: siteNext as unknown as OptimizationProgressState,
  };
  if (prev[batchKey] != null) {
    const batchPrev: Partial<OptimizationProgressState> = prev[batchKey] ?? {};
    next = {
      ...next,
      [batchKey]: {
        ...batchPrev,
        ...incoming,
        harnessSections: incoming.harnessSections ?? batchPrev.harnessSections,
        harnessPlannedSectionCount:
          incoming.harnessPlannedSectionCount ?? batchPrev.harnessPlannedSectionCount,
        linkCheckResults: incoming.linkCheckResults ?? batchPrev.linkCheckResults,
      } as OptimizationProgressState,
    };
  }
  return next;
}

export function bindRunProgressReporter(
  setProgress: ProgressSetter,
  key: string,
): (
  stepId: ContentOptimizerStepId,
  subProgress: number,
  message?: string,
  extra?: Omit<OptimizationProgressPatch, "stepId" | "subProgress" | "message">,
) => void {
  return (stepId, subProgress, message?, extra?) => {
    updateOptimizationProgress(setProgress, key, stepId, subProgress, message, extra);
  };
}

export function updateOptimizationProgress(
  setProgress: ProgressSetter,
  key: string,
  stepId: ContentOptimizerStepId,
  subProgress: number,
  message?: string,
  extra?: Omit<OptimizationProgressPatch, "stepId" | "subProgress" | "message">,
) {
  setProgress((prev) => {
    let next = mergeOptimizationProgress(prev, key, {
      stepId,
      subProgress,
      message,
      ...extra,
    });
    const siteId = key.endsWith("-batch") ? key.replace(/-batch$/, "") : key;
    const siteEntry = next[siteId];
    if (!key.endsWith("-batch") && siteEntry) {
      next = syncSiteProgressToBatchKey(next, siteId, siteEntry);
    }
    return next;
  });
}

export function setOptimizingState(
  setIsOptimizing: MapSetter<boolean>,
  key: string,
  isOptimizing: boolean
) {
  setIsOptimizing((prev) => ({ ...prev, [key]: isOptimizing }));
}

export function clearOptimizationState(
  setIsOptimizing: MapSetter<boolean>,
  setProgress: ProgressSetter,
  setPending: MapSetter<PendingOptimization>,
  key: string
) {
  setIsOptimizing((prev) => {
    const updated = { ...prev };
    delete updated[key];
    return updated;
  });
  setProgress((prev) => {
    const updated = { ...prev };
    delete updated[key];
    return updated;
  });
  setPending((prev) => {
    const updated = { ...prev };
    delete updated[key];
    return updated;
  });
}

export function clearOptimizationFileManager(
  setFileManagers: MapSetter<OptimizationFileManager>,
  key: string
) {
  setFileManagers((prev) => {
    const updated = { ...prev };
    delete updated[key];
    return updated;
  });
}

export function clearOptimization(
  setIsOptimizing: MapSetter<boolean>,
  setProgress: ProgressSetter,
  setPending: MapSetter<PendingOptimization>,
  siteId: string
) {
  setIsOptimizing((prev) => {
    const updated = { ...prev };
    delete updated[siteId];
    return updated;
  });
  setProgress((prev) => {
    const updated = { ...prev };
    delete updated[siteId];
    return updated;
  });
  setPending((prev) => {
    const updated = { ...prev };
    delete updated[siteId];
    return updated;
  });

  clearSiteCache(siteId);
  clearValidationCache(siteId);
  clearRelevanceCache(siteId);
  console.log(`[Optimize Content] Cleared site cache for ${siteId} (manual clear)`);
}

// ============================================================================
// Entity Extraction Helpers
// ============================================================================

function buildSiteContext(site?: WordPressSite | null): GeographicSiteContext | undefined {
  if (!site) return undefined;
  const locsSource = site.locations || site.napInfo?.locations || [];
  const locations =
    Array.isArray(locsSource) && locsSource.length > 0
      ? locsSource
          .map((l) => ({
            city: l.city,
            state: l.state,
          }))
          .filter((l) => !!(l.city || l.state))
      : undefined;

  return {
    siteUrl: site.siteUrl,
    siteName: site.name,
    locations,
    napAddress: site.napInfo?.address,
  };
}

export async function extractEntityFromTitle(
  title: string,
  apiKey: string,
  site?: WordPressSite | null
): Promise<string | "N/A"> {
  if (!title || !title.trim()) return "N/A";
  try {
    const origin = await extractGeographicEntityWithAI({ title }, apiKey, buildSiteContext(site));
    return origin && origin.trim() ? origin.trim() : "N/A";
  } catch (error) {
    console.warn("[Entity Extraction] Error extracting from title:", error);
    return "N/A";
  }
}

export async function extractEntityFromUrl(
  url: string,
  title?: string,
  site?: WordPressSite | null
): Promise<string | "N/A"> {
  if (!url) return "N/A";
  try {
    const origin = await extractGeographicEntityWithAI({ url, title }, undefined, buildSiteContext(site));
    return origin && origin.trim() ? origin.trim() : "N/A";
  } catch (error) {
    console.warn("[Entity Extraction] Error extracting from URL:", error);
    return "N/A";
  }
}

export async function determineEntity(
  hasEntityOverride: boolean | undefined,
  title: string,
  url: string,
  apiKey: string,
  site?: WordPressSite | null
): Promise<{ entity: string | "N/A"; cleanedTitle: string }> {
  let extractedEntity: string | "N/A" = "N/A";
  const finalTitle = title;

  if (hasEntityOverride === false) {
    return { entity: "N/A", cleanedTitle: finalTitle };
  }

  try {
    const origin = await extractGeographicEntityWithAI({ title, url }, apiKey, buildSiteContext(site));
    extractedEntity = origin && origin.trim() ? origin.trim() : "N/A";
  } catch (error) {
    console.warn("[Entity Extraction] Error during extraction:", error);
    extractedEntity = "N/A";
  }

  return { entity: extractedEntity, cleanedTitle: finalTitle };
}

// ============================================================================
// GSC Data Helpers
// ============================================================================

export function validateGSCData(gscResult: GscResultLike): {
  hasValidData: boolean;
  primaryKeyword: string | null;
  isNoQueriesError: boolean;
} {
  const isNoQueriesError =
    typeof gscResult.error === "string" &&
    gscResult.error.toLowerCase().includes("no valid search queries found");

  let hasValidGSCData = false;
  let primaryKeywordFromGSC: string | null = null;

  const topQuery =
    typeof gscResult.topKeyword?.query === "string" ? gscResult.topKeyword.query : "";
  if (gscResult.success && gscResult.topKeyword) {
    if (topQuery !== "Page-level aggregate" && topQuery.trim().length > 0) {
      if (gscResult.queries && Array.isArray(gscResult.queries) && gscResult.queries.length > 0) {
        const keywordExists = gscResult.queries.some((q) => q.query === topQuery);
        if (keywordExists) {
          hasValidGSCData = true;
          primaryKeywordFromGSC = topQuery.trim();
        }
      }
    }
  }

  if (isNoQueriesError) {
    hasValidGSCData = false;
  }

  return {
    hasValidData: hasValidGSCData,
    primaryKeyword: primaryKeywordFromGSC,
    isNoQueriesError,
  };
}

/**
 * Extract keyword from title ONLY using AI (for SEM tasks when no GSC data).
 * Analyzes the title to determine the primary search intent keyword.
 */
export async function extractKeywordFromTitleOnly(
  title: string,
  url: string,
  siteId: string
): Promise<string> {
  if (!title || !title.trim()) {
    try {
      const urlObj = new URL(url);
      const pathSegments = urlObj.pathname.split("/").filter((s) => s.length > 0);
      const slug = pathSegments[pathSegments.length - 1] || "content";
      return slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
    } catch {
      return "content optimization";
    }
  }

  try {
    const openRouterApiKey = loadApiKey();
    if (openRouterApiKey && openRouterApiKey.trim().length > 0) {
      const researchModel = getResearchModel(siteId);
      const { content: aiKeywordRaw } = await postOpenRouterAppChat({
        apiKey: openRouterApiKey,
        model: researchModel,
        messages: [
          {
            role: "user",
            content: `Analyze this page title and extract the primary search keyword that users would use to find this content:

Page Title: "${title.replace(/<[^>]+>/g, "").trim()}"
Page URL: "${url}"

Extract the main keyword phrase (2-5 words) that best represents what this page is about. Focus on the core topic, not generic terms.
- NEVER use a competitor name or competitor-focused keyword; never optimize for competitors.
- NEVER use Bali Blinds (any casing) or DIY remove/detach topics for Bali blinds.
- this for example is not a good keyword "heritage lane dental edmonton".
- Prefer product-, service-, or topic-based keywords when they fit; not restricted to only those.

Return ONLY the keyword phrase, nothing else. No quotes, no explanation.`,
          },
        ],
        temperature: 0.3,
        maxTokens: 30,
      });
      const aiKeyword = aiKeywordRaw.trim();
      if (aiKeyword && aiKeyword.length > 2) {
        const cleaned = aiKeyword.replace(/^["']|["']$/g, "").trim().substring(0, 80);
        if (cleaned.length >= 3) {
          return cleaned;
        }
      }
    }
  } catch (error) {
    console.warn("[Keyword Extraction] Failed to extract keyword from title via AI, falling back:", error);
  }

  const cleanTitle = title.replace(/<[^>]+>/g, "").trim();
  if (cleanTitle.length > 0) {
    const words = cleanTitle.split(/\s+/).slice(0, 6);
    return words.join(" ").substring(0, 80);
  }

  try {
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split("/").filter((s) => s.length > 0);
    const slug = pathSegments[pathSegments.length - 1] || "content";
    return slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  } catch {
    return "content optimization";
  }
}

export async function extractKeywordFromContent(
  title: string,
  content: string,
  url: string,
  isEntityPage: boolean,
  siteName: string,
  siteId: string
): Promise<string> {
  let extractedKeyword = "";

  if (isEntityPage && title) {
    try {
      const openRouterApiKey = loadApiKey();
      if (openRouterApiKey && openRouterApiKey.trim().length > 0) {
        const researchModel = getResearchModel(siteId);
        extractedKeyword = await generateLocalKeywordForEntityPage(
          title,
          url,
          siteName,
          openRouterApiKey,
          researchModel
        );
        if (extractedKeyword && extractedKeyword.trim().length > 0) {
          return extractedKeyword.trim();
        }
      }
    } catch (error) {
      console.warn("[Keyword Extraction] Failed to generate AI keyword, falling back:", error);
    }
  }

  if (!extractedKeyword || extractedKeyword.length < 3) {
    if (title && title.trim().length > 0) {
      extractedKeyword = title.trim().replace(/<[^>]+>/g, "").substring(0, 100);
    } else if (content && content.trim().length > 0) {
      const h2Match = content.match(/<h2[^>]*>(.*?)<\/h2>/i);
      if (h2Match && h2Match[1]) {
        extractedKeyword = h2Match[1].replace(/<[^>]+>/g, "").trim().substring(0, 100);
      } else {
        const textContent = content.replace(/<[^>]+>/g, " ").trim();
        extractedKeyword = textContent.split(/[.!?]/)[0].trim().substring(0, 100);
      }
    }

    if (!extractedKeyword || extractedKeyword.length < 3) {
      try {
        const urlObj = new URL(url);
        const pathSegments = urlObj.pathname.split("/").filter((s) => s.length > 0);
        const slug = pathSegments[pathSegments.length - 1] || "content";
        extractedKeyword = slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
      } catch {
        extractedKeyword = "content optimization";
      }
    }
  }

  return extractedKeyword;
}

export function extractHeadingsFromContent(content: string): string[] {
  if (!content || typeof content !== "string") return [];
  const headings: string[] = [];
  const htmlRe = /<h[123][^>]*>(.*?)<\/h[123]>/gi;
  let m: RegExpExecArray | null;
  while ((m = htmlRe.exec(content)) !== null) {
    const text = (m[1] || "").replace(/<[^>]+>/g, "").trim();
    if (text) headings.push(text);
  }
  if (headings.length === 0) {
    const mdRe = /^#{1,3}\s+(.+)$/gm;
    while ((m = mdRe.exec(content)) !== null) {
      const text = (m[1] || "").trim();
      if (text) headings.push(text);
    }
  }
  return headings;
}

export async function inferPrimaryKeywordFromTitleAndMeta(
  title: string,
  metaDescription: string | undefined,
  excerpt: string | undefined,
  url: string,
  siteId: string,
  acfKeywordFocus?: string,
  promptModifier?: string,
  pageHeadings?: string[]
): Promise<string> {
  const cleanTitle = (title || "").replace(/<[^>]+>/g, "").trim();
  const meta = (metaDescription || excerpt || "").trim().substring(0, 300);
  const hint = (acfKeywordFocus || "").trim().substring(0, 100);
  const modifier = (promptModifier || "").trim().substring(0, 500);
  const headings =
    pageHeadings && pageHeadings.length > 0
      ? pageHeadings.slice(0, 15).map((h) => h.trim()).filter(Boolean)
      : [];

  try {
    const openRouterApiKey = loadApiKey();
    if (!openRouterApiKey?.trim()) return "";

    const researchModel = getResearchModel(siteId);
    const parts: string[] = [];
    if (modifier) parts.push(`PROMPT MODIFIER (context only; do not copy location from it): "${modifier}"`);
    parts.push(`Page Title: "${cleanTitle || "(none)"}"`, `Page URL: "${url}"`);
    if (headings.length > 0)
      parts.push(`Page headings (use these for context): ${headings.map((h) => `"${h}"`).join(", ")}`);
    if (meta) parts.push(`Meta description / excerpt: "${meta}"`);
    if (hint) parts.push(`Existing keyword focus hint (ignore if it is a company/brand name): "${hint}"`);

    const { content: aiKeywordRaw } = await postOpenRouterAppChat({
      apiKey: openRouterApiKey,
      model: researchModel,
      messages: [
        {
          role: "user",
          content: `Derive the primary SEO keyword for this page. Use the page headings and title to determine what the page is about.

${parts.join("\n")}

RULES:
- Use page headings and title to understand what the page is about (any topic: service, info, legal, terms, privacy, how-to, etc.). Headings define context.
- Return a 2-5 word keyword phrase that describes the main topic or subject of the page (e.g. "terms and conditions", "privacy policy", "service areas", "new patient form", "cellular shades").
- NEVER return a company name, brand name, or business name as the keyword.
- this for example is not a good keyword "heritage lane dental edmonton".
- NEVER use Bali Blinds (any casing) or DIY remove/detach topics for Bali blinds.

- NEVER return a city, region, or location as the keyword.
- For pages: NEVER use a competitor name or competitor-focused keyword; never optimize for competitors. Prefer product-, service-, or topic-based keywords when they fit the page, but you are not restricted to only product/service - use whatever best describes the page topic.
- If a PROMPT MODIFIER is provided, use it only for topic context; strip any location from the modifier and do not include location in your keyword.
- When in doubt, prefer the main heading or clear subject of the page.

Return ONLY the keyword phrase, nothing else. No quotes, no explanation.`,
        },
      ],
      temperature: 0.3,
      maxTokens: 30,
    });
    const aiKeyword = aiKeywordRaw.trim();
    if (!aiKeyword || aiKeyword.length < 2) return "";

    const cleaned = aiKeyword.replace(/^["']|["']$/g, "").trim().substring(0, 80);
    return cleaned.length >= 3 ? cleaned : "";
  } catch (error) {
    console.warn("[Keyword Inference] Failed to infer keyword from title/meta via AI:", error);
    return "";
  }
}

export function isNoQueriesError(error: unknown): boolean {
  if (!error) return false;
  const errorMessage = error instanceof Error ? error.message : String(error);
  return errorMessage.toLowerCase().includes("no valid search queries found");
}
