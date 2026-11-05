import { notify } from "@/lib/app-notifications";
import { NOTIFY_NO_BULK_ROWS_FROM_POSTS_OR_GRID_ENTITY_S, NOTIFY_NO_BULK_ROWS_TO_EXPORT, NOTIFY_NO_CLIENTS_SELECTED_SELECT_AT_LEAST_ONE_, NOTIFY_NO_CLIENTS_WITH_SITE_CONTEXT_FOR_GRID_EN, NOTIFY_NO_ROWS_TO_DOWNLOAD, NOTIFY_OPENROUTER_API_KEY_REQUIRED_FOR_BULK_CSV, notifyGridEntityPackageStepFailedX, notifyNoBulkRowsToCurateX, notifyXClientSSkippedX } from "@/lib/notify-messages";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { QUARTER_EDITORIAL_POSTS_GOAL } from "@/lib/quarter-editorial-gap";
import { getSiteInventoryBulk } from "@/lib/wordpress-api";
import type { SitePostInventoryKbPayload } from "@/lib/wordpress-api/types";
import type { WordPressSite } from "@/components/integrations/types";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import {
  createBulkTemplateDownloadArtifact,
  triggerCsvDownloadArtifact,
  type CsvDownloadArtifact,
} from "@/lib/backlink-research/backlink-bulk-csv-export";
import type { BacklinkBlogPitchOption } from "@/lib/backlink-research/backlink-tile-enriched";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { fillBlogRowMetaFromOpenRouter } from "@/lib/local-analysis/entity-sap-meta-agent";
import { fillBlogRowSlugFromOpenRouter } from "@/lib/local-analysis/blog-slug-agent";
import { exportVerticalBenchmarkGscCsv } from "@/lib/vertical-benchmark/vertical-benchmark-api";
import type {
  GscTop10CsvRow,
  VerticalBenchmarkContentKind,
} from "@/lib/vertical-benchmark/vertical-benchmark-types";
import { benchmarkContentKindLabel } from "@/lib/vertical-benchmark/vertical-benchmark-types";
import {
  buildGscTop10RagPayloadForSite,
  buildGscExtendedRagPagesForSite,
  normalizeGscPositionForTokens,
  sumGscPostPagesAcrossClients,
  type GscTop10RagPage,
  type GscTop10RagPayload,
} from "@/lib/vertical-benchmark/vertical-benchmark-gsc-rag";
import {
  compactInventoryKeywordsForJson,
} from "@/lib/bulk/inventory-json-slim";
import {
  createPressReleaseInventoryHostedLink,
  revokePressReleaseInventoryHostedLink,
} from "@/lib/press-release/press-release-site-inventory";
import type {
  BenchmarkInventoryHostedLink,
  BenchmarkPipelineProgress,
  BenchmarkPipelineProgressCallback,
  BenchmarkPipelineStep,
} from "@/lib/vertical-benchmark/vertical-benchmark-pipeline-types";
import {
  BULK_BENCHMARK_TOPIC_EXCLUSIONS_BLOCK,
  BULK_CANNIBALIZATION_INSTRUCTIONS,
  createGlobalBulkDedupeState,
  globalExclusionBlockForPrompt,
  isBannedBulkBenchmarkTopic,
  type GlobalBulkDedupeState,
} from "@/lib/vertical-benchmark/vertical-benchmark-bulk-dedupe";
import {
  CLIENT_OFFERINGS_PROMPT_RULES,
  enrichBenchmarkClientContext,
  fetchBenchmarkGmbRaw,
} from "@/lib/vertical-benchmark/vertical-benchmark-site-context";
import {
  buildGscClusterPromptBlock,
  buildGscOutputPages,
  detectBrandProductLineClusters,
  type BrandProductLineCluster,
} from "@/lib/vertical-benchmark/vertical-benchmark-gsc-clusters";
import {
  buildBenchmarkEntityRowsOnceForPackage,
  buildBenchmarkGridRagBlock,
  gscPlanContentKindsForBulkCurate,
  hasBenchmarkGridContext,
  type BenchmarkGridCsvContext,
} from "@/lib/vertical-benchmark/vertical-benchmark-grid-entity";
import { appendMasterInstructionsToSystemPrompt } from "@/lib/master-instructions-storage";
import { parseAssistantJsonObject } from "@/lib/competitor-research/competitor-report-json-parse";
import {
  buildInventoryCannibalPromptBlock,
  BENCHMARK_SITE_INVENTORY_CANNIBALIZATION,
  BENCHMARK_SEO_CONTENT_SPECIALIST_PERSONA,
  countInventoryPromptRows,
} from "@/lib/vertical-benchmark/vertical-benchmark-inventory-cannibal";
import {
  buildForbiddenInventoryOutputsBlock,
  gscOutputPagesExcludingPublishedInventory,
  normalizeInventoryUrl,
} from "@/lib/vertical-benchmark/vertical-benchmark-inventory-gsc";
import {
  benchmarkCurateInventoryCollections,
  benchmarkInventoryStepDetail,
} from "@/lib/vertical-benchmark/vertical-benchmark-inventory-fetch";
import {
  benchmarkSiteInventoryStepLabel,
  buildBenchmarkInventorySiteQueue,
} from "@/lib/vertical-benchmark/vertical-benchmark-roster-order";
import {
  clampBenchmarkBlogCount,
  keywordFromPeerGscUrl,
  pickBestPeerGscPages,
} from "@/lib/vertical-benchmark/vertical-benchmark-peer-gsc";

const DEFAULT_TEMPERATURE = 0.7;
const MAX_TOKENS_PER_CLIENT = 8192;
/** One editorial quarter across the whole export package (not per client). */
export const BENCHMARK_BULK_QUARTER_POST_ROW_CAP = QUARTER_EDITORIAL_POSTS_GOAL;
/** Parallel OpenRouter calls per client during bulk row generation. */
const CLIENT_PARALLEL_LIMIT = 8;

const PHASE_WEIGHT = {
  inventory: 25,
  gsc: 35,
  geminiClients: 30,
  gridEntity: 15,
  geminiFinal: 5,
} as const;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export type BenchmarkClientPlan = {
  site: WordPressSite;
  siteUrl: string;
  categoryLabel: string;
  contentKind: VerticalBenchmarkContentKind;
  siteInventoryJson: string;
  clientOfferingsBlock: string;
  verifiedBrands: string[];
  gscPayload: GscTop10RagPayload;
  gscClusters: BrandProductLineCluster[];
  /** GSC pages that receive a CSV row (merged cluster members excluded). */
  outputPages: GscTop10RagPage[];
  /** Bulk rows to produce = outputPages.length (may be less than raw GSC URL count). */
  expectedRows: number;
  /** When set, Local Dominator grid is appended to the Gemini user prompt (GSC + grid RAG). */
  gridRagBlock?: string;
};

