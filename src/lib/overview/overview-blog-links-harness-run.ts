import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress, mergeOverviewHarnessProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";

import { ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import { initOverviewBulkHarnessPagination, setOverviewBulkHarnessPageState } from "@/lib/overview/overview-bulk-page-state";
import { mapOverviewAiCopyWithConcurrency } from "@/lib/overview/overview-ai-copy-concurrency";
import { overviewBulkPageRanges } from "@/lib/overview/overview-bulk-page-size";
import type { BlogLinksCatalogRow } from "@/lib/overview/overview-blog-links-catalog";
import type { BlogLinksSiteLinkPool } from "@/lib/overview/overview-blog-links-inventory";
import type {
  BlogLinksAgentOptions,
  BlogLinksLinkAction,
  BlogLinksPlanResult,
} from "@/lib/overview/overview-blog-links-agent";
import { logBlogLinksActivity } from "@/lib/overview/overview-blog-links-activity-log";
import {
  insertWikipediaLinkAtEarliestEntityReference,
  isWikipediaHref,
} from "@/lib/overview/overview-blog-wikipedia-link-insert";
import {
  applySingleLinkAdd,
  applySingleLinkReplace,
  type BlogLinksAddResult,
  type BlogLinksReplaceResult,
} from "@/lib/overview/overview-blog-links-apply-local";
import {
  extractInternalLinksFromHtml,
  listHtmlParagraphBlocksForAddLinks,
  paragraphBlocksForLinkAdds,
} from "@/lib/overview/overview-blog-links-extract";
import {
  runBlogLinksAddIntent,
  runBlogLinksReplaceIntent,
  type ArticleLinkForIntent,
} from "@/lib/overview/overview-blog-links-link-intent";
import {
  keywordCandidatesForAnchor,
  resolveAddKeywordToUrl,
  resolveReplaceDestination,
} from "@/lib/overview/overview-blog-links-agent-payload";
import { isProtectedBlogLinkHref, linkUrlEqual } from "@/lib/overview/overview-blog-links-plan-filter";
import { normalizeInternalUrl } from "@/lib/wordpress-api/validate-internal-links";
import type { BlogLinksRowPatch } from "@/lib/overview/overview-blog-links-run";
import {
  buildLinksHarnessSectionsForRow,
  formatLinksAnalyzeAndApplyMarkdown,
  formatLinksAnalyzeMarkdown,
  formatLinksGscSitemapMarkdown,
  LINKS_SECTION_ANALYZE,
  LINKS_SECTION_GSC,
  linksHarnessSectionTitle,
  makeLinksHarnessDonePayloadForRow,
  makeLinksHarnessStartPayloadForRow,
} from "@/lib/overview/overview-blog-links-harness-sections";
import { fetchBlogHeadersGscPicks } from "@/lib/overview/overview-blog-headers-gsc";
import {
  emitLinksHarnessPayload,
  emitLinksHarnessStreamMarkdown,
  finishLinksRowHarness,
  markLinksRowError,
  setLinksHarnessMessage,
  type LinksHarnessSetters,
} from "@/lib/overview/overview-blog-links-harness-mutations";
import type { AiseoCacheWriteAccumulator } from "@/lib/overview/overview-aiseo-cache-write";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import {
  aiseoRowFilesForUpload,
  buildAiseoElementJsonFile,
} from "@/lib/overview/overview-aiseo-row-artifacts";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;
type SetIsOptimizing = Dispatch<SetStateAction<Record<string, boolean>>>;
type UserLinkHint = { anchor: string; href: string };

function gscHeadingKeywords(row: BlogLinksCatalogRow): string[] {
  return row.gscPicks?.headingKeywords ?? [];
}

function resolveUrlFromUserAnchor(
  anchor: string,
  row: BlogLinksCatalogRow,
  siteUrl: string,
  usedDestinationUrls: string[] = [],
): string {
  const trimmed = anchor.trim();
  if (!trimmed || !siteUrl.trim()) return "";

  const acceptUrl = (url: string): string => {
    if (!url) return "";
    const norm = normalizeInternalUrl(siteUrl, url);
    if (usedDestinationUrls.some((used) => linkUrlEqual(used, norm))) return "";
    return url;
  };

  const direct = acceptUrl(resolveAddKeywordToUrl(trimmed, row.linkPool, siteUrl));
  if (direct) return direct;

  const fromPhrase = acceptUrl(
    resolveReplaceDestination(trimmed, trimmed, undefined, row.linkPool, siteUrl),
  );
  if (fromPhrase) return fromPhrase;

  const lines = keywordCandidatesForAnchor(trimmed, row.linkPool, gscHeadingKeywords(row))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (const kw of lines) {
    const url = acceptUrl(resolveAddKeywordToUrl(kw, row.linkPool, siteUrl));
    if (url) return url;
  }
  return "";
}

function articleLinksForIntent(
  html: string,
  siteUrl: string,
  pageUrl: string,
): ArticleLinkForIntent[] {
  return extractInternalLinksFromHtml(html, siteUrl, pageUrl).map((link) => ({
    index: link.index,
    anchor: link.anchor,
    href: link.href,
  }));
}

function usedDestinationUrlsFromHtml(
  html: string,
  siteUrl: string,
  pageUrl: string,
): string[] {
  return extractInternalLinksFromHtml(html, siteUrl, pageUrl).map((link) =>
    normalizeInternalUrl(siteUrl, link.href),
  );
}

function resetRowHarnessSections(
  url: string,
  row: BlogLinksCatalogRow,
  setters: LinksHarnessSetters,
): void {
  const sections = buildLinksHarnessSectionsForRow(row);
  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        urlHarnessSections: {
          ...(current.urlHarnessSections || {}),
          [url]: sections,
        },
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          harnessPlannedSectionCount: sections.length,
        }),
      },
    };
  });
}

