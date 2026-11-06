import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress, mergeOverviewHarnessProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";

import { initOverviewBulkHarnessPagination, setOverviewBulkHarnessPageState } from "@/lib/overview/overview-bulk-page-state";
import { mapOverviewAiCopyWithConcurrency } from "@/lib/overview/overview-ai-copy-concurrency";
import { overviewBulkPageRanges } from "@/lib/overview/overview-bulk-page-size";
import { extractInternalLinksFromHtml } from "@/lib/overview/overview-blog-links-extract";
import {
  insertWikipediaLink,
  isWikipediaHref,
  resolveEntityAndWikiForOverviewRow,
} from "@/lib/overview/overview-blog-wikipedia-link-insert";
import { resolveOverviewSourceHtml } from "@/lib/overview/overview-blog-overview-prepend";
import { postBodyHtmlFromInventoryRow } from "@/lib/overview/overview-inventory-seo-fields";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { lookupOverviewInventoryHitForUrl } from "@/hooks/content-optimization/bulk-seo-extra-text-fast-path";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import type { AiseoCacheWriteAccumulator } from "@/lib/overview/overview-aiseo-cache-write";
import {
  aiseoRowFilesForUpload,
  buildAiseoElementJsonFile,
  mergeAiseoRowFinishFiles,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import {
  generatedFilesForUrl,
  storageKeyForUrlGeneratedFiles,
} from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;
type SetIsOptimizing = Dispatch<SetStateAction<Record<string, boolean>>>;

export type WikipediaLinkCatalogRow = {
  index: number;
  url: string;
  html: string;
  title: string;
  focusKeyword: string;
};

export type WikipediaLinkHarnessSetters = {
  siteId: string;
  batchKey: string;
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
};

export type WikipediaLinkRowPatch = {
  postContentOptimized: string;
  blogWikiLinksRanAtIso: string;
  blogWikiLinkList: Array<{ href: string; anchor: string }>;
  blogWikiLinkSummary: string;
};

export type WikipediaLinkRowOutcome =
  | { kind: "ok"; patch: WikipediaLinkRowPatch; summary: string; markdown: string }
  | { kind: "skipped"; summary: string; markdown: string };

export function buildWikipediaLinkStubCatalog(
  rows: OverviewRow[],
  indices: number[],
): WikipediaLinkCatalogRow[] {
  return indices
    .map((index) => {
      const row = rows[index];
      const url = row?.url?.trim();
      if (!row || !url) return null;
      return {
        index,
        url,
        html: "",
        title: (row.title || "").trim(),
        focusKeyword: (row.focusKeyword || "").trim(),
      };
    })
    .filter(Boolean) as WikipediaLinkCatalogRow[];
}

export function mergeWikipediaLinkCatalogHtml(
  stub: WikipediaLinkCatalogRow[],
  withHtml: WikipediaLinkCatalogRow[],
): WikipediaLinkCatalogRow[] {
  const byIndex = new Map(withHtml.map((c) => [c.index, c]));
  return stub.map((entry) => {
    const resolved = byIndex.get(entry.index);
    if (!resolved?.html?.trim()) return entry;
    return resolved;
  });
}

function formatWikiRowMarkdown(params: {
  pageTitle: string;
  url: string;
  entity?: string;
  wikiTitle?: string;
  wikiUrl?: string;
  anchor?: string;
  outcome: "ok" | "skipped";
  reason?: string;
}): string {
  const lines = [
    `# Wikipedia link — ${params.pageTitle}`,
    "",
    `URL: ${params.url}`,
  ];
  if (params.entity) lines.push(`Entity: ${params.entity}`);
  if (params.wikiTitle) lines.push(`Wikipedia: ${params.wikiTitle}`);
  if (params.wikiUrl) lines.push(`Link: ${params.wikiUrl}`);
  if (params.anchor) lines.push(`Anchor in body: ${params.anchor}`);
  if (params.outcome === "skipped" && params.reason) lines.push(`Result: ${params.reason}`);
  return lines.join("\n");
}

function markWikiRowActive(
  url: string,
  rowNum: number,
  setters: WikipediaLinkHarnessSetters,
): void {
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
}

function writeWikiRowFiles(
  url: string,
  setters: WikipediaLinkHarnessSetters,
  patch: WikipediaLinkRowPatch,
): void {
  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    const existingFiles = generatedFilesForUrl(current.urlGeneratedFiles, url);
    const storageKey = storageKeyForUrlGeneratedFiles(
      current.urlGeneratedFiles,
      url,
      current.urls,
    );
    const elementFile = buildAiseoElementJsonFile("wikipedia-link.json", {
      summary: patch.blogWikiLinkSummary,
      links: patch.blogWikiLinkList,
    });
    const mergedFiles = mergeAiseoRowFinishFiles({
      runKind: "aiWikipediaLink",
      url,
      existingFiles,
      elementFiles: elementFile ? [elementFile] : [],
      postHtml: patch.postContentOptimized,
    });
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        urlGeneratedFiles: {
          ...(current.urlGeneratedFiles || {}),
          [storageKey]: mergedFiles,
        },
      },
    };
  });
}

