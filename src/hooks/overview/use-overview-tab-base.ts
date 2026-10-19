import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useOverviewSitemap } from "@/hooks/overview/use-overview-sitemap";
import { useOverviewScrape } from "@/hooks/overview/use-overview-scrape";
import { useOverviewAiOptimize } from "@/hooks/overview/use-overview-ai-optimize";
import { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import {
  useOverviewWordPressBinding,
  type OverviewBinding,
} from "@/hooks/overview/use-overview-wordpress-binding";
import { useOverviewDownloadFromSite } from "@/hooks/overview/use-overview-download";
import { useOverviewUploadToSite } from "@/hooks/overview/use-overview-upload";
import { createNAPSummary } from "@/lib/nap-kb-template";
import { buildPortfolioBlockedHosts } from "@/lib/portfolio-link-blocklist";
import { getWordPressPostContent } from "@/lib/wordpress-api";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { MetaBulkActionKey, BulkProgressSlice } from "@/components/overview/overview-tab-constants";
import { OVERVIEW_BULK_AI_FAQ_SEED_COUNT } from "@/components/overview/overview-tab-constants";
import { metaDisplayTitle } from "@/lib/overview/overview-tab-display";
import { sentimentHtmlFromInventoryRow } from "@/lib/overview/overview-inventory-seo-fields";
import type { OptimizationOptions } from "@/hooks/use-optimization-options";
import type { OverviewTabContentProps } from "@/components/overview/overview-tab/overview-tab-content-types";
import { OVERVIEW_SEO_EXTRA_BULK } from "@/components/overview/overview-tab/overview-tab-content-constants";
import {
  type OverviewSitemapSource,
} from "@/lib/overview/overview-sitemap-source";
import {
  getOverviewRowsSessionCache,
  setOverviewRowsSessionCache,
} from "@/lib/overview/overview-rows-session-cache";
import { resolveOverviewGridPaginationLayoutTotal } from "@/lib/overview/overview-grid-pagination-layout-total";
import {
  overviewRowIndexMatchesSemrushFilter,
  parseSemrushErrorCsv,
} from "@/lib/overview/parse-semrush-error-csv";
import {
  overviewRowMatchesErrorFilters,
  type OverviewRowErrorFilterKey,
} from "@/lib/overview/overview-row-error-filters";
import { useOverviewRowSelection } from "@/hooks/overview/use-overview-row-selection";
import { resolveOverviewBulkScopeUrlKeys } from "@/lib/overview/overview-bulk-row-scope";
import {
  overviewDateModifierTodayIso,
  patchOverviewRowsDateModifierForUrls,
  pushOverviewDateModifiersToAcfForUrls,
} from "@/lib/overview/overview-bulk-seo-payload";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { deferHarnessUiUpdate } from "@/lib/overview/overview-harness-ui-update";
import { getBlogModel } from "@/lib/optimization-settings-storage";

export function useOverviewTabBase({
  site,
  apiKey,
  selectedModel,
  temperature,
  maxTokens,
  topP,
  studioRowSource = "sitemap",
  onBulkGeneratorOverviewRowPatched,
}: OverviewTabContentProps) {
  const [sitemapSource, setSitemapSource] = useState<OverviewSitemapSource>("pages");
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const sitemapSourceRef = useRef(sitemapSource);
  sitemapSourceRef.current = sitemapSource;
  const [gscQuickWinsFile, setGscQuickWinsFile] = useState<string | null>(null);
  const [bulkActionProgress, setBulkActionProgress] = useState<
    Partial<Record<MetaBulkActionKey, BulkProgressSlice>>
  >({});
  const [bulkSeoCsvExportBusy, setBulkSeoCsvExportBusy] = useState(false);
  const [overviewMetaCsvExportBusy, setOverviewMetaCsvExportBusy] = useState(false);
  const [semrushFilterUrlKeys, setSemrushFilterUrlKeys] = useState<Set<string> | null>(null);
  const [semrushCsvFileName, setSemrushCsvFileName] = useState<string | null>(null);
  const [activeErrorFilters, setActiveErrorFilters] = useState<Set<OverviewRowErrorFilterKey>>(
    new Set(),
  );

  const opt = useWordPressOptimization();
  const overviewOpt = useMemo(
    () => ({
      ...opt,
      setBulkOptimizationState: ((action) => {
        deferHarnessUiUpdate(() => {
          opt.setBulkOptimizationState(action);
        });
      }) as typeof opt.setBulkOptimizationState,
      setOptimizationProgress: ((action) => {
        deferHarnessUiUpdate(() => {
          opt.setOptimizationProgress(action);
        });
      }) as typeof opt.setOptimizationProgress,
      setIsOptimizingContent: ((action) => {
        deferHarnessUiUpdate(() => {
          opt.setIsOptimizingContent(action);
        });
      }) as typeof opt.setIsOptimizingContent,
    }),
    [opt],
  );
  const contentOptDateSyncedRef = useRef(new Set<string>());
  const bulkBatchKey = site ? `${site.id}-batch` : "";
  const isOptimizingContentRef = useRef(opt.isOptimizingContent);
  isOptimizingContentRef.current = opt.isOptimizingContent;
  const bulkOptimizationStateRef = useRef(opt.bulkOptimizationState);
  bulkOptimizationStateRef.current = opt.bulkOptimizationState;

  const isMultiRowBulkActive = useCallback(() => {
    if (!bulkBatchKey) return false;
    if (!isOptimizingContentRef.current[bulkBatchKey]) return false;
    const batch = bulkOptimizationStateRef.current[bulkBatchKey];
    return (batch?.urls?.length ?? 0) > 1;
  }, [bulkBatchKey]);

  const { sites: wordPressSites } = useWordPressSites();
  const portfolioBlockedHostsForSemrush = useMemo(
    () => buildPortfolioBlockedHosts(wordPressSites, { excludeSiteId: site?.id }),
    [wordPressSites, site?.id],
  );
  const [expandedContentUrl, setExpandedContentUrl] = useState<string | null>(null);
  const [expandedResearchBriefUrl, setExpandedResearchBriefUrl] = useState<string | null>(null);
  const [expandedPageUrl, setExpandedPageUrl] = useState<string | null>(null);
  const toggleExpandedPageUrl = useCallback(
    (url: string) => setExpandedPageUrl((prev) => (prev === url ? null : url)),
    [],
  );
  const [sortColumn, setSortColumn] = useState<"title" | "date" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [gridPageIndex, setGridPageIndex] = useState(0);
  const {
    bindings,
    wpTitlesByUrl,
    resolveBindings,
    prefetchOverviewInventory,
    inventoryLoading,
    getInventoryRowForUrl,
    getInventoryMatchForUrl,
    acfExtraTextSupported,
    loading: bindingLoading,
    error: bindingError,
    activateInventoryCacheForSource,
    getCachedInventoryRowsForSource,
    remapBindingUrl,
    mergeInventoryContentForSource,
  } = useOverviewWordPressBinding(site?.id, sitemapSource);

  useEffect(() => {
    if (!site || !bulkBatchKey) return;
    const statuses = opt.bulkOptimizationState[bulkBatchKey]?.urlStatuses;
    if (!statuses) {
      contentOptDateSyncedRef.current.clear();
      return;
    }

    const statusValues = Object.values(statuses);
    if (statusValues.length > 0 && statusValues.every((status) => status === "pending")) {
      contentOptDateSyncedRef.current.clear();
    }

    const newlyOptimizing: string[] = [];
    for (const [url, status] of Object.entries(statuses)) {
      if (status !== "optimizing") continue;
      const key = normalizePageUrlKey(url);
      if (contentOptDateSyncedRef.current.has(key)) continue;
      contentOptDateSyncedRef.current.add(key);
      newlyOptimizing.push(url);
    }

    if (newlyOptimizing.length > 0) {
      const iso = overviewDateModifierTodayIso();
      const multiRowBulk = isMultiRowBulkActive();
      if (multiRowBulk) {
        const keys = new Set(newlyOptimizing.map((url) => normalizePageUrlKey(url)));
        rowsRef.current = rowsRef.current.map((row) =>
          keys.has(normalizePageUrlKey(row.url)) ? { ...row, dateModifier: iso } : row,
        );
      } else {
        patchOverviewRowsDateModifierForUrls(setRows, newlyOptimizing, iso);
        if (site.username?.trim() && site.appPassword?.trim()) {
          void pushOverviewDateModifiersToAcfForUrls(
            site,
            bindings,
            rowsRef.current,
            newlyOptimizing,
            iso,
          );
        }
      }
    }
  }, [opt.bulkOptimizationState, opt.isOptimizingContent, site, bulkBatchKey, setRows, bindings, isMultiRowBulkActive]);

  const getInventoryRow = useCallback(
    (url: string) => getInventoryRowForUrl(site, url),
    [site, getInventoryRowForUrl],
  );
  const { loading: downloadLoading, error: downloadError, downloadRow } = useOverviewDownloadFromSite();
  const { error: uploadError } = useOverviewUploadToSite();

  const wpPostBodyCacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    wpPostBodyCacheRef.current.clear();
  }, [site?.id]);

  const resolvePostBodyHtmlForSentiment = useCallback(
    async (row: OverviewRow, binding: OverviewBinding): Promise<string | undefined> => {
      if (!site) return undefined;
      const cacheKey = `${site.id}:${binding.postId}`;
      const cached = wpPostBodyCacheRef.current.get(cacheKey);
      if (cached) return cached;

      const invRow = getInventoryRowForUrl(site, row.url);
      const fromInv = sentimentHtmlFromInventoryRow(invRow, binding.postId);
      if (fromInv) {
        wpPostBodyCacheRef.current.set(cacheKey, fromInv);
        return fromInv;
      }
      // Inventory already bound this URL; skip per-post REST (phantom IDs, rate limits).
      if (invRow?.id != null && invRow.id === binding.postId) {
        return undefined;
      }

      try {
        const contentResult = await getWordPressPostContent(
          site.siteUrl,
          site.username,
          site.appPassword,
          [binding.postId],
          undefined,
          [{ id: binding.postId, subtype: binding.subtype }],
        );
        const post = contentResult.posts?.[0];
        const html = post?.content?.trim();
        if (html) {
          wpPostBodyCacheRef.current.set(cacheKey, html);
          return html;
        }
      } catch {
        // optional sentiment context
      }
      return undefined;
    },
    [site, getInventoryRowForUrl],
  );

  const bulkSeoExtraOptions = useMemo((): OptimizationOptions => {
    const base =
      opt.optimizationOptions[site.id] || {
        optimizeTitle: true,
        optimizeMeta: true,
        optimizeExcerpt: true,
        optimizeContent: true,
        optimizeFeaturedImage: false,
        autoOptimize: true,
        testMode: false,
        stagingSite: false,
      };
    return { ...base, ...OVERVIEW_SEO_EXTRA_BULK } as OptimizationOptions;
  }, [opt.optimizationOptions, site.id]);

  const {
    loading: sitemapLoading,
    error: sitemapError,
    loadSitemap,
    loadOverviewSitemapSource,
  } = useOverviewSitemap();

  useEffect(() => {
    if (studioRowSource === "bulk-generator") {
      return;
    }
    if (!site?.id) {
      setSitemapSource("pages");
      return;
    }
    setSitemapSource("pages");
  }, [site?.id, site?.sitemaps?.mainSitemapUrl, studioRowSource]);

  useEffect(() => {
    if (!site?.id) {
      setRows([]);
      return;
    }
    if (studioRowSource === "bulk-generator") {
      return;
    }
    let cancelled = false;
    const idleId = requestIdleCallback(
      () => {
        if (cancelled) return;
        const cached = (getOverviewRowsSessionCache(site.id, sitemapSource) ?? []).filter((row) =>
          Boolean(row.url?.trim()),
        );
        if (cached.length) {
          startTransition(() => {
            if (!cancelled) setRows(cached);
          });
        }
        activateInventoryCacheForSource(site.id, sitemapSource);
      },
      { timeout: 500 },
    );
    return () => {
      cancelled = true;
      cancelIdleCallback(idleId);
    };
  }, [site?.id, sitemapSource, activateInventoryCacheForSource, studioRowSource]);

  useEffect(() => {
    if (!site?.id || studioRowSource === "bulk-generator") return;
    return () => {
      if (site?.id) setOverviewRowsSessionCache(site.id, sitemapSource, rowsRef.current);
    };
  }, [site?.id, sitemapSource, studioRowSource]);

  const visibleRows = rows;

  const visibleRowsRef = useRef(visibleRows);
  visibleRowsRef.current = visibleRows;

  const displayRows = useMemo(() => {
    let base = visibleRows.filter((row) => Boolean(row.url?.trim()));
    if (semrushFilterUrlKeys) {
      base = base.filter((row) =>
        overviewRowIndexMatchesSemrushFilter(row.url, semrushFilterUrlKeys),
      );
    }
    if (activeErrorFilters.size > 0) {
      base = base.filter((row) => overviewRowMatchesErrorFilters(row, activeErrorFilters, visibleRows));
    }
    if (!sortColumn) return base;
    const copy = [...base];
    if (sortColumn === "title") {
      copy.sort((a, b) => {
        const c = metaDisplayTitle(a, wpTitlesByUrl).localeCompare(metaDisplayTitle(b, wpTitlesByUrl), undefined, {
          sensitivity: "base",
        });
        return sortDir === "asc" ? c : -c;
      });
    } else {
      copy.sort((a, b) => {
        const ta = a.wpDateGmt?.trim() ? Date.parse(a.wpDateGmt) : 0;
        const tb = b.wpDateGmt?.trim() ? Date.parse(b.wpDateGmt) : 0;
        const aVal = Number.isNaN(ta) ? 0 : ta;
        const bVal = Number.isNaN(tb) ? 0 : tb;
        const c = aVal - bVal;
        return sortDir === "asc" ? c : -c;
      });
    }
    return copy;
  }, [visibleRows, semrushFilterUrlKeys, activeErrorFilters, sortColumn, sortDir, wpTitlesByUrl]);

  const {
    selectedUrlKeys,
    selectedCount,
    toggleSelectedUrlKey,
    toggleSelectPageRows,
  } = useOverviewRowSelection({
    siteId: site?.id,
    sitemapSource,
    displayRows,
  });
  const bulkScopeUrlKeys = useMemo(
    () => resolveOverviewBulkScopeUrlKeys(selectedUrlKeys, displayRows),
    [selectedUrlKeys, displayRows],
  );
  const bulkScopeUrlKeysRef = useRef(bulkScopeUrlKeys);
  bulkScopeUrlKeysRef.current = bulkScopeUrlKeys;

  const displayRowsRef = useRef(displayRows);
  displayRowsRef.current = displayRows;

  useEffect(() => {
    setGridPageIndex(0);
  }, [sitemapSource, site?.id, displayRows.length, semrushFilterUrlKeys, activeErrorFilters]);

  useEffect(() => {
    setExpandedPageUrl(null);
  }, [site?.id, sitemapSource, gridPageIndex]);

  const gridPaginationLayoutTotal = useMemo(() => {
    if (!site?.id) return displayRows.length;
    return resolveOverviewGridPaginationLayoutTotal([site.id], displayRows.length);
  }, [site?.id, displayRows.length, sitemapSource]);

  const napSummary =
    site?.napInfo ? createNAPSummary(site.napInfo, site.locations) : undefined;
  const {
    loading: scrapeLoading,
    error: scrapeError,
    scrapeMetaForUrl,
  } = useOverviewScrape();
  const {
    loading: aiLoading,
    error: aiError,
    optimizeTitle,
    optimizeMeta,
    optimizeFaq,
    optimizeFaqQuestion,
    optimizeFaqAnswer,
    deriveEntityKeyword,
    deriveFocusKeywordFromPageContext,
    deriveFocusKeywordsFromPageContextBatch,
    deriveEntityKeywordsBatch,
    runAiAllMetaBatchForCatalog,
    deriveShortTailFocusKeywordFromResearch,
  } = useOverviewAiOptimize({
    apiKey,
    model: getBlogModel(site?.id) || selectedModel,
    temperature,
    maxTokens,
    topP,
    napSummary,
    wordPressSiteId: site?.id ?? null,
    wordPressSite: site ?? null,
  });

  const serpDumpUrl = useCallback((filename: string) => {
    const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
    if (base) return `${base}/api/dataforseo/serp-dump/${encodeURIComponent(filename)}`;
    return `/api/dataforseo/serp-dump/${encodeURIComponent(filename)}`;
  }, []);

  const getDfsSerpContext = useCallback(
    async (row: OverviewRow): Promise<string | undefined> => {
      if (!row.researchFileName) return undefined;
      try {
        const res = await fetch(serpDumpUrl(row.researchFileName));
        if (!res.ok) return undefined;
        const json = await res.json();
        const task = json?.tasks?.[0];
        const firstResult = Array.isArray(task?.result) ? task.result[0] : null;
        const items: unknown[] = Array.isArray(firstResult?.items) ? firstResult.items : [];

        const focus = (row.focusKeyword || "").toLowerCase();
        const serviceTerms = [
          "blind",
          "blinds",
          "shade",
          "shades",
          "shutter",
          "shutters",
          "curtain",
          "curtains",
          "drape",
          "drapes",
          "window treatment",
          "window treatments",
        ];

        const filteredItems = items.filter((item: Record<string, unknown>) => {
          const text = [item.title, item.description, item.snippet, item.question]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!text) return false;
          if (focus && text.includes(focus)) return true;
          return serviceTerms.some((term) => text.includes(term));
        });

        if (!filteredItems.length) return undefined;

        const slim = {
          keyword: task?.data?.keyword ?? json.keyword ?? null,
          result_items: filteredItems,
        };
        return JSON.stringify(slim).slice(0, 8000);
      } catch {
        return undefined;
      }
    },
    [serpDumpUrl],
  );

  const syncRowsFromRef = useCallback(() => {
    startTransition(() => {
      setRows(rowsRef.current);
    });
  }, []);

  const updateRow = useCallback((index: number, patch: Partial<OverviewRow>) => {
    const next = rowsRef.current.map((row, i) => {
      if (i !== index) return row;
      return { ...row, ...patch };
    });
    rowsRef.current = next;
    if (studioRowSource === "bulk-generator" && onBulkGeneratorOverviewRowPatched) {
      onBulkGeneratorOverviewRowPatched(index, patch);
    }
    const studioLiveKeys: (keyof OverviewRow)[] = [
      "postContent",
      "postContentOptimized",
      "elementorSectionHeaders",
      "elementorDataJson",
      "faq",
      "seoResearch",
      "aiTitle",
      "aiMeta",
      "title",
      "metaDescription",
    ];
    const flushStudioLive =
      patch.status !== undefined ||
      studioLiveKeys.some((key) => Object.prototype.hasOwnProperty.call(patch, key));
    if (flushStudioLive) {
      setRows(next);
      return;
    }
    startTransition(() => {
      setRows(next);
    });
  }, [studioRowSource, onBulkGeneratorOverviewRowPatched]);

  const setSemrushCsvUpload = useCallback((file: File) => {
    void file.text().then((text) => {
      setSemrushFilterUrlKeys(parseSemrushErrorCsv(text));
      setSemrushCsvFileName(file.name);
    });
  }, []);

  const clearSemrushCsvUpload = useCallback(() => {
    setSemrushFilterUrlKeys(null);
    setSemrushCsvFileName(null);
  }, []);

  const toggleErrorFilter = useCallback((key: OverviewRowErrorFilterKey) => {
    setActiveErrorFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearErrorFilters = useCallback(() => {
    setActiveErrorFilters(new Set());
  }, []);

  return {
    sitemapSource,
    setSitemapSource,
    rows,
    setRows,
    rowsRef,
    gscQuickWinsFile,
    setGscQuickWinsFile,
    bulkActionProgress,
    setBulkActionProgress,
    bulkAiFaqSeedCount: OVERVIEW_BULK_AI_FAQ_SEED_COUNT,
    bulkSeoCsvExportBusy,
    setBulkSeoCsvExportBusy,
    overviewMetaCsvExportBusy,
    setOverviewMetaCsvExportBusy,
    opt: overviewOpt,
    syncOpt: opt,
    portfolioBlockedHostsForSemrush,
    expandedContentUrl,
    setExpandedContentUrl,
    expandedResearchBriefUrl,
    setExpandedResearchBriefUrl,
    expandedPageUrl,
    setExpandedPageUrl,
    toggleExpandedPageUrl,
    sortColumn,
    setSortColumn,
    sortDir,
    setSortDir,
    gridPageIndex,
    setGridPageIndex,
    gridPaginationLayoutTotal,
    bindings,
    wpTitlesByUrl,
    resolveBindings,
    prefetchOverviewInventory,
    getCachedInventoryRowsForSource,
    mergeInventoryContentForSource,
    inventoryLoading,
    getInventoryRowForUrl,
    getInventoryMatchForUrl,
    acfExtraTextSupported,
    bindingLoading,
    bindingError,
    getInventoryRow,
    downloadLoading,
    downloadError,
    downloadRow,
    uploadError,
    resolvePostBodyHtmlForSentiment,
    bulkSeoExtraOptions,
    sitemapLoading,
    sitemapError,
    loadSitemap,
    loadOverviewSitemapSource,
    displayRows,
    displayRowsRef,
    selectedUrlKeys,
    selectedCount,
    toggleSelectedUrlKey,
    toggleSelectPageRows,
    bulkScopeUrlKeys,
    bulkScopeUrlKeysRef,
    visibleRows,
    visibleRowsRef,
    scrapeLoading,
    scrapeError,
    scrapeMetaForUrl,
    aiLoading,
    aiError,
    optimizeTitle,
    optimizeMeta,
    optimizeFaq,
    optimizeFaqQuestion,
    optimizeFaqAnswer,
    deriveEntityKeyword,
    deriveFocusKeywordFromPageContext,
    deriveFocusKeywordsFromPageContextBatch,
    deriveEntityKeywordsBatch,
    runAiAllMetaBatchForCatalog,
    deriveShortTailFocusKeywordFromResearch,
    serpDumpUrl,
    getDfsSerpContext,
    updateRow,
    syncRowsFromRef,
    remapBindingUrl,
    semrushFilterUrlKeys,
    semrushCsvFileName,
    setSemrushCsvUpload,
    clearSemrushCsvUpload,
    activeErrorFilters,
    toggleErrorFilter,
    clearErrorFilters,
  };
}

export type OverviewTabBase = ReturnType<typeof useOverviewTabBase>;