function emitRowHarnessStart(
  url: string,
  row: BlogLinksCatalogRow,
  setters: LinksHarnessSetters,
  sectionIndex: number,
  step: string,
): void {
  logBlogLinksActivity(step, { url: row.url, section: linksHarnessSectionTitle(row, sectionIndex) });
  emitLinksHarnessPayload(url, setters, makeLinksHarnessStartPayloadForRow(row.index, row, sectionIndex));
}

function emitRowHarnessDone(
  url: string,
  row: BlogLinksCatalogRow,
  setters: LinksHarnessSetters,
  sectionIndex: number,
  step: string,
  markdown: string,
): void {
  logBlogLinksActivity(step, { url: row.url, section: linksHarnessSectionTitle(row, sectionIndex) });
  emitLinksHarnessPayload(
    url,
    setters,
    makeLinksHarnessDonePayloadForRow(row.index, row, sectionIndex, markdown),
  );
}

export function initOverviewLinksHarnessBatchState(params: {
  site: WordPressSite;
  catalog: BlogLinksCatalogRow[];
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
  setIsOptimizingContent: SetIsOptimizing;
  prepMessage?: string;
}): string {
  const {
    site,
    catalog,
    setBulkOptimizationState,
    setOptimizationProgress,
    setIsOptimizingContent,
    prepMessage = "Preparing Links batch…",
  } = params;

  const batchKey = `${site.id}-batch`;
  const urls = catalog.map((c) => c.url.trim()).filter(Boolean);
  const urlKeywords: Record<string, string> = {};

  for (const entry of catalog) {
    const url = entry.url.trim();
    if (!url) continue;
    if (entry.focusKeyword) urlKeywords[url] = entry.focusKeyword;
  }

  setOptimizingState(setIsOptimizingContent, batchKey, true);
  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgress(prev as Record<string, unknown>, site.id, {
      step: "Links",
      progress: 2,
      message: prepMessage,
      harnessSections: [],
      harnessPlannedSectionCount: null,
    }),
  );
  setBulkOptimizationState((prev) => ({
    ...prev,
    [batchKey]: {
      urls,
      currentIndex: 0,
      urlStatuses: {},
      currentStep: "Links",
      currentUrl: urls[0],
      urlKeywords,
      runKind: "aiLinks",
      urlHarnessSections: {},
      urlGeneratedFiles: {},
      currentStepProgress: harnessStepProgress(undefined, {
        step: "Links",
        progress: 2,
        message: prepMessage,
        harnessSections: [],
        harnessPlannedSectionCount: null,
      }),
    },
  }));
  initOverviewBulkHarnessPagination(batchKey, urls.length, setBulkOptimizationState);

  return batchKey;
}

