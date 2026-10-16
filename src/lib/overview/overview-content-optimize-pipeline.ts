import type { Dispatch, SetStateAction } from "react";
import { extractChecklistItemTitle } from "@/lib/checklist-item-title";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import type { HarnessSectionListItem } from "@/lib/bulk/harness-sections-reducer";
import type { OptimizationFileManager } from "@/lib/optimization-file-manager";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import { AISEO_POST_CONTENT_SLOT_TITLE } from "@/lib/overview/overview-aiseo-row-artifacts";

/** True when a harness label looks like a raw URL, not a human title. */
export function isUrlLikeHarnessTitle(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  return trimmed.includes("://") && trimmed.includes("/");
}

/** Never feed raw URLs into intro H2 harness titles — derive slug or use keyword. */
export function sanitizeHarnessArticleTitle(
  articleTitle: string,
  options?: { pageUrl?: string; keyword?: string },
): string {
  const trimmed = articleTitle.trim();
  if (trimmed && !isUrlLikeHarnessTitle(trimmed)) return trimmed;
  const keyword = options?.keyword?.trim();
  if (keyword && !isUrlLikeHarnessTitle(keyword)) return keyword;
  const pageUrl = options?.pageUrl?.trim();
  if (pageUrl) {
    const slug = pageUrl.split("/").filter(Boolean).pop() ?? "";
    if (slug && !slug.includes(".")) {
      return slug
        .split("-")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }
  }
  return "";
}

export const CONTENT_OPTIMIZE_PIPELINE_PREFIX = [
  "Checklist",
  "Blueprint",
  "Link targets",
] as const;

export const CONTENT_OPTIMIZE_PIPELINE_SUFFIX = [
  AISEO_POST_CONTENT_SLOT_TITLE,
  "Content Markdown",
  "Implementation report",
  "WordPress upload",
] as const;

export const CONTENT_OPTIMIZE_PIPELINE_TITLES = [
  ...CONTENT_OPTIMIZE_PIPELINE_PREFIX,
  ...CONTENT_OPTIMIZE_PIPELINE_SUFFIX,
] as const;

export const GOOGLE_IMAGE_PIPELINE_TITLE = "Google Image" as const;

/** Entity SAP / google-maps featured image: Google Image is always step 1 in Details. */
export const GOOGLE_IMAGE_ENTITY_SAP_PIPELINE_TITLES = [
  GOOGLE_IMAGE_PIPELINE_TITLE,
  ...CONTENT_OPTIMIZE_PIPELINE_TITLES,
] as const;

export function rowUsesGoogleImageFeatured(
  row?: { featuredImage?: string },
  featuredImageType?: string,
): boolean {
  if (row?.featuredImage === "n") return false;
  if (row?.featuredImage === "google-maps") return true;
  return featuredImageType === "google-maps";
}

export function withGoogleImagePipelineFirst(titles: readonly string[]): readonly string[] {
  if (!titles.length || titles[0] === GOOGLE_IMAGE_PIPELINE_TITLE) return [...titles];
  return [GOOGLE_IMAGE_PIPELINE_TITLE, ...titles];
}

export function buildGoogleImageEntitySapPipelineTitles(
  bodyHarnessTitles?: readonly string[],
): readonly string[] {
  return withGoogleImagePipelineFirst(buildContentOptimizePipelineTitles(bodyHarnessTitles));
}

export const CONTENT_OPTIMIZE_PIPELINE_TOTAL = CONTENT_OPTIMIZE_PIPELINE_TITLES.length;

/** Sync OptimizationFileManager artifacts into bulk state for Details drawer downloads. */
export function flushUrlGeneratedFilesToBulkState(args: {
  batchKey: string;
  url: string;
  fileManager: OptimizationFileManager;
  setBulkOptimizationState: Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
}): void {
  const files = args.fileManager.getFiles();
  if (!files.length) return;
  args.setBulkOptimizationState((prev) => {
    const current = prev[args.batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [args.batchKey]: {
        ...current,
        urlGeneratedFiles: {
          ...(current.urlGeneratedFiles || {}),
          [args.url]: files.map((f) => ({
            name: f.name,
            content: f.content,
            mimeType: f.mimeType,
          })),
        },
      },
    };
  });
}

