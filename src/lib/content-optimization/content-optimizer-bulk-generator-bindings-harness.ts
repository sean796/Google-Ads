import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type {
  BulkOptimizationState,
  OptimizationProgressState,
} from "@/hooks/content-optimization/use-optimization-state";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import {
  buildWaitingResearchHarnessSections,
} from "@/lib/overview/overview-research-harness-sections";
import {
  isAiseoFileSlotRunKind,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import {
  rowHarnessIsResearch,
} from "@/lib/overview/overview-bulk-pipeline-titles";
import {
  buildPredeterminedBlogBodyHarnessTitles,
  buildWaitingContentOptimizeHarnessSections,
  extractBodyHarnessTitlesFromSections,
  extractBodyHarnessTitlesFromRowFiles,
  isUrlLikeHarnessTitle,
  sanitizeHarnessArticleTitle,
} from "@/lib/overview/overview-content-optimize-pipeline";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import {
  generatedFilesForUrl,
  harnessSectionsForUrl,
  overviewRowByUrl,
  resolveCurrentRow,
  type ContentOptimizerBulkGeneratorBindingsInput,
} from "./content-optimizer-bulk-generator-bindings-shared";

function toHarnessUi(
  sections: OptimizationProgressState["harnessSections"] | undefined,
): BulkHarnessSectionUi[] {
  return (sections ?? []) as BulkHarnessSectionUi[];
}

function harnessBodyIntroLooksLikeUrl(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return false;
  if (/^How https?:\/\//i.test(trimmed)) return true;
  return isUrlLikeHarnessTitle(trimmed);
}

export function mergeContentOptimizeHarnessSections(
  stored: BulkHarnessSectionUi[] | undefined,
  rowFiles?: Array<{ name?: string; fileName?: string; content?: string }>,
  articleTitle?: string,
  pageUrl?: string,
  keyword?: string,
  entity?: string,
  isSap?: boolean,
): BulkHarnessSectionUi[] {
  const fromHarness = extractBodyHarnessTitlesFromSections(stored);
  const fromFiles = extractBodyHarnessTitlesFromRowFiles(rowFiles);
  const harnessHasBadIntro = Boolean(fromHarness[0] && harnessBodyIntroLooksLikeUrl(fromHarness[0]));
  const safeArticleTitle = sanitizeHarnessArticleTitle(articleTitle ?? "", { pageUrl, keyword });
  const templateTitles = buildPredeterminedBlogBodyHarnessTitles(safeArticleTitle, undefined, {
    pageUrl,
    keyword,
    entity,
    isSap,
  });
  const bodyTitles =
    templateTitles.length > 0
      ? templateTitles
      : fromHarness.length > 0 && !harnessHasBadIntro
        ? fromHarness
        : fromFiles;
  const waiting = buildWaitingContentOptimizeHarnessSections(bodyTitles).map((section, sectionIndex) => ({
    ...section,
    sectionIndex,
  })) as BulkHarnessSectionUi[];
  if (!stored?.length) return waiting;
  const statusByTitle = new Map<string, BulkHarnessSectionUi>();
  for (const section of stored) {
    const title = section.title?.trim();
    if (title) statusByTitle.set(title, section);
  }
  return waiting.map((section) => {
    const patch = statusByTitle.get(section.title);
    return patch ? { ...patch, sectionIndex: section.sectionIndex, title: section.title } : section;
  });
}

export function mergeResearchHarnessSections(
  stored: BulkHarnessSectionUi[] | undefined,
): BulkHarnessSectionUi[] {
  const waiting = buildWaitingResearchHarnessSections().map((section, sectionIndex) => ({
    ...section,
    sectionIndex,
  })) as BulkHarnessSectionUi[];
  if (!stored?.length || !rowHarnessIsResearch(stored)) return waiting;
  const statusByTitle = new Map<string, BulkHarnessSectionUi>();
  for (const section of stored) {
    const title = section.title?.trim();
    if (title) statusByTitle.set(title, section);
  }
  return waiting.map((section, sectionIndex) => {
    const patch = statusByTitle.get(section.title);
    return patch ? { ...patch, sectionIndex } : section;
  });
}

export function buildHarnessByRow(
  bulkState: BulkOptimizationState,
  overviewRows: OverviewRow[],
): Map<number, BulkHarnessSectionUi[]> {
  const map = new Map<number, BulkHarnessSectionUi[]>();
  const urls = bulkState.urls ?? [];
  const byUrl = bulkState.urlHarnessSections ?? {};
  const filesByUrl = bulkState.urlGeneratedFiles ?? {};
  const researchBatch = bulkState.runKind === "research";
  const rowByUrl = overviewRowByUrl(overviewRows);

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index]!;
    const stored = harnessSectionsForUrl(byUrl, url);
    const rowFiles = generatedFilesForUrl(filesByUrl, url);
    const overviewRow = rowByUrl.get(normalizePageUrlKey(url));
    const articleTitle =
      sanitizeHarnessArticleTitle(
        overviewRow?.title?.trim() ||
          overviewRow?.aiTitle?.trim() ||
          bulkState.urlKeywords?.[url]?.trim() ||
          "",
        { pageUrl: url, keyword: bulkState.urlKeywords?.[url] },
      );
    if (researchBatch) {
      map.set(index, mergeResearchHarnessSections(stored));
    } else if (isAiseoFileSlotRunKind(bulkState.runKind)) {
      map.set(index, (stored ?? []) as BulkHarnessSectionUi[]);
    } else {
      map.set(index, mergeContentOptimizeHarnessSections(
        stored,
        rowFiles,
        articleTitle,
        url,
        bulkState.urlKeywords?.[url],
        typeof bulkState.urlEntities?.[url] === "string" ? bulkState.urlEntities[url] : undefined,
      ));
    }
  }
  return map;
}

export function liveHarnessSections(
  input: ContentOptimizerBulkGeneratorBindingsInput,
): BulkHarnessSectionUi[] {
  const fromProgress = toHarnessUi(
    input.siteProgress?.harnessSections ?? input.batchProgress?.harnessSections,
  );
  const currentRow = resolveCurrentRow(input.bulkState);
  const currentUrl = input.bulkState.urls?.[currentRow]?.trim();
  const fromBulkUrl = currentUrl
    ? toHarnessUi(harnessSectionsForUrl(input.bulkState.urlHarnessSections, currentUrl))
    : [];
  if (!fromBulkUrl.length) return fromProgress;
  if (!fromProgress.length) return fromBulkUrl;
  const byTitle = new Map<string, BulkHarnessSectionUi>();
  for (const section of fromBulkUrl) {
    const title = section.title?.trim();
    if (title) byTitle.set(title, section);
  }
  for (const section of fromProgress) {
    const title = section.title?.trim();
    if (title) byTitle.set(title, section);
  }
  return [...byTitle.values()];
}

export function harnessPlannedSectionCount(
  input: ContentOptimizerBulkGeneratorBindingsInput,
): number | null {
  const planned =
    input.siteProgress?.harnessPlannedSectionCount ??
    input.batchProgress?.harnessPlannedSectionCount ??
    null;
  return typeof planned === "number" && planned > 0 ? planned : null;
}