export function finalizeOverviewLinksHarnessBatch(
  batchKey: string,
  siteId: string,
  setIsOptimizingContent: SetIsOptimizing,
  setOptimizationProgress: SetOptProgress,
): void {
  setOptimizingState(setIsOptimizingContent, batchKey, false);
  setOptimizationProgress((prev) => {
    const next = { ...(prev as Record<string, unknown>) };
    delete next[batchKey];
    mergeOverviewHarnessProgressSiteAndBatch(next, siteId, {
      step: "Complete",
      progress: 100,
      message: "Links batch finished",
    });
    return next;
  });
}

async function fetchGscHarnessStep(
  row: BlogLinksCatalogRow,
  siteUrl: string,
  setters: LinksHarnessSetters,
  signal?: AbortSignal,
): Promise<void> {
  const url = row.url.trim();
  emitRowHarnessStart(url, row, setters, LINKS_SECTION_GSC, "gsc_start");
  row.gscPicks = await fetchBlogHeadersGscPicks(siteUrl, url, signal);
  emitRowHarnessDone(
    url,
    row,
    setters,
    LINKS_SECTION_GSC,
    "gsc_done",
    formatLinksGscSitemapMarkdown(row.gscPicks, row.linkPool.postCount, row.linkPool.pageCount),
  );
}

function emitAnalyzeHarness(row: BlogLinksCatalogRow, setters: LinksHarnessSetters): void {
  const url = row.url.trim();
  emitRowHarnessStart(url, row, setters, LINKS_SECTION_ANALYZE, "analyze_start");
  emitLinksHarnessStreamMarkdown(
    url,
    setters,
    LINKS_SECTION_ANALYZE,
    linksHarnessSectionTitle(row, LINKS_SECTION_ANALYZE),
    formatLinksAnalyzeMarkdown(
      row.existingLinks,
      row.linkPool.postCount,
      row.linkPool.pageCount,
      row.wordCount,
      row.sectionHeadings,
      row.linksToAdd,
    ),
  );
}