export function contentOptimizeHarnessSectionIndex(title: string): number {
  return (CONTENT_OPTIMIZE_PIPELINE_TITLES as readonly string[]).indexOf(title);
}

export function buildContentOptimizeHarnessPayload(
  rowIndex: number,
  sectionIndex: number,
  phase: BulkHarnessSectionPayload["phase"],
  markdownSlice?: string,
  pipelineTitles: readonly string[] = CONTENT_OPTIMIZE_PIPELINE_TITLES,
): BulkHarnessSectionPayload {
  return {
    rowIndex,
    sectionIndex,
    totalSections: pipelineTitles.length,
    title: pipelineTitles[sectionIndex] ?? `Step ${sectionIndex + 1}`,
    phase,
    ...(markdownSlice?.trim() ? { markdownSlice: markdownSlice.trim() } : {}),
  };
}

export function expandContentOptimizeHarnessWithBodySections(
  existing: HarnessSectionListItem[] | undefined,
  bodyHarnessTitles: readonly string[],
): HarnessSectionListItem[] {
  const titles = buildContentOptimizePipelineTitles(bodyHarnessTitles);
  const statusByTitle = new Map<string, HarnessSectionListItem>();
  for (const section of existing ?? []) {
    const title = section.title?.trim();
    if (title) statusByTitle.set(title, section);
  }
  return titles.map((title, sectionIndex) => {
    const prev = statusByTitle.get(title);
    if (prev) return { ...prev, sectionIndex, title };
    return { sectionIndex, title, status: "waiting" as const };
  });
}

/** Filename tokens for linking pipeline rows to saved artifacts. */
export const CONTENT_OPTIMIZE_ARTIFACT_SLUGS: Partial<
  Record<(typeof CONTENT_OPTIMIZE_PIPELINE_TITLES)[number], string>
> = {
  Checklist: "checklist",
  Blueprint: "blueprint",
  "Link targets": "link-targets",
  [AISEO_POST_CONTENT_SLOT_TITLE]: "content-",
  "Content Markdown": "content-",
  "Implementation report": "implementation-report",
  "WordPress upload": "wordpress.json",
};

export function isContentOptimizePipelineTitles(
  titles: readonly string[] | undefined,
): boolean {
  if (!titles?.length) return false;
  const offset = titles[0] === GOOGLE_IMAGE_PIPELINE_TITLE ? 1 : 0;
  const sliced = titles.slice(offset);
  if (sliced.length < CONTENT_OPTIMIZE_PIPELINE_TOTAL) return false;
  for (let i = 0; i < CONTENT_OPTIMIZE_PIPELINE_PREFIX.length; i++) {
    if (sliced[i] !== CONTENT_OPTIMIZE_PIPELINE_PREFIX[i]) return false;
  }
  const suffixStart = sliced.length - CONTENT_OPTIMIZE_PIPELINE_SUFFIX.length;
  for (let i = 0; i < CONTENT_OPTIMIZE_PIPELINE_SUFFIX.length; i++) {
    if (sliced[suffixStart + i] !== CONTENT_OPTIMIZE_PIPELINE_SUFFIX[i]) return false;
  }
  return true;
}

export function buildContentOptimizePipelineTitles(
  bodyHarnessTitles?: readonly string[],
): readonly string[] {
  const body = (bodyHarnessTitles ?? []).map((t) => t.trim()).filter(Boolean);
  if (!body.length) return [...CONTENT_OPTIMIZE_PIPELINE_TITLES];
  return [...CONTENT_OPTIMIZE_PIPELINE_PREFIX, ...body, ...CONTENT_OPTIMIZE_PIPELINE_SUFFIX];
}