function geminiPlanStepId(plan: BenchmarkClientPlan): string {
  return `gemini-${plan.site.id}-${plan.contentKind}`;
}

function gscStepLabelPrefix(kinds: VerticalBenchmarkContentKind[]): string {
  if (kinds.length === 1 && kinds[0] === "entity") return "GSC entity top 10";
  if (kinds.length === 1 && kinds[0] === "post") return "GSC post top 10";
  return "GSC top 10";
}

function emitProgress(
  onProgress: BenchmarkPipelineProgressCallback | undefined,
  partial: Omit<BenchmarkPipelineProgress, "busy"> & { busy?: boolean },
) {
  console.log(
    `%c[Industry Verticals] [${partial.phase}] ${partial.message} (${partial.percent ?? 0}%)`,
    "color: #84bc00; font-weight: bold;",
  );
  onProgress?.({
    busy: partial.busy ?? true,
    phase: partial.phase,
    message: partial.message,
    percent: partial.percent,
    indeterminate: partial.indeterminate,
    steps: partial.steps,
    inventoryLinks: partial.inventoryLinks,
  });
}

export function revokeBenchmarkInventoryHostedLinks(
  links: BenchmarkInventoryHostedLink[] | null | undefined,
): void {
  for (const link of links ?? []) {
    revokePressReleaseInventoryHostedLink(link.href);
  }
}

function initGscSteps(
  sites: WordPressSite[],
  contentKinds: VerticalBenchmarkContentKind[],
): BenchmarkPipelineStep[] {
  const prefix = gscStepLabelPrefix(contentKinds);
  return sites.map((s) => ({
    id: `gsc-${s.id}`,
    label: `${prefix}: ${s.name}`,
    status: "waiting" as const,
  }));
}

function initInventorySteps(
  sites: WordPressSite[],
  connectedSiteId?: string | null,
): BenchmarkPipelineStep[] {
  return sites.map((s) => ({
    id: `inv-${s.id}`,
    label: benchmarkSiteInventoryStepLabel(s, connectedSiteId),
    status: "waiting" as const,
  }));
}

function initGeminiSteps(plans: BenchmarkClientPlan[]): BenchmarkPipelineStep[] {
  return plans.map((p) => ({
    id: geminiPlanStepId(p),
    label:
      p.contentKind === "entity" ?
        `Entity rows: ${p.site.name}`
      : `Bulk rows: ${p.site.name}`,
    status: "waiting" as const,
  }));
}

function finalReviewStep(): BenchmarkPipelineStep {
  return {
    id: "gemini-final",
    label: "Final sheet review",
    status: "waiting",
  };
}

function gridEntityPackageStep(): BenchmarkPipelineStep {
  return {
    id: "grid-entity-package",
    label: "Grid entity (package)",
    status: "waiting",
  };
}