async function rewriteExistingLinks(
  row: BlogLinksCatalogRow,
  html: string,
  agentOptions: BlogLinksAgentOptions,
  setters: LinksHarnessSetters,
  url: string,
  linkActions: BlogLinksLinkAction[],
): Promise<{
  html: string;
  replacements: BlogLinksReplaceResult[];
  replacementsOk: number;
  intentKeywords: string[];
}> {
  let out = html;
  const replacements: BlogLinksReplaceResult[] = [];
  const intentKeywords: string[] = [];
  let replacementsOk = 0;

  const siteUrl = agentOptions.siteUrl?.trim() ?? "";
  const linkCount = extractInternalLinksFromHtml(out, siteUrl, row.url).length;
  for (let i = 0; i < linkCount; i += 1) {
    const links = extractInternalLinksFromHtml(out, siteUrl, row.url);
    const link = links[i];
    if (!link) break;

    intentKeywords.push("");
    let applied = applySingleLinkReplace(out, i, "", links, siteUrl, row.url);
    if (isProtectedBlogLinkHref(link.href)) {
      replacements.push(applied.result);
      continue;
    }

    const hint = row.userLinkTargets?.[i];
    const userHref = hint?.href?.trim() ?? "";
    const userAnchor = hint?.anchor?.trim() ?? "";

    if (userHref) {
      applied = applySingleLinkReplace(out, i, userHref, links, siteUrl, row.url);
      if (applied.result.ok) {
        out = applied.html;
        replacementsOk += 1;
        linkActions.push({
          action: "replace",
          index: i,
          proposedUrl: applied.result.now,
          rationale: userAnchor || "user href",
        });
      }
      replacements.push(applied.result);
      emitLinksHarnessStreamMarkdown(
        url,
        setters,
        LINKS_SECTION_ANALYZE,
        linksHarnessSectionTitle(row, LINKS_SECTION_ANALYZE),
        formatLinksAnalyzeAndApplyMarkdown(row, replacements, [], intentKeywords),
      );
      continue;
    }

    const usedDestinationUrls = usedDestinationUrlsFromHtml(out, siteUrl, row.url);
    const resolvedFromAnchor = userAnchor
      ? resolveUrlFromUserAnchor(userAnchor, row, siteUrl, usedDestinationUrls)
      : "";
    if (resolvedFromAnchor) {
      applied = applySingleLinkReplace(out, i, resolvedFromAnchor, links, siteUrl, row.url);
      if (applied.result.ok) {
        out = applied.html;
        replacementsOk += 1;
        linkActions.push({
          action: "replace",
          index: i,
          proposedUrl: applied.result.now,
          rationale: userAnchor,
        });
      }
      replacements.push(applied.result);
      emitLinksHarnessStreamMarkdown(
        url,
        setters,
        LINKS_SECTION_ANALYZE,
        linksHarnessSectionTitle(row, LINKS_SECTION_ANALYZE),
        formatLinksAnalyzeAndApplyMarkdown(row, replacements, [], intentKeywords),
      );
      continue;
    }

    const articleLinks = articleLinksForIntent(out, siteUrl, row.url).map((entry, idx) =>
      idx === i && userAnchor ? { ...entry, anchor: userAnchor } : entry,
    );

    try {
      const intent = await runBlogLinksReplaceIntent(
        row,
        i,
        agentOptions,
        usedDestinationUrls,
        articleLinks,
      );
      if (intent?.proposedUrl) {
        intentKeywords[i] = intent.proposedKeyword;
        applied = applySingleLinkReplace(out, i, intent.proposedUrl, links, siteUrl, row.url);
        if (applied.result.ok) {
          out = applied.html;
          replacementsOk += 1;
          linkActions.push({
            action: "replace",
            index: i,
            proposedUrl: applied.result.now,
            rationale: intent.proposedKeyword,
          });
        }
      }
    } catch (err) {
      logBlogLinksActivity("replace_error", {
        url: row.url,
        index: i + 1,
        message: err instanceof Error ? err.message : "replace failed",
      });
    }

    replacements.push(applied.result);
    emitLinksHarnessStreamMarkdown(
      url,
      setters,
      LINKS_SECTION_ANALYZE,
      linksHarnessSectionTitle(row, LINKS_SECTION_ANALYZE),
      formatLinksAnalyzeAndApplyMarkdown(row, replacements, [], intentKeywords),
    );
  }

  return { html: out, replacements, replacementsOk, intentKeywords };
}