export function buildWaitingContentOptimizeHarnessSections(
  bodyHarnessTitles?: readonly string[],
): HarnessSectionListItem[] {
  return buildContentOptimizePipelineTitles(bodyHarnessTitles).map((title, sectionIndex) => ({
    sectionIndex,
    title,
    status: "waiting" as const,
  }));
}

export type PredeterminedBodyHarnessOptions = {
  pageUrl?: string;
  keyword?: string;
  entity?: string;
  isSap?: boolean;
};

/** Body harness titles from the outline only. Never invents or pins titles. */
export function buildPredeterminedBlogBodyHarnessTitles(
  _articleTitle: string,
  h2Titles?: readonly string[],
  options?: PredeterminedBodyHarnessOptions,
): string[] {
  return (h2Titles ?? []).map((title) => title.trim()).filter(Boolean);
}

export function buildPredeterminedBlogBodyHarnessTitlesFromOutline(
  articleTitle: string,
  h2Titles: readonly string[],
  options?: PredeterminedBodyHarnessOptions,
): string[] {
  return buildPredeterminedBlogBodyHarnessTitles(articleTitle, h2Titles, options);
}

type HarnessTitleSection = { title?: string | null };

const LEGACY_RESEARCH_PREP_TITLES = [
  "Keyword research",
  "Selected keyword",
  "SERP research brief",
] as const;

/** Body harness step titles between Blueprint and Post content. */
export function extractBodyHarnessTitlesFromSections(
  sections: readonly HarnessTitleSection[] | undefined,
): string[] {
  if (!sections?.length) return [];
  const titles = sections
    .map((s) => s.title?.trim())
    .filter((t): t is string => Boolean(t) && !(LEGACY_RESEARCH_PREP_TITLES as readonly string[]).includes(t));
  const blueprintIndex = titles.indexOf("Blueprint");
  const contentHtmlIndex = titles.indexOf(AISEO_POST_CONTENT_SLOT_TITLE);
  if (blueprintIndex >= 0 && contentHtmlIndex > blueprintIndex) {
    let startIndex = blueprintIndex + 1;
    const linkTargetsIndex = titles.indexOf("Link targets");
    if (linkTargetsIndex >= 0 && linkTargetsIndex > blueprintIndex && linkTargetsIndex < contentHtmlIndex) {
      startIndex = linkTargetsIndex + 1;
    } else {
      for (let i = CONTENT_OPTIMIZE_PIPELINE_PREFIX.length - 1; i >= 0; i--) {
        const prefixTitle = CONTENT_OPTIMIZE_PIPELINE_PREFIX[i];
        const idx = titles.indexOf(prefixTitle);
        if (idx >= 0 && idx < contentHtmlIndex) {
          startIndex = Math.max(startIndex, idx + 1);
          break;
        }
      }
    }
    return titles.slice(startIndex, contentHtmlIndex);
  }
  const hasPrefixMarker = CONTENT_OPTIMIZE_PIPELINE_PREFIX.some((prefixTitle) =>
    titles.includes(prefixTitle),
  );
  if (!hasPrefixMarker) return [];
  const fixedTitles = new Set<string>([
    ...CONTENT_OPTIMIZE_PIPELINE_PREFIX,
    ...CONTENT_OPTIMIZE_PIPELINE_SUFFIX,
    ...LEGACY_RESEARCH_PREP_TITLES,
  ]);
  return titles.filter((title) => !fixedTitles.has(title));
}

type RowFileLike = { name?: string; fileName?: string; content?: string };

function rowFileName(file: RowFileLike): string {
  return (file.name ?? file.fileName ?? "").trim();
}

function rowFileContent(file: RowFileLike): string {
  return file.content?.trim() ?? "";
}

/** Agent titles from a saved blueprint JSON artifact. */
export function extractBodyHarnessTitlesFromBlueprintContent(content: string): string[] {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) return [];
  try {
    const parsed = JSON.parse(trimmed) as { agents?: Array<{ title?: string }> };
    if (!Array.isArray(parsed.agents)) return [];
    return parsed.agents
      .map((agent) => agent.title?.trim())
      .filter(Boolean) as string[];
  } catch {
    return [];
  }
}