function patchStep(
  steps: BenchmarkPipelineStep[],
  id: string,
  patch: Partial<BenchmarkPipelineStep>,
): BenchmarkPipelineStep[] {
  return steps.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

function percentFromSteps(steps: BenchmarkPipelineStep[], base: number, span: number): number {
  if (!steps.length) return base;
  const done = steps.filter((s) => s.status === "done").length;
  return Math.min(100, base + Math.round((done / steps.length) * span));
}

function buildDedupeRulesBlock(rowCount: number): string {
  return `
NO DUPLICATES (mandatory):
- Every title in rows[] must be unique — no exact repeats and no light rephrases.
- Every keyword must be unique in rows[].
- Vary title format across rows: not every "X vs Y", not every "Guide to…".
${BENCHMARK_SITE_INVENTORY_CANNIBALIZATION}
${BULK_CANNIBALIZATION_INSTRUCTIONS}
ROW COUNT LOCK (overrides omit/merge): rows[] MUST contain exactly ${rowCount} object(s). Never omit a numbered GSC line. If two lines share intent or a line overlaps SITE_INVENTORY, pivot keyword and title — do not drop the row. Ignore any instruction that says to omit a row or keep only the stronger one by deleting the other.
Within rows[] for this client: apply cannibalization rules across all ${rowCount} row(s) and against every SITE_INVENTORY entry before returning JSON.`;
}

/** Short content-type labels for bulk CSV `modifier` (drives prompt_modifier at publish). */
export const BULK_BENCHMARK_MODIFIER_VALUES = [
  "comparison",
  "explainer",
  "guide",
  "how-to",
  "product review",
  "service",
  "consultation",
  "opinion",
  "trends",
  "future",
] as const;

export type BulkBenchmarkModifier = (typeof BULK_BENCHMARK_MODIFIER_VALUES)[number];

const MODIFIER_RULES_BLOCK = `
MODIFIER column (mandatory — separate from featuredImage):
- modifier is a short content-type label (writer brief). Never use "y", "n", or "google-maps" in modifier — those belong only in featuredImage.
- Use exactly one value per row from: ${BULK_BENCHMARK_MODIFIER_VALUES.join(", ")}.
- Match title/GSC URL intent: "A vs B" / Showdown → comparison; how-to / remove / clean / safely / explained → how-to or explainer; "Guide" → guide; named product evaluation → product review; repair / when to call a pro → service; worth it / are they → opinion; trends / design trends → trends; smart / automated / future tech → future; consultation / book → consultation.
- Vary modifier across rows when titles differ; do not default every row to the same type.`;

const NO_GEO_IN_TITLE_BLOCK = `
TITLE — NO PLACES (mandatory):
- Title must NEVER include city, state, province, region, country, or neighborhood names.
- Forbidden patterns: "Florida Interior Design…", "Calgary Blinds", "Design Trends in Texas", "Edmonton Window Treatments", "near [Place]", "in [City]".
- Use national or generic educational framing only (product, comparison, how-to, guide) with zero geography in Title.
- Keyword already must have no place names; Title must follow the same rule.`;

const ENTITY_TITLE_BLOCK = `
TITLE — SERVICE AREA (entity mode):
- Adapt each GSC service-area / location URL into one row for that market.
- Title may include city or region when it matches the GSC page and CLIENT_OFFERINGS_CONTEXT (location landing pages).
- keyword: short-tail intent; place names allowed when the exemplar URL is a location page.`;

const ENTITY_TITLE_WITH_GRID_BLOCK = `
TITLE — SERVICE AREA (entity mode + grid):
- Adapt each GSC service-area URL using LOCAL_DOMINATOR_GRID for place names (hyperlocal first segment, then city).
- entity column must use place labels from the grid evidence; do not invent cities outside the grid footprint.
- Title may include city/region when it matches the GSC URL and grid hints.`;

function postEntityColumnRules(): string {
  return `- entity must be "" on every row. featuredImage must be "y" on every row.`;
}

function entityEntityColumnRules(): string {
  return `- entity is REQUIRED on every row: geographic place label for this client (from the GSC service-area URL, GMB, and CLIENT_OFFERINGS_CONTEXT). Not the literal word "entity".
- featuredImage must be "y" on every row.`;
}

export function buildClientGscBulkAdaptPrompt(
  plan: BenchmarkClientPlan,
  globalDedupe: GlobalBulkDedupeState,
): {
  system: string;
  user: string;
} {
  const pages = plan.outputPages;
  const n = pages.length;
  const urlList = pages
    .map(
      (p, i) =>
        `${i + 1}. exemplar_url=${p.url} clicks=${p.clicks} impressions=${p.impressions} position=${normalizeGscPositionForTokens(p.position)}`,
    )
    .join("\n");

  const hasClusters = plan.gscClusters.length > 0;
  const clusterBlock = hasClusters
    ? buildGscClusterPromptBlock(plan.gscPayload.topPages, plan.gscClusters, plan.outputPages)
    : "";

  const isEntity = plan.contentKind === "entity";
  const inventorySlim = buildInventoryCannibalPromptBlock(plan.siteInventoryJson);
  const inventoryCount = countInventoryPromptRows(plan.siteInventoryJson);
  const inventoryBlock = `
=== SITE_INVENTORY (cannibalization only — read every row; do not copy verbatim) ===
${inventorySlim}
=== END SITE_INVENTORY ===`;

  const forbiddenOutputsBlock = buildForbiddenInventoryOutputsBlock(plan.siteInventoryJson);

  let system = `${BENCHMARK_SEO_CONTENT_SPECIALIST_PERSONA}

You fill a bulk ${isEntity ? "entity / service-area" : "blog"} CSV for one WordPress client. Reply with JSON only:
{ "rows": [ { "keyword", "entity", "title", "modifier", "featuredImage", "source_exemplar_url" } ] }

Pre-output checklist (mandatory): for each row, confirm title and keyword do not overlap any SITE_INVENTORY entry (semantic search intent, not string equality).

Rules:
- Return exactly ${n} object(s) in rows[] — one per numbered GSC OUTPUT line below, same order (1..${n}).
${hasClusters ? "- When GSC MERGED CLUSTERS is present, merged URLs must not get their own extra row beyond the required count.\n" : ""}- Do NOT add or remove rows beyond the required count ${n}. Do NOT invent topics beyond the GSC lines below.
- source_exemplar_url MUST equal the exact exemplar_url from the matching numbered OUTPUT line.
- CURATE FOR THIS CLIENT only (${plan.site.name}). Exemplar URLs are from other sites. Write a new keyword and title for this client. Do not copy the peer slug, peer title, or peer keyword wording.
- Never use Bali or Bali blinds in keyword or title (any wording, including removal/DIY).
- Every keyword unique. Every title unique.
${isEntity ? entityEntityColumnRules() : postEntityColumnRules()}
- keyword: 2–4 word short-tail for this client${isEntity ? "" : " (no city/region/state/country names)"}.
- title: under 60 chars${isEntity ? "" : "; national/educational only"}.
${MODIFIER_RULES_BLOCK}
${isEntity ? (plan.gridRagBlock ? ENTITY_TITLE_WITH_GRID_BLOCK : ENTITY_TITLE_BLOCK) : NO_GEO_IN_TITLE_BLOCK}
${CLIENT_OFFERINGS_PROMPT_RULES}
${BULK_BENCHMARK_TOPIC_EXCLUSIONS_BLOCK}
${buildDedupeRulesBlock(n)}
${globalExclusionBlockForPrompt(globalDedupe)}`;

  system = appendMasterInstructionsToSystemPrompt(system, plan.site.id);

  const user = `CLIENT: ${plan.site.name}
Site URL: ${plan.siteUrl}
Category: ${plan.categoryLabel}

${inventoryBlock}
${forbiddenOutputsBlock}
Published inventory count: ${inventoryCount} — every proposed title/keyword must be checked against SITE_INVENTORY and FORBIDDEN OUTPUTS above before you write rows[].

${plan.clientOfferingsBlock}
${plan.gridRagBlock ? `\n${plan.gridRagBlock}\n` : ""}

${clusterBlock}

GSC EXEMPLARS (${n} unique topic(s) from other sites — write ${n} rows for ${plan.site.name}):
${urlList}

FIXED COUNT: Reply with exactly ${n} row object(s) for ${plan.site.name}. Never omit a line. Never repeat a keyword or title. Never mention Bali.`;

  return { system, user };
}

export type JsonBulkRow = {
  keyword?: string;
  entity?: string;
  title?: string;
  modifier?: string;
  featuredImage?: string;
  source_exemplar_url?: string;
};

function inferModifierFromTitle(title: string): BulkBenchmarkModifier {
  const t = title.toLowerCase();
  if (/\bvs\.?\b|\bversus\b|showdown/i.test(title)) return "comparison";
  if (/\bhow to\b|\bhow-to\b/i.test(t)) return "how-to";
  if (/\bguide\b/i.test(t)) return "guide";
  if (/\breview\b/i.test(t) || /\brated\b/i.test(t)) return "product review";
  if (/\brepair\b|\bwhen to call\b|\bprofessional\b/i.test(t)) return "service";
  if (/\bconsultation\b|\bbook\b/i.test(t)) return "consultation";
  if (/\bworth it\b|\bare they\b|\bshould you\b/i.test(t)) return "opinion";
  if (/\btrends?\b/i.test(t)) return "trends";
  if (/\bfuture\b|\bautomated\b|\bsmart\b/i.test(t)) return "future";
  if (/\bexplained\b|\bsafely\b|\beasy\b|\bwhat is\b/i.test(t)) return "explainer";
  return "explainer";
}

/** Normalize model modifier; never treat featuredImage flags as modifier. */
export function normalizeBulkBenchmarkModifier(
  raw: string | undefined,
  title: string,
): BulkBenchmarkModifier {
  const trimmed = (raw ?? "").trim().toLowerCase();
  if (!trimmed || trimmed === "y" || trimmed === "n" || trimmed === "google-maps") {
    return inferModifierFromTitle(title);
  }
  const exact = BULK_BENCHMARK_MODIFIER_VALUES.find((v) => v === trimmed);
  if (exact) return exact;
  if (trimmed.includes("compar") || trimmed === "versus") return "comparison";
  if (trimmed.includes("how") && trimmed.includes("to")) return "how-to";
  if (trimmed.includes("guide")) return "guide";
  if (trimmed.includes("review")) return "product review";
  if (trimmed.includes("service") || trimmed.includes("repair")) return "service";
  if (trimmed.includes("consult")) return "consultation";
  if (trimmed.includes("opinion") || trimmed.includes("worth")) return "opinion";
  if (trimmed.includes("trend")) return "trends";
  if (trimmed.includes("future") || trimmed.includes("autom")) return "future";
  if (trimmed.includes("explain")) return "explainer";
  return inferModifierFromTitle(title);
}

function parseJsonBulkRows(content: string): JsonBulkRow[] {
  try {
    const parsed = parseAssistantJsonObject(content) as { rows?: JsonBulkRow[] };
    return Array.isArray(parsed.rows) ? parsed.rows : [];
  } catch {
    return [];
  }
}

function titleFromPulledKeyword(keyword: string): string {
  return keyword
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** One CSV row per picked GSC page. Never drop a picked keyword. */
export function jsonRowsToPitchRows(
  jsonRows: JsonBulkRow[],
  outputPages: GscTop10RagPage[],
  contentKind: VerticalBenchmarkContentKind,
): BacklinkBlogPitchOption[] {
  return outputPages.map((page, i) => {
    const url = page.url?.trim() ?? "";
    const r = jsonRows[i];
    const pulled = keywordFromPeerGscUrl(url);
    const modelKeyword = r?.keyword?.trim() ?? "";
    const keyword =
      modelKeyword && !isBannedBulkBenchmarkTopic(modelKeyword) ? modelKeyword : pulled;
    const title = r?.title?.trim() || titleFromPulledKeyword(keyword);
    return {
      keyword,
      entity: contentKind === "entity" ? (r?.entity?.trim() ?? "") : "",
      title,
      modifier: normalizeBulkBenchmarkModifier(r?.modifier, title),
      featuredImage: (r?.featuredImage?.trim() || "y") === "n" ? "n" : "y",
      publish_date_gmt: "",
    };
  });
}

export async function callGeminiBulkRowsForPlan(
  plan: BenchmarkClientPlan,
  apiKey: string,
  model: string,
  globalDedupe: GlobalBulkDedupeState,
): Promise<BacklinkBlogPitchOption[]> {
  const pages = plan.outputPages;

  const { system, user } = buildClientGscBulkAdaptPrompt(plan, globalDedupe);
  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model,
    system,
    user,
    maxTokens: MAX_TOKENS_PER_CLIENT,
    temperature: DEFAULT_TEMPERATURE,
    responseFormat: { type: "json_object" },
  });

  const jsonRows = parseJsonBulkRows(content);
  return jsonRowsToPitchRows(jsonRows, pages, plan.contentKind);
}