async function applyOneLinkAddSlot(
  row: BlogLinksCatalogRow,
  html: string,
  agentOptions: BlogLinksAgentOptions,
  addBlocks: Array<{ index: number; text: string }>,
  usedBlockIndices: Set<number>,
  hint?: UserLinkHint,
): Promise<{
  html: string;
  result: BlogLinksAddResult;
  addBlocks: Array<{ index: number; text: string }>;
  action?: BlogLinksLinkAction;
}> {
  const siteUrl = agentOptions.siteUrl?.trim() ?? "";
  const userHref = hint?.href?.trim() ?? "";
  const userAnchor = hint?.anchor?.trim() ?? "";

  if (userHref && isWikipediaHref(userHref)) {
    const entityLabel = userAnchor || row.focusKeyword || row.title || "entity";
    const applied = insertWikipediaLinkAtEarliestEntityReference(html, entityLabel, userHref);
    return {
      html: applied.html,
      result: {
        anchor: applied.anchor,
        url: applied.url,
        paragraphIndex: -1,
        ok: applied.ok,
      },
      addBlocks: paragraphBlocksForLinkAdds(applied.html),
      action: applied.ok
        ? {
            action: "add" as const,
            paragraphIndex: -1,
            anchorText: applied.anchor,
            proposedUrl: applied.url,
            rationale: "wikipedia entity link",
          }
        : undefined,
    };
  }

  const tryUserAdd = (anchorText: string, targetUrl: string) => {
    for (const block of listHtmlParagraphBlocksForAddLinks(html)) {
      if (usedBlockIndices.has(block.index)) continue;
      const applied = applySingleLinkAdd(html, block.index, anchorText, targetUrl);
      if (applied.result.ok) {
        return {
          html: applied.html,
          result: applied.result,
          addBlocks: paragraphBlocksForLinkAdds(applied.html),
          action: {
            action: "add" as const,
            paragraphIndex: block.index,
            anchorText: applied.result.anchor,
            proposedUrl: targetUrl,
            rationale: userAnchor || "user link",
          },
        };
      }
    }
    return null;
  };

  if (userHref && userAnchor) {
    const hit = tryUserAdd(userAnchor, userHref);
    if (hit) return hit;
  }

  if (userAnchor && !userHref) {
    const usedDestinationUrls = usedDestinationUrlsFromHtml(html, siteUrl, row.url);
    const resolved = resolveUrlFromUserAnchor(userAnchor, row, siteUrl, usedDestinationUrls);
    if (resolved) {
      const hit = tryUserAdd(userAnchor, resolved);
      if (hit) return hit;
    }
  }

  if (!userHref) {
    for (const block of addBlocks) {
      if (usedBlockIndices.has(block.index)) continue;

      try {
        const articleLinks = articleLinksForIntent(html, siteUrl, row.url);
        const usedDestinationUrls = usedDestinationUrlsFromHtml(html, siteUrl, row.url);
        const intent = await runBlogLinksAddIntent(
          row,
          block.index,
          block.text,
          agentOptions,
          usedDestinationUrls,
          articleLinks,
        );
        if (intent?.proposedUrl && intent.anchorText) {
          const applied = applySingleLinkAdd(html, block.index, intent.anchorText, intent.proposedUrl);
          if (applied.result.ok) {
            return {
              html: applied.html,
              result: applied.result,
              addBlocks: paragraphBlocksForLinkAdds(applied.html),
              action: {
                action: "add",
                paragraphIndex: block.index,
                anchorText: intent.anchorText,
                proposedUrl: intent.proposedUrl,
                rationale: intent.proposedKeyword,
              },
            };
          }
        }
      } catch (err) {
        logBlogLinksActivity("add_error", {
          url: row.url,
          message: err instanceof Error ? err.message : "add failed",
        });
      }
    }
  }

  return {
    html,
    result: { anchor: userAnchor, url: userHref, paragraphIndex: 0, ok: false },
    addBlocks,
  };
}

async function addLinksByBudget(
  row: BlogLinksCatalogRow,
  html: string,
  agentOptions: BlogLinksAgentOptions,
  setters: LinksHarnessSetters,
  url: string,
  linkActions: BlogLinksLinkAction[],
  applyMarkdownCtx: {
    replacements: BlogLinksReplaceResult[];
    intentKeywords: string[];
  },
  seedAdditions: BlogLinksAddResult[] = [],
  usedBlockIndicesSeed?: Set<number>,
): Promise<{ html: string; additionsOk: number; additions: BlogLinksAddResult[] }> {
  let out = html;
  let additionsOk = seedAdditions.filter((a) => a.ok).length;
  const additions: BlogLinksAddResult[] = [...seedAdditions];
  let addBlocks = paragraphBlocksForLinkAdds(out);

  const usedBlockIndices = usedBlockIndicesSeed ?? new Set<number>();
  for (const entry of seedAdditions) {
    if (entry.ok) usedBlockIndices.add(entry.paragraphIndex);
  }

  for (let i = 0; i < row.linksToAdd; i += 1) {
    const slot = await applyOneLinkAddSlot(row, out, agentOptions, addBlocks, usedBlockIndices);
    const result = slot.result;

    if (slot.result.ok) {
      out = slot.html;
      usedBlockIndices.add(slot.result.paragraphIndex);
      addBlocks = slot.addBlocks;
      additionsOk += 1;
      if (slot.action) linkActions.push(slot.action);
    }

    additions.push(result);
    emitLinksHarnessStreamMarkdown(
      url,
      setters,
      LINKS_SECTION_ANALYZE,
      linksHarnessSectionTitle(row, LINKS_SECTION_ANALYZE),
      formatLinksAnalyzeAndApplyMarkdown(
        row,
        applyMarkdownCtx.replacements,
        additions,
        applyMarkdownCtx.intentKeywords,
      ),
    );
  }

  return { html: out, additionsOk, additions };
}