function markWikiRowStatus(
  url: string,
  setters: WikipediaLinkHarnessSetters,
  status: "completed" | "skipped" | "error",
): void {
  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        urlStatuses: { ...(current.urlStatuses || {}), [url]: status },
      },
    };
  });
}

function setWikiHarnessMessage(
  setters: WikipediaLinkHarnessSetters,
  progress?: number,
): void {
  const pct = progress ?? 5;
  setters.setOptimizationProgress((prev) => {
    const next = { ...(prev as Record<string, unknown>) };
    mergeOverviewHarnessProgressSiteAndBatch(next, setters.siteId, {
      step: "Wikipedia link",
      progress: pct,
      message: "Wikipedia link",
    });
    return next;
  });
  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: "Wikipedia link",
          progress: pct,
          message: "Wikipedia link",
        }),
      },
    };
  });
}

export function initOverviewWikipediaLinkHarnessBatchState(params: {
  site: WordPressSite;
  catalog: WikipediaLinkCatalogRow[];
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
    prepMessage = "Preparing Wikipedia link batch…",
  } = params;

  const batchKey = `${site.id}-batch`;
  const urls = catalog.map((c) => c.url.trim()).filter(Boolean);
  setOptimizingState(setIsOptimizingContent, batchKey, true);
  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgress(prev as Record<string, unknown>, site.id, {
      step: "Wikipedia link",
      progress: 2,
      message: prepMessage,
      harnessSections: [],
      harnessPlannedSectionCount: 1,
    }),
  );
  setBulkOptimizationState((prev) => ({
    ...prev,
    [batchKey]: {
      urls,
      currentIndex: 0,
      urlStatuses: {},
      currentStep: "Wikipedia link",
      currentUrl: urls[0],
      urlKeywords: {},
      runKind: "aiWikipediaLink",
      urlHarnessSections: {},
      urlGeneratedFiles: {},
      currentStepProgress: harnessStepProgress(undefined, {
        step: "Wikipedia link",
        progress: 2,
        message: prepMessage,
        harnessSections: [],
        harnessPlannedSectionCount: 1,
      }),
    },
  }));
  initOverviewBulkHarnessPagination(batchKey, urls.length, setBulkOptimizationState);
  return batchKey;
}

export function finalizeOverviewWikipediaLinkHarnessBatch(
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
      message: "Wikipedia link batch finished",
    });
    return next;
  });
}

export function buildWikipediaLinkCatalog(
  rows: OverviewRow[],
  indices: number[],
  bindings: Record<string, OverviewBinding | undefined>,
  site: WordPressSite,
  sitemapSource: OverviewSitemapSource | undefined,
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined,
  rowHtmlByIndex?: Record<number, string>,
): WikipediaLinkCatalogRow[] {
  const catalog: WikipediaLinkCatalogRow[] = [];
  for (const index of indices) {
    const row = rows[index];
    if (!row) continue;
    const trimmedUrl = row.url?.trim();
    if (!trimmedUrl) continue;

    const snapshotHit = lookupOverviewInventoryHitForUrl(site, trimmedUrl, sitemapSource);
    const invMatch =
      snapshotHit != null
        ? {
            row: snapshotHit.row,
            subtype:
              snapshotHit.source === "pages"
                ? ("page" as const)
                : snapshotHit.source === "posts"
                  ? ("post" as const)
                  : snapshotHit.source,
          }
        : getInventoryMatchForUrl(site, trimmedUrl);

    const inventoryHtml = snapshotHit?.row?.fields?.content?.trim() ?? "";
    const html =
      rowHtmlByIndex?.[index]?.trim() ||
      row.postContentOptimized?.trim() ||
      inventoryHtml ||
      row.postContent?.trim() ||
      resolveOverviewSourceHtml(row).trim() ||
      (invMatch?.row ? postBodyHtmlFromInventoryRow(invMatch.row)?.trim() : "") ||
      "";
    if (!html) continue;

    catalog.push({
      index,
      url: trimmedUrl,
      html,
      title: (row.title || "").trim(),
      focusKeyword: (row.focusKeyword || "").trim(),
    });
  }
  return catalog;
}