type BulkRowWithClient = BacklinkBlogPitchOption & {
  clientName: string;
  verifiedBrands: string[];
  gscClicks: number;
  gscImpressions: number;
  contentKind: VerticalBenchmarkContentKind;
};

/** Combined export order: highest GSC clicks, then impressions (not grouped by client). */
export function sortBulkBenchmarkRowsByGsc<T extends { gscClicks: number; gscImpressions: number }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (b.gscClicks !== a.gscClicks) return b.gscClicks - a.gscClicks;
    return b.gscImpressions - a.gscImpressions;
  });
}

type BulkRowWithGscMetrics = { gscClicks: number; gscImpressions: number; contentKind: VerticalBenchmarkContentKind };

/** Keep only the strongest post rows for one quarter package (GSC top-10 sourced). */
export function capBulkBenchmarkPostRowsToQuarterGoal<T extends BulkRowWithGscMetrics>(
  rows: T[],
  cap: number = BENCHMARK_BULK_QUARTER_POST_ROW_CAP,
): { rows: T[]; trimmed: number } {
  const posts = rows.filter((r) => r.contentKind === "post");
  const other = rows.filter((r) => r.contentKind !== "post");
  const keptPosts = sortBulkBenchmarkRowsByGsc(posts).slice(0, Math.max(0, cap));
  return {
    rows: sortBulkBenchmarkRowsByGsc([...keptPosts, ...other]),
    trimmed: Math.max(0, posts.length - keptPosts.length),
  };
}

function attachGscMetricsAtIndices(
  plan: BenchmarkClientPlan,
  rowsByIndex: Array<BacklinkBlogPitchOption | undefined>,
): BulkRowWithClient[] {
  return plan.outputPages.map((page, i) => {
    const row = rowsByIndex[i];
    const pulled = keywordFromPeerGscUrl(page.url);
    const modelKeyword = row?.keyword?.trim() ?? "";
    const keyword =
      modelKeyword && !isBannedBulkBenchmarkTopic(modelKeyword) ? modelKeyword : pulled;
    const title = row?.title?.trim() || titleFromPulledKeyword(keyword);
    return {
      keyword,
      entity: row?.entity ?? "",
      title,
      modifier: normalizeBulkBenchmarkModifier(row?.modifier, title),
      featuredImage: (row?.featuredImage?.trim() || "y") === "n" ? "n" : "y",
      publish_date_gmt: row?.publish_date_gmt ?? "",
      clientName: plan.site.name,
      verifiedBrands: plan.verifiedBrands,
      gscClicks: page.clicks ?? 0,
      gscImpressions: page.impressions ?? 0,
      contentKind: plan.contentKind,
    };
  });
}

function bulkRowToCsvExport(row: BulkRowWithClient): BacklinkBlogPitchOption {
  const {
    clientName: _c,
    verifiedBrands: _vb,
    gscClicks: _cl,
    gscImpressions: _im,
    contentKind: _k,
    ...csv
  } = row;
  return csv;
}

async function fetchMergedInventory(
  site: WordPressSite,
  contentKinds: VerticalBenchmarkContentKind[],
): Promise<{
  siteInventoryJson: string;
  kbPayload: SitePostInventoryKbPayload | null;
  siteUrl: string;
  inventoryRowCount: number;
  inventoryTruncated: boolean;
  error?: string;
}> {
  const u = site.siteUrl?.trim();
  const user = site.username?.trim();
  const pass = site.appPassword?.trim();
  const siteUrl = getPublicSiteUrl(site);
  if (!u || !user || !pass) {
    return {
      siteInventoryJson: "",
      kbPayload: null,
      siteUrl,
      inventoryRowCount: 0,
      inventoryTruncated: false,
      error: `WordPress credentials missing for ${site.name}`,
    };
  }

  const collections = benchmarkCurateInventoryCollections(site, contentKinds);
  const bulk = await getSiteInventoryBulk(site.siteUrl, user, pass, {
    includeContent: false,
    includeRawAcf: false,
    includeScheduled: true,
    inventorySizing: "auto",
    collections,
  });

  const mergedRows = (bulk.rows ?? []).map((row) => {
    const { collection: _collection, ...rest } = row;
    return rest;
  });

  const kbPayload: SitePostInventoryKbPayload = {
    site: bulk.site?.url ? bulk.site : { url: siteUrl },
    generatedAt: new Date().toISOString(),
    posts: mergedRows,
  };

  const siteInventoryJson = JSON.stringify(kbPayload, null, 2);
  const inventoryTruncated = Boolean(bulk.truncated || bulk.inventorySizing === "large");

  return {
    siteInventoryJson,
    kbPayload,
    siteUrl,
    inventoryRowCount: mergedRows.length,
    inventoryTruncated,
  };
}