async function runOneBlogLinksRow(
  row: BlogLinksCatalogRow,
  rowNum: number,
  total: number,
  agentOptions: BlogLinksAgentOptions,
  setters: LinksHarnessSetters,
): Promise<BlogLinksRowPatch | null> {
  const url = row.url.trim();
  const siteUrl = agentOptions.siteUrl?.trim();
  if (!siteUrl) return null;

  resetRowHarnessSections(url, row, setters);
  logBlogLinksActivity("row_start", {
    url: row.url,
    rowNum,
    total,
    existingLinks: row.existingLinks.length,
    adds: row.linksToAdd,
  });

  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        urlStatuses: { ...(current.urlStatuses || {}), [url]: "optimizing" },
        currentUrl: url,
        currentIndex: rowNum - 1,
      },
    };
  });

  setLinksHarnessMessage(
    setters,
    `Links ${rowNum}/${total}: ${row.title || url}`,
    10 + Math.round(((rowNum - 1) / Math.max(total, 1)) * 85),
  );

  await fetchGscHarnessStep(row, siteUrl, setters, agentOptions.signal);
  emitAnalyzeHarness(row, setters);

  const linkActions: BlogLinksLinkAction[] = [];
  const {
    html: afterRewrite,
    replacements,
    replacementsOk,
    intentKeywords,
  } = await rewriteExistingLinks(row, row.html, agentOptions, setters, url, linkActions);

  let addHtml = afterRewrite;
  const manualAdditions: BlogLinksAddResult[] = [];
  const usedBlockIndices = new Set<number>();
  let addBlocks = paragraphBlocksForLinkAdds(addHtml);
  const manualTargets = (row.userLinkTargets ?? []).slice(row.existingLinks.length);

  for (const hint of manualTargets) {
    const slot = await applyOneLinkAddSlot(
      row,
      addHtml,
      agentOptions,
      addBlocks,
      usedBlockIndices,
      hint,
    );
    manualAdditions.push(slot.result);
    if (slot.result.ok) {
      addHtml = slot.html;
      usedBlockIndices.add(slot.result.paragraphIndex);
      addBlocks = slot.addBlocks;
      if (slot.action) linkActions.push(slot.action);
    }
    emitLinksHarnessStreamMarkdown(
      url,
      setters,
      LINKS_SECTION_ANALYZE,
      linksHarnessSectionTitle(row, LINKS_SECTION_ANALYZE),
      formatLinksAnalyzeAndApplyMarkdown(row, replacements, manualAdditions, intentKeywords),
    );
  }

  const { html: finalHtml, additionsOk, additions } = await addLinksByBudget(
    row,
    addHtml,
    agentOptions,
    setters,
    url,
    linkActions,
    { replacements, intentKeywords },
    manualAdditions,
    usedBlockIndices,
  );

  emitRowHarnessDone(
    url,
    row,
    setters,
    LINKS_SECTION_ANALYZE,
    "analyze_done",
    formatLinksAnalyzeAndApplyMarkdown(row, replacements, additions, intentKeywords),
  );

  const manualOk = manualAdditions.some((m) => m.ok);
  if (replacementsOk === 0 && additionsOk === 0 && !manualOk) {
    return null;
  }

  const plan: BlogLinksPlanResult = { linkActions };

  return {
    blogLinkList: extractInternalLinksFromHtml(finalHtml, siteUrl, row.url),
    blogLinksPlanJson: JSON.stringify(plan),
    postContentOptimized: finalHtml,
    blogLinksRanAtIso: new Date().toISOString(),
    elementorSourceJson: row.elementorSourceJson,
  };
}