export async function runWikipediaLinkForCatalogRow(params: {
  entry: WikipediaLinkCatalogRow;
  overviewRow: OverviewRow;
  site: WordPressSite;
  sitemapSource?: OverviewSitemapSource;
  urlEntities?: Record<string, string>;
  apiKey: string;
  wikiCache?: Map<string, { url: string; title: string; matchLabel: string } | null>;
}): Promise<WikipediaLinkRowOutcome> {
  const { entry: row, overviewRow, site, sitemapSource, urlEntities, apiKey, wikiCache } = params;
  const cache = wikiCache ?? new Map<string, { url: string; title: string; matchLabel: string } | null>();
  const pageTitle = row.title || row.url;
  const resolved = await resolveEntityAndWikiForOverviewRow({
    row: overviewRow,
    site,
    sitemapSource,
    urlEntities,
    apiKey,
    wikiCache: cache,
  });
  if (!resolved) {
    const summary = `${pageTitle}: no Wikipedia page found`;
    return {
      kind: "skipped",
      summary,
      markdown: formatWikiRowMarkdown({
        pageTitle,
        url: row.url,
        outcome: "skipped",
        reason: "No Wikipedia page found for entity candidates",
      }),
    };
  }

  const html = row.html?.trim() ?? "";
  if (!html) {
    const summary = `${pageTitle}: ${resolved.wikiTitle} (no HTML body)`;
    return {
      kind: "ok",
      summary,
      markdown: formatWikiRowMarkdown({
        pageTitle,
        url: row.url,
        entity: resolved.entity,
        wikiTitle: resolved.wikiTitle,
        wikiUrl: resolved.wikiUrl,
        outcome: "ok",
      }),
      patch: {
        postContentOptimized: row.html,
        blogWikiLinksRanAtIso: new Date().toISOString(),
        blogWikiLinkList: [{ anchor: resolved.wikiTitle, href: resolved.wikiUrl }],
        blogWikiLinkSummary: summary,
      },
    };
  }

  const applied = insertWikipediaLink(
    html,
    resolved.linkEntity,
    resolved.wikiUrl,
    resolved.wikiTitle,
  );
  if (!applied.ok) {
    const summary = `${pageTitle}: ${resolved.wikiTitle} (already linked)`;
    const links = extractInternalLinksFromHtml(html, site.siteUrl, row.url)
      .filter((l) => isWikipediaHref(l.href))
      .map((l) => ({ href: l.href, anchor: l.anchor }));
    return {
      kind: "ok",
      summary,
      markdown: formatWikiRowMarkdown({
        pageTitle,
        url: row.url,
        entity: resolved.entity,
        wikiTitle: resolved.wikiTitle,
        wikiUrl: resolved.wikiUrl,
        outcome: "ok",
      }),
      patch: {
        postContentOptimized: html,
        blogWikiLinksRanAtIso: new Date().toISOString(),
        blogWikiLinkList: links.length
          ? links
          : [{ anchor: resolved.wikiTitle, href: resolved.wikiUrl }],
        blogWikiLinkSummary: summary,
      },
    };
  }

  const links = extractInternalLinksFromHtml(applied.html, site.siteUrl, row.url)
    .filter((l) => isWikipediaHref(l.href))
    .map((l) => ({ href: l.href, anchor: l.anchor }));

  const summary = `${pageTitle}: ${resolved.wikiTitle}`;
  const markdown = formatWikiRowMarkdown({
    pageTitle,
    url: row.url,
    entity: resolved.entity,
    wikiTitle: resolved.wikiTitle,
    wikiUrl: resolved.wikiUrl,
    anchor: applied.anchor,
    outcome: "ok",
  });

  return {
    kind: "ok",
    summary,
    markdown,
    patch: {
      postContentOptimized: applied.html,
      blogWikiLinksRanAtIso: new Date().toISOString(),
      blogWikiLinkList: links.length
        ? links
        : [{ anchor: applied.anchor || resolved.entity, href: resolved.wikiUrl }],
      blogWikiLinkSummary: summary,
    },
  };
}