async function fetchGscTop10InMemory(options: {
  sites: WordPressSite[];
  contentKinds: VerticalBenchmarkContentKind[];
  openRouterApiKey: string;
  clientTagBySiteId: Record<string, string>;
  clientTagLabelBySiteId: Record<string, string>;
  onProgress?: BenchmarkPipelineProgressCallback;
  progressBase?: number;
  progressSpan?: number;
  pipelineSteps?: BenchmarkPipelineStep[];
  inventoryLinks?: BenchmarkInventoryHostedLink[];
}): Promise<{
  rows: GscTop10CsvRow[];
  extendedRows: GscTop10CsvRow[];
  steps: BenchmarkPipelineStep[];
  dateRange?: { startDate: string; endDate: string };
} | null> {
  const { contentKinds } = options;
  const kindLabel = benchmarkContentKindLabel(contentKinds);
  const progressBase = options.progressBase ?? 0;
  const progressSpan = options.progressSpan ?? PHASE_WEIGHT.gsc;
  let gscSteps = initGscSteps(options.sites, contentKinds);
  const stepsWithInventory =
    options.pipelineSteps ?? [...gscSteps];
  console.log(
    `%c[Industry Verticals] 🚀 Starting GSC top ${kindLabel} fetch for ${options.sites.length} site(s)`,
    "color: #84bc00; font-weight: bold;",
    options.sites.map((s) => ({ id: s.id, name: s.name, siteUrl: s.siteUrl })),
  );
  emitProgress(options.onProgress, {
    phase: "gsc",
    message: `Fetching GSC top ${kindLabel} per client (in memory for RAG)…`,
    percent: progressBase,
    steps: stepsWithInventory.map((s) =>
      s.id.startsWith("gsc-") ? { ...s, status: "waiting" as const } : s,
    ),
    inventoryLinks: options.inventoryLinks,
  });

  const { rows, extendedRows = [], results, dateRange } = await exportVerticalBenchmarkGscCsv({
    sites: options.sites,
    siteIds: options.sites.map((s) => s.id),
    contentKinds,
    clientTagBySiteId: options.clientTagBySiteId,
    clientTagLabelBySiteId: options.clientTagLabelBySiteId,
    openRouterApiKey: options.openRouterApiKey,
    onProgress: (done, total, siteId) => {
      for (let i = 0; i < done; i++) {
        const s = options.sites[i];
        if (!s) continue;
        gscSteps = patchStep(gscSteps, `gsc-${s.id}`, { status: "done" });
      }
      if (siteId) {
        const idx = options.sites.findIndex((s) => s.id === siteId);
        if (idx >= done) {
          gscSteps = patchStep(gscSteps, `gsc-${siteId}`, {
            status: "active",
            detail: "Search Console + URL labeling",
          });
        }
      }
      const nextSite = options.sites[done];
      const activeLabel = nextSite ? ` (${nextSite.name})` : "";
      const mergedSteps = (options.pipelineSteps ?? []).map((s) => {
        if (!s.id.startsWith("gsc-")) return s;
        const patch = gscSteps.find((g) => g.id === s.id);
        return patch ?? s;
      });
      emitProgress(options.onProgress, {
        phase: "gsc",
        message: `GSC export ${done} / ${total} clients${activeLabel} (${kindLabel})`,
        percent:
          progressBase +
          Math.min(progressSpan, Math.round((done / Math.max(total, 1)) * progressSpan)),
        steps: mergedSteps.length ? mergedSteps : gscSteps,
        inventoryLinks: options.inventoryLinks,
      });
    },
  });

  const prefix = gscStepLabelPrefix(contentKinds);
  const rowNoun = contentKinds.length === 1 && contentKinds[0] === "entity" ? "entity URLs" : "URLs";
  for (const s of options.sites) {
    const result = results.find((r) => r.siteId === s.id);
    const hadRows = (result?.rowCount ?? 0) > 0;
    const rowCount = result?.rowCount ?? 0;
    gscSteps = patchStep(gscSteps, `gsc-${s.id}`, {
      status: result?.skipped && !hadRows ? "error" : "done",
      label:
        result?.skipped && !hadRows ?
          `${prefix}: ${s.name}`
        : `${prefix}: ${s.name} (${rowCount} ${rowNoun})`,
      detail: result?.skipped && !hadRows ? (result?.reason ?? `no ${kindLabel}`) : undefined,
    });
  }

  const finalGscSteps = (options.pipelineSteps ?? []).map((s) => {
    if (!s.id.startsWith("gsc-")) return s;
    const patch = gscSteps.find((g) => g.id === s.id);
    return patch ?? s;
  });

  const ragRows = rows.filter((r) => contentKinds.includes(r.content_kind));
  if (!ragRows.length) {
    const hint = results.find((r) => r.reason)?.reason;
    const failMsg = hint ? `No GSC ${kindLabel} for RAG (${hint})` : `No GSC ${kindLabel} for any client`;
    emitProgress(options.onProgress, {
      phase: "gsc",
      message: failMsg,
      percent: progressBase + progressSpan,
      busy: false,
      steps: finalGscSteps.length ? finalGscSteps : gscSteps,
      inventoryLinks: options.inventoryLinks,
    });
    notify.error(failMsg);
    return null;
  }

  emitProgress(options.onProgress, {
    phase: "gsc",
    message: `GSC RAG ready, ${ragRows.length} ${kindLabel} across clients`,
    percent: progressBase + progressSpan,
    steps: finalGscSteps.length ? finalGscSteps : gscSteps,
    inventoryLinks: options.inventoryLinks,
  });

  return { rows: ragRows, extendedRows, steps: gscSteps, dateRange };
}

/**
 * Combined bulk CSV: one row per GSC top URL per client (natural count from GSC, not a fixed quota).
 */
export type BenchmarkBulkTemplateDownloadResult = {
  artifact: CsvDownloadArtifact;
  /** Curated rows ready for Studio left-dock hydration or CSV export. */
  rows: CSVRow[];
  /** Published titles/keywords sent to OpenRouter per client name. */
  inventoryTitlesByClient: Record<string, number>;
  /** Hosted blob links for onsite inventory JSON per client. */
  inventoryLinks: BenchmarkInventoryHostedLink[];
};