export type RunOverviewLinksHarnessBatchParams = {
  catalog: BlogLinksCatalogRow[];
  linkPool: BlogLinksSiteLinkPool;
  agentOptions: BlogLinksAgentOptions;
  harnessSetters: LinksHarnessSetters;
  cacheWrite: AiseoCacheWriteAccumulator;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
};

export async function runOverviewLinksHarnessBatch(
  params: RunOverviewLinksHarnessBatchParams,
): Promise<{ ok: number; failed: number; skipped: number }> {
  const { catalog, agentOptions, harnessSetters, cacheWrite, uploadAfterRowWrite } = params;
  if (!catalog.length) return { ok: 0, failed: 0, skipped: 0 };

  logBlogLinksActivity("batch_start", { catalogSize: catalog.length });
  await ensureMasterInstructionsInMemory(agentOptions.siteId ?? null);

  const pageRanges = overviewBulkPageRanges(catalog.length);
  let ok = 0;
  let failed = 0;

  for (const { start, end, page, pageCount } of pageRanges) {
    const pageCatalog = catalog.slice(start, end);
    setOverviewBulkHarnessPageState({
      batchKey: harnessSetters.batchKey,
      siteId: harnessSetters.siteId,
      page,
      pageCount,
      start,
      end,
      total: catalog.length,
      setBulkOptimizationState: harnessSetters.setBulkOptimizationState,
      setOptimizationProgress: harnessSetters.setOptimizationProgress,
      step: "Links",
    });

    await mapOverviewAiCopyWithConcurrency(
      pageCatalog.map((row, localIndex) => ({
        row,
        globalRowNum: start + localIndex + 1,
      })),
      async ({ row, globalRowNum }) => {
      const url = row.url.trim();
      try {
        const patch = await runOneBlogLinksRow(
          row,
          globalRowNum,
          catalog.length,
          agentOptions,
          harnessSetters,
        );
        if (!patch) {
          failed += 1;
          markLinksRowError(url, row.index, harnessSetters, "No link changes applied");
          return;
        }
        finishLinksRowHarness(url, row.index, patch, harnessSetters, cacheWrite);
        if (uploadAfterRowWrite && patch.postContentOptimized?.trim()) {
          let planPayload: unknown = patch.blogLinksPlanJson;
          try {
            planPayload = JSON.parse(patch.blogLinksPlanJson);
          } catch {
            planPayload = patch.blogLinksPlanJson;
          }
          const elementFile = buildAiseoElementJsonFile("links-plan.json", planPayload);
          const rowFiles = aiseoRowFilesForUpload({
            runKind: "aiLinks",
            url,
            elementFiles: elementFile ? [elementFile] : [],
            postHtml: patch.postContentOptimized.trim(),
          });
          await uploadAfterRowWrite({
            index: row.index,
            url,
            html: patch.postContentOptimized.trim(),
            rowFiles: rowFiles.length ? rowFiles : undefined,
          });
        }
        ok += 1;
      } catch (err) {
        failed += 1;
        logBlogLinksActivity("row_error", {
          url: row.url,
          message: err instanceof Error ? err.message : "Links optimization failed",
        });
        markLinksRowError(
          url,
          row.index,
          harnessSetters,
          err instanceof Error ? err.message : "Links optimization failed",
        );
      }
    },
    );
  }

  logBlogLinksActivity("batch_done", { ok, failed });
  return { ok, failed, skipped: 0 };
}