export async function runOverviewWikipediaLinkHarnessBatch(params: {
  catalog: WikipediaLinkCatalogRow[];
  site: WordPressSite;
  sitemapSource: OverviewSitemapSource | undefined;
  apiKey: string;
  urlEntities?: Record<string, string>;
  rows: OverviewRow[];
  harnessSetters: WikipediaLinkHarnessSetters;
  updateRow: (index: number, patch: Partial<OverviewRow>) => void;
  cacheWrite?: AiseoCacheWriteAccumulator;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
}): Promise<{ ok: number; skipped: number; failed: number }> {
  const {
    catalog,
    site,
    sitemapSource,
    apiKey,
    urlEntities,
    rows,
    harnessSetters,
    updateRow,
    cacheWrite,
    uploadAfterRowWrite,
  } = params;
  if (!catalog.length) return { ok: 0, skipped: 0, failed: 0 };

  const wikiCache = new Map<string, { url: string; title: string; matchLabel: string } | null>();
  const pageRanges = overviewBulkPageRanges(catalog.length);
  let ok = 0;
  let skipped = 0;
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
      step: "Wikipedia link",
    });

    await mapOverviewAiCopyWithConcurrency(
      pageCatalog.map((entry, localIndex) => ({
        entry,
        globalRowNum: start + localIndex + 1,
      })),
      async ({ entry, globalRowNum }) => {
      const url = entry.url.trim();
      const pageTitle = entry.title || url;
      markWikiRowActive(url, globalRowNum, harnessSetters);
      setWikiHarnessMessage(
        harnessSetters,
        10 + Math.round(((globalRowNum - 1) / Math.max(catalog.length, 1)) * 85),
      );
      updateRow(entry.index, {
        status: "ai-wikipedia-link",
        blogWikiLinkSummary: `${pageTitle}: Wikipedia link…`,
      });

      try {
        const overviewRow = rows[entry.index]!;
        const outcome = await runWikipediaLinkForCatalogRow({
          entry,
          overviewRow,
          site,
          sitemapSource,
          urlEntities,
          apiKey,
          wikiCache,
        });
        if (outcome.kind === "skipped") {
          skipped += 1;
          markWikiRowStatus(url, harnessSetters, "skipped");
          updateRow(entry.index, {
            status: "idle",
            blogWikiLinkSummary: outcome.summary,
          });
          return;
        }
        updateRow(entry.index, {
          ...outcome.patch,
          status: "idle",
        });
        cacheWrite?.push(url, outcome.patch.postContentOptimized);
        writeWikiRowFiles(url, harnessSetters, outcome.patch);
        const rowFiles = aiseoRowFilesForUpload({
          runKind: "aiWikipediaLink",
          url,
          elementFiles: (() => {
            const elementFile = buildAiseoElementJsonFile("wikipedia-link.json", {
              summary: outcome.patch.blogWikiLinkSummary,
              links: outcome.patch.blogWikiLinkList,
            });
            return elementFile ? [elementFile] : [];
          })(),
          postHtml: outcome.patch.postContentOptimized,
        });
        if (uploadAfterRowWrite) {
          await uploadAfterRowWrite({
            index: entry.index,
            url,
            html: outcome.patch.postContentOptimized,
            rowFiles: rowFiles.length ? rowFiles : undefined,
          });
        }
        ok += 1;
        markWikiRowStatus(url, harnessSetters, "completed");
      } catch {
        failed += 1;
        const summary = `${pageTitle}: error`;
        markWikiRowStatus(url, harnessSetters, "error");
        updateRow(entry.index, { status: "error", blogWikiLinkSummary: summary });
      }
    },
    );
  }

  return { ok, skipped, failed };
}