export async function runBenchmarkBulkTemplateDownload(options: {
  sites: WordPressSite[];
  contentKinds?: VerticalBenchmarkContentKind[];
  gridContext?: BenchmarkGridCsvContext | null;
  openRouterApiKey: string;
  clientTagBySiteId: Record<string, string>;
  clientTagLabelBySiteId: Record<string, string>;
  /** Manager header connected site — inventory crawl always starts here. */
  connectedSite?: WordPressSite | null;
  /** Total blog rows on the sheet (not per site). */
  blogCount?: number;
  /** When true, skip triggering a browser CSV download (used when populating Studio left dock). */
  skipAutoDownload?: boolean;
  onProgress?: BenchmarkPipelineProgressCallback;
}): Promise<BenchmarkBulkTemplateDownloadResult | null> {
  const {
    sites,
    openRouterApiKey,
    clientTagBySiteId,
    clientTagLabelBySiteId,
    connectedSite = null,
    onProgress,
    contentKinds = ["post"],
    gridContext = null,
    blogCount: blogCountRaw,
  } = options;
  const blogCount = clampBenchmarkBlogCount(blogCountRaw ?? BENCHMARK_BULK_QUARTER_POST_ROW_CAP);
  const connectedSiteId = connectedSite?.id ?? null;

  const apiKey = openRouterApiKey?.trim();
  if (!apiKey) {
    notify.error(NOTIFY_OPENROUTER_API_KEY_REQUIRED_FOR_BULK_CSV);
    return null;
  }
  if (!sites.length) {
    notify.error(NOTIFY_NO_CLIENTS_SELECTED_SELECT_AT_LEAST_ONE_);
    return null;
  }

  const hasGrid = hasBenchmarkGridContext(gridContext);
  const useGridEntityEndStep = hasGrid && contentKinds.includes("entity");
  const gscPlanKinds = gscPlanContentKindsForBulkCurate(contentKinds, gridContext);
  const gridRagBlock = hasGrid && gridContext ? buildBenchmarkGridRagBlock(gridContext) : undefined;

  const gscStepsWaiting = initGscSteps(sites, contentKinds);
  const inventoryQueue = buildBenchmarkInventorySiteQueue(sites, connectedSite);
  const curateSiteIds = new Set(sites.map((s) => s.id));
  let invSteps = initInventorySteps(inventoryQueue, connectedSiteId);
  let pipelineSteps: BenchmarkPipelineStep[] = [...gscStepsWaiting, ...invSteps];
  const inventoryHostedLinks: BenchmarkInventoryHostedLink[] = [];

  const gscOut = await fetchGscTop10InMemory({
    sites,
    contentKinds,
    openRouterApiKey: apiKey,
    clientTagBySiteId,
    clientTagLabelBySiteId,
    onProgress,
    progressBase: 0,
    progressSpan: PHASE_WEIGHT.gsc,
    pipelineSteps,
    inventoryLinks: [],
  });
  if (!gscOut) {
    return null;
  }

  const gscRows = gscOut.rows;
  const gscExtendedRows = gscOut.extendedRows;
  const gscSteps = gscOut.steps;
  const dateRange = gscOut.dateRange;

  pipelineSteps = [...gscSteps, ...invSteps];

  const inventoryIntroMessage =
    inventoryQueue.length === 1 ?
      `Site inventory: ${inventoryQueue[0]!.name}…`
    : `Site inventory for ${inventoryQueue.length} clients in parallel…`;

  emitProgress(onProgress, {
    phase: "inventory",
    message: inventoryIntroMessage,
    percent: PHASE_WEIGHT.gsc,
    steps: pipelineSteps,
    inventoryLinks: [],
  });

  let invDoneCount = 0;
  const invTotal = inventoryQueue.length;

  const invResults = await mapPool(
    inventoryQueue,
    Math.min(CLIENT_PARALLEL_LIMIT, invTotal),
    async (site, i) => {
      const stepLabel = benchmarkSiteInventoryStepLabel(site, connectedSiteId);
      invSteps = patchStep(invSteps, `inv-${site.id}`, {
        status: "active",
        label: stepLabel,
        detail: "WordPress crawl…",
      });
      pipelineSteps = [...gscSteps, ...invSteps];
      emitProgress(onProgress, {
        phase: "inventory",
        message: `Site inventory: ${site.name}`,
        percent:
          PHASE_WEIGHT.gsc +
          Math.round((invDoneCount / Math.max(invTotal, 1)) * PHASE_WEIGHT.inventory),
        steps: pipelineSteps,
        inventoryLinks: [...inventoryHostedLinks],
      });

      const [inv, gmbRaw] = await Promise.all([
        fetchMergedInventory(site, contentKinds),
        fetchBenchmarkGmbRaw(site),
      ]);

      if (!inv.error && inv.kbPayload) {
        const hosted = createPressReleaseInventoryHostedLink(
          inv.siteUrl,
          compactInventoryKeywordsForJson(inv.kbPayload.posts ?? []),
        );
        inventoryHostedLinks.push({
          siteId: site.id,
          siteName: site.name,
          href: hosted.href,
          filename: hosted.filename,
          rowCount: hosted.rowCount,
        });
      }

      const context =
        inv.error ?
          null
        : enrichBenchmarkClientContext(site, inv.siteUrl, inv.siteInventoryJson, gmbRaw);

      if (inv.error) {
        invSteps = patchStep(invSteps, `inv-${site.id}`, { status: "error", detail: inv.error });
      } else {
        invSteps = patchStep(invSteps, `inv-${site.id}`, {
          status: "done",
          label: stepLabel,
          detail: benchmarkInventoryStepDetail(inv.inventoryRowCount, inv.inventoryTruncated),
        });
      }

      invDoneCount += 1;
      pipelineSteps = [...gscSteps, ...invSteps];
      emitProgress(onProgress, {
        phase: "inventory",
        message: `Site inventory ${invDoneCount} / ${invTotal} complete`,
        percent:
          PHASE_WEIGHT.gsc +
          Math.round((invDoneCount / Math.max(invTotal, 1)) * PHASE_WEIGHT.inventory),
        steps: pipelineSteps,
        inventoryLinks: [...inventoryHostedLinks],
      });

      return { site, inv, context };
    },
  );

  pipelineSteps = [...gscSteps, ...invSteps];

  const plans: BenchmarkClientPlan[] = [];
  const planSkipReasons: string[] = [];
  const inventoryTitlesByClient: Record<string, number> = {};
  for (const { site, inv } of invResults) {
    if (!curateSiteIds.has(site.id) && site.id !== connectedSiteId) continue;
    if (inv.error) {
      invSteps = patchStep(invSteps, `inv-${site.id}`, { status: "error", detail: inv.error });
      planSkipReasons.push(`${site.name}: ${inv.error}`);
      continue;
    }
    inventoryTitlesByClient[site.name] = inv.inventoryRowCount;
    invSteps = patchStep(invSteps, `inv-${site.id}`, {
      status: "done",
      label: benchmarkSiteInventoryStepLabel(site, connectedSiteId),
      detail: benchmarkInventoryStepDetail(inv.inventoryRowCount, inv.inventoryTruncated),
    });
  }

  const wantPosts = gscPlanKinds.includes("post");
  const wantEntityOnly = gscPlanKinds.includes("entity") && !wantPosts;
  const targetSite = connectedSite ?? sites[0] ?? null;
  const targetResult =
    targetSite ?
      invResults.find(({ site }) => site.id === targetSite.id) ?? null
    : null;

  if (wantPosts && targetSite && targetResult && !targetResult.inv.error) {
    const tagLabel = clientTagLabelBySiteId[targetSite.id] ?? "";
    const outputPages = pickBestPeerGscPages({
      targetSiteId: targetSite.id,
      rows: [...gscRows, ...gscExtendedRows],
      count: blogCount,
      contentKind: "post",
    });
    if (!outputPages.length) {
      planSkipReasons.push(`${targetSite.name}: no peer GSC blog URLs from other sites`);
    } else {
      const gscPayload = {
        siteId: targetSite.id,
        siteName: targetSite.name,
        siteUrl: targetResult.inv.siteUrl,
        clientTag: tagLabel,
        dateRange,
        topPages: outputPages,
      };
      const verifiedBrands = targetResult.context?.offerings.verifiedBrands ?? [];
      plans.push({
        site: targetSite,
        siteUrl: targetResult.inv.siteUrl,
        categoryLabel: tagLabel,
        contentKind: "post",
        siteInventoryJson: targetResult.inv.siteInventoryJson,
        clientOfferingsBlock: targetResult.context?.clientOfferingsBlock ?? "",
        verifiedBrands,
        gscPayload,
        gscClusters: [],
        outputPages,
        expectedRows: outputPages.length,
        gridRagBlock,
      });
    }
  }

  if (wantEntityOnly) {
    for (const { site, inv, context } of invResults) {
      if (!curateSiteIds.has(site.id)) continue;
      if (inv.error) continue;
      const tagLabel = clientTagLabelBySiteId[site.id] ?? "";
      const gscPayloadRaw = buildGscTop10RagPayloadForSite(
        site.id,
        site.name,
        inv.siteUrl,
        tagLabel,
        gscRows,
        "entity",
        dateRange,
      );
      const topPages = gscPayloadRaw.topPages.filter((p) => !isBannedBulkBenchmarkTopic(p.url));
      const gscPayload = { ...gscPayloadRaw, topPages };
      if (!gscPayload.topPages.length) {
        planSkipReasons.push(`${site.name}: no GSC entity URLs in Search Console`);
        continue;
      }
      const verifiedBrands = context?.offerings.verifiedBrands ?? [];
      const gscClusters = detectBrandProductLineClusters(gscPayload.topPages, verifiedBrands);
      const rawOutputPages = buildGscOutputPages(gscPayload.topPages, gscClusters);
      const extendedPages = buildGscExtendedRagPagesForSite(site.id, gscExtendedRows, "entity").filter(
        (p) => !isBannedBulkBenchmarkTopic(p.url),
      );
      const gscPool = [...gscPayload.topPages, ...extendedPages].filter(
        (p, i, arr) => arr.findIndex((x) => normalizeInventoryUrl(x.url) === normalizeInventoryUrl(p.url)) === i,
      );
      const { pages: outputPages } = gscOutputPagesExcludingPublishedInventory(
        rawOutputPages,
        gscPool,
        inv.siteInventoryJson,
      );
      if (!outputPages.length) continue;
      plans.push({
        site,
        siteUrl: inv.siteUrl,
        categoryLabel: tagLabel,
        contentKind: "entity",
        siteInventoryJson: inv.siteInventoryJson,
        clientOfferingsBlock: context?.clientOfferingsBlock ?? "",
        verifiedBrands,
        gscPayload,
        gscClusters,
        outputPages,
        expectedRows: outputPages.length,
        gridRagBlock,
      });
    }
  }
  pipelineSteps = [...gscSteps, ...invSteps];

  const gridEligibleSites = invResults.filter(({ inv }) => !inv.error);

  if (!plans.length && !useGridEntityEndStep) {
    const kindLabel = benchmarkContentKindLabel(contentKinds);
    const detail =
      planSkipReasons.length ?
        planSkipReasons.slice(0, 4).join(". ") + (planSkipReasons.length > 4 ? "…" : "")
      : `No GSC ${kindLabel} data for selected clients.`;
    notify.error(notifyNoBulkRowsToCurateX(detail));
    return null;
  }
  if (useGridEntityEndStep && !gridEligibleSites.length) {
    notify.error(NOTIFY_NO_CLIENTS_WITH_SITE_CONTEXT_FOR_GRID_EN);
    return null;
  }

  const researchModel = getResearchModel(sites[0]?.id);
  const baseStepsWithoutGemini = () =>
    pipelineSteps.filter((s) => !s.id.startsWith("gemini-") && !s.id.startsWith("grid-entity-"));

  let geminiSteps: BenchmarkPipelineStep[] = [];
  let clientsDone = 0;
  let filtered: BulkRowWithClient[] = [];
  const failedClients: { plan: BenchmarkClientPlan; error: string | null }[] = [];

  if (plans.length > 0) {
    const gridNote = hasGrid ? " (GSC + grid RAG)" : "";
    geminiSteps = [...initGeminiSteps(plans), finalReviewStep()];
    pipelineSteps = [...pipelineSteps, ...geminiSteps];

    emitProgress(onProgress, {
      phase: "gemini",
      message: `Curating ${plans.length} GSC plan(s)${gridNote}…`,
      percent: PHASE_WEIGHT.gsc + PHASE_WEIGHT.inventory,
      steps: pipelineSteps,
      inventoryLinks: inventoryHostedLinks,
    });

    geminiSteps = geminiSteps.map((s) =>
      s.id === "gemini-final" ? s : { ...s, status: "active" as const },
    );
    pipelineSteps = [...baseStepsWithoutGemini(), ...geminiSteps];
    emitProgress(onProgress, {
      phase: "gemini",
      message: `GSC curation${gridNote}…`,
      percent: PHASE_WEIGHT.gsc + PHASE_WEIGHT.inventory,
      steps: pipelineSteps,
      inventoryLinks: inventoryHostedLinks,
    });

    const parallelResults = await mapPool(
      plans,
      Math.min(CLIENT_PARALLEL_LIMIT, plans.length),
      async (plan) => {
        const perClientDedupe = createGlobalBulkDedupeState();
        const rows = await callGeminiBulkRowsForPlan(plan, apiKey, researchModel, perClientDedupe);
        const rowsByIndex = plan.outputPages.map((_, i) => rows[i]);
        geminiSteps = patchStep(geminiSteps, geminiPlanStepId(plan), { status: "done" });
        clientsDone += 1;
        pipelineSteps = [...baseStepsWithoutGemini(), ...geminiSteps];
        emitProgress(onProgress, {
          phase: "gemini",
          message: `GSC ${clientsDone} / ${plans.length} complete`,
          percent:
            PHASE_WEIGHT.gsc +
            PHASE_WEIGHT.inventory +
            Math.round((clientsDone / Math.max(plans.length, 1)) * PHASE_WEIGHT.geminiClients),
          steps: pipelineSteps,
          inventoryLinks: inventoryHostedLinks,
        });
        return { plan, rowsByIndex, error: null as string | null };
      },
    );

    failedClients.push(...parallelResults.filter((r) => r.error));
    const combinedWithClient: BulkRowWithClient[] = [];
    for (const { plan, rowsByIndex, error } of parallelResults) {
      if (error) continue;
      combinedWithClient.push(...attachGscMetricsAtIndices(plan, rowsByIndex));
    }

    filtered = combinedWithClient;

    if (!filtered.length && !useGridEntityEndStep) {
      const failHint =
        failedClients.length ?
          `All ${failedClients.length} client(s) failed curation.`
        : "No bulk rows produced from GSC pages.";
      notify.error(failHint);
      return null;
    }

    if (failedClients.length) {
      const names = failedClients.map((r) => r.plan.site.name).join(", ");
      notify.warning(notifyXClientSSkippedX(failedClients.length, names));
    }
  }

  if (useGridEntityEndStep && gridContext) {
    let gridEntitySteps = [gridEntityPackageStep(), finalReviewStep()];
    pipelineSteps = [...baseStepsWithoutGemini(), ...gridEntitySteps];

    const gridBasePct =
      PHASE_WEIGHT.gsc + PHASE_WEIGHT.inventory + (plans.length > 0 ? PHASE_WEIGHT.geminiClients : 0);

    emitProgress(onProgress, {
      phase: "grid-entity",
      message: "Grid entity rows (one package from uploaded grid)…",
      percent: gridBasePct,
      steps: pipelineSteps,
    });

    gridEntitySteps = gridEntitySteps.map((s) =>
      s.id === "gemini-final" ? s : { ...s, status: "active" as const },
    );
    pipelineSteps = [...baseStepsWithoutGemini(), ...gridEntitySteps];

    const packageSites = gridEligibleSites.map(({ site, inv, context }) => ({
      site,
      siteUrl: inv.siteUrl,
      siteName: site.name,
      clientOfferingsBlock: context?.clientOfferingsBlock ?? "",
      verifiedBrands: context?.offerings.verifiedBrands ?? [],
    }));

    let gridEntityRows: BulkRowWithClient[] = [];
    try {
      const raw = await buildBenchmarkEntityRowsOnceForPackage({
        gridContext,
        packageSites,
        openRouterApiKey: apiKey,
      });
      gridEntityRows = raw
        .filter((r) => r.keyword?.trim() && r.title?.trim())
        .map((r) => ({ ...r, contentKind: "entity" as const }));
      gridEntitySteps = patchStep(gridEntitySteps, "grid-entity-package", { status: "done" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      gridEntitySteps = patchStep(gridEntitySteps, "grid-entity-package", { status: "error", detail: msg });
      notify.warning(notifyGridEntityPackageStepFailedX(msg));
    }
    pipelineSteps = [...baseStepsWithoutGemini(), ...gridEntitySteps];
    emitProgress(onProgress, {
      phase: "grid-entity",
      message: `Grid entity package: ${gridEntityRows.length} row(s)`,
      percent: gridBasePct + PHASE_WEIGHT.gridEntity,
      steps: pipelineSteps,
    });

    if (!gridEntityRows.length && !filtered.length) {
      notify.error(NOTIFY_NO_BULK_ROWS_FROM_POSTS_OR_GRID_ENTITY_S);
      return null;
    }

    filtered = [...filtered, ...gridEntityRows];
  }

  if (!filtered.length) {
    notify.error(NOTIFY_NO_BULK_ROWS_TO_EXPORT);
    return null;
  }

  const hasPostRows = filtered.some((r) => r.contentKind === "post");
  const hasEntityRows = filtered.some((r) => r.contentKind === "entity");
  let rowsForCsv: CSVRow[] = filtered.map((row) => ({
    ...bulkRowToCsvExport(row),
    sitemap_type: row.contentKind === "entity" ? "entity" : "post",
  }));

  pipelineSteps = [...baseStepsWithoutGemini(), finalReviewStep()];
  pipelineSteps = patchStep(pipelineSteps, "gemini-final", {
    status: "active",
    detail: "Writing URL slugs and meta descriptions…",
  });
  emitProgress(onProgress, {
    phase: "gemini",
    message: "Writing URL slugs and meta descriptions…",
    percent: 95,
    steps: pipelineSteps,
    inventoryLinks: inventoryHostedLinks,
  });

  try {
    const enrichSite = connectedSite ?? sites[0] ?? null;
    const [metaRows, slugRows] = await Promise.all([
      fillBlogRowMetaFromOpenRouter(rowsForCsv, {
        apiKey,
        model: researchModel,
        siteId: enrichSite?.id,
        siteName: enrichSite?.name ?? "",
        strict: false,
      }),
      fillBlogRowSlugFromOpenRouter(rowsForCsv, {
        apiKey,
        model: researchModel,
        siteId: enrichSite?.id,
      }),
    ]);
    rowsForCsv = rowsForCsv.map((row, i) => ({
      ...row,
      meta_description: metaRows[i]?.meta_description ?? row.meta_description,
      target_slug: slugRows[i]?.target_slug ?? row.target_slug,
    }));
  } catch (e) {
    console.warn("[Vertical Benchmark] Slug/meta enrichment warning:", e);
  }

  pipelineSteps = patchStep(pipelineSteps, "gemini-final", {
    status: "done",
    detail: `${rowsForCsv.length} row(s)`,
  });

  const artifact = createBulkTemplateDownloadArtifact(
    rowsForCsv as BacklinkBlogPitchOption[],
    "benchmark-bulk-template",
    {
      blankEntityColumn: !hasEntityRows,
    },
  );
  if (!artifact) {
    notify.error(NOTIFY_NO_ROWS_TO_DOWNLOAD);
    return null;
  }

  emitProgress(onProgress, {
    phase: "done",
    message:
      hasPostRows && !hasEntityRows ?
        `Ideas ready, ${artifact.rowCount} blog(s)`
      : `Ideas ready, ${artifact.rowCount} row(s)`,
    percent: 100,
    busy: false,
    steps: pipelineSteps,
    inventoryLinks: inventoryHostedLinks,
  });

  if (!options.skipAutoDownload) {
    triggerCsvDownloadArtifact(artifact);
  }
  return {
    artifact,
    rows: rowsForCsv,
    inventoryTitlesByClient,
    inventoryLinks: inventoryHostedLinks,
  };
}