/** Section titles from a saved checklist artifact (numbered lines). */
export function extractBodyHarnessTitlesFromChecklistContent(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const titles: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    let item = trimmed;
    const dotSpace = trimmed.indexOf(". ");
    if (dotSpace > 0) {
      const prefix = trimmed.slice(0, dotSpace);
      const isNumericPrefix = prefix.length > 0 && prefix.split("").every((char) => char >= "0" && char <= "9");
      if (isNumericPrefix) item = trimmed.slice(dotSpace + 2).trim();
    }
    const title = extractChecklistItemTitle(item).trim();
    if (title) titles.push(title);
  }
  return titles;
}

/** Body harness titles from generated row files (blueprint preferred, then checklist). */
export function extractBodyHarnessTitlesFromRowFiles(
  rowFiles: readonly RowFileLike[] | undefined,
): string[] {
  if (!rowFiles?.length) return [];
  let checklistTitles: string[] = [];
  for (const file of rowFiles) {
    const name = rowFileName(file).toLowerCase();
    const content = rowFileContent(file);
    if (!content) continue;
    if (name.startsWith("blueprint-") && name.endsWith(".json")) {
      const fromBlueprint = extractBodyHarnessTitlesFromBlueprintContent(content);
      if (fromBlueprint.length) return fromBlueprint;
    }
    if (name.includes("checklist") && (name.endsWith(".txt") || name.endsWith(".json"))) {
      const fromChecklist = extractBodyHarnessTitlesFromChecklistContent(content);
      if (fromChecklist.length) checklistTitles = fromChecklist;
    }
  }
  return checklistTitles;
}

function mergeBodyHarnessTitleSources(
  sections: readonly HarnessTitleSection[] | undefined,
  rowFiles?: readonly RowFileLike[],
): string[] {
  const fromHarness = extractBodyHarnessTitlesFromSections(sections);
  if (fromHarness.length) return fromHarness;
  return extractBodyHarnessTitlesFromRowFiles(rowFiles);
}

/** Full predetermined optimize pipeline titles from persisted harness (prefix + body + suffix). */
export function resolveContentOptimizePipelineTitlesFromHarness(
  sections: readonly HarnessTitleSection[] | undefined,
  rowFiles?: readonly RowFileLike[],
  articleTitle?: string,
): readonly string[] {
  const harnessTitles = (sections ?? [])
    .map((section) => section.title?.trim())
    .filter(Boolean) as string[];
  if (isContentOptimizePipelineTitles(harnessTitles)) {
    const body = extractBodyHarnessTitlesFromSections(sections);
    if (body.length > 0 && harnessTitles.length > CONTENT_OPTIMIZE_PIPELINE_TOTAL) {
      return [...harnessTitles];
    }
    return buildContentOptimizePipelineTitles(
      body.length > 0 ? body : buildPredeterminedBlogBodyHarnessTitles(articleTitle ?? ""),
    );
  }

  const body = mergeBodyHarnessTitleSources(sections, rowFiles);
  if (sections?.length && body.length === 0) {
    if (harnessTitles.length > CONTENT_OPTIMIZE_PIPELINE_TOTAL) {
      return [...harnessTitles];
    }
  }
  return buildContentOptimizePipelineTitles(
    body.length > 0 ? body : buildPredeterminedBlogBodyHarnessTitles(articleTitle ?? ""),
  );
}

/** Per-row drawer/resolver: harness state plus saved blueprint or checklist artifacts. */
export function resolveContentOptimizePipelineTitlesForRow(
  sections: readonly HarnessTitleSection[] | undefined,
  rowFiles?: readonly RowFileLike[],
  articleTitle?: string,
  googleImageFirst = false,
): readonly string[] {
  const titles = resolveContentOptimizePipelineTitlesFromHarness(sections, rowFiles, articleTitle);
  return googleImageFirst ? withGoogleImagePipelineFirst(titles) : titles;
}
