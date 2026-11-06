import { useCallback } from "react";
import { flushSync } from "react-dom";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN, NOTIFY_NO_WORDPRESS_BODY_FOR_THIS_URL_KEYWORD_U, notifyFocusKeywordsDerivedForXRowS, notifyKeywordDerivationFailedForXRowS, notifyKeywordsFinishedXUpdatedXFailed, notifySetDateModifierToXForAllRows } from "@/lib/notify-messages";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { stripHtmlForKeywordContext } from "@/lib/overview/overview-row-helpers";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
import { initBulkSliceWithStatus } from "@/lib/overview/overview-bulk-inline-status";
import {
  advanceBulkSliceBatchProgress,
  buildKeywordBatchPipelineSteps,
  initBulkSliceBatchHarness,
  setBatchStepStatus,
} from "@/lib/overview/overview-batch-pipeline-progress";
import type { MetaBulkActionKey } from "@/components/overview/overview-tab-constants";
import {
  OVERVIEW_KEYWORD_BATCH_SIZE,
  OVERVIEW_KEYWORD_BODY_PREFETCH_CONCURRENCY,
} from "@/lib/overview/overview-keyword-batch-constants";
import type { OverviewKeywordCatalogRow } from "@/lib/overview/overview-keyword-batch-agent";
import { normalizeOverviewKeywordUrlKey } from "@/lib/overview/overview-keyword-batch-parse";
import { pathSlugToFocusHint } from "@/lib/overview/focus-keyword-path-hint";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { overviewBulkRowIndices, overviewRowInBulkScope } from "@/lib/overview/overview-bulk-row-scope";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import {
  overviewDateModifierTodayIso,
  pushOverviewDateModifiersToAcfForUrls,
  pushOverviewRowDateModifierToAcf,
} from "@/lib/overview/overview-bulk-seo-payload";

type Args = Pick<
  OverviewTabBase,
  | "rows"
  | "setRows"
  | "deriveEntityKeyword"
  | "deriveFocusKeywordFromPageContext"
  | "deriveFocusKeywordsFromPageContextBatch"
  | "deriveEntityKeywordsBatch"
  | "updateRow"
  | "setBulkActionProgress"
> & {
  site: WordPressSite | undefined;
  sitemapSource: OverviewSitemapSource;
  bindings: OverviewTabBase["bindings"];
  resolveBindings: OverviewTabBase["resolveBindings"];
  resolvePostBodyHtmlForSentiment: OverviewTabBase["resolvePostBodyHtmlForSentiment"];
  bulkScopeUrlKeys: Set<string>;
};

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const n = items.length;
  const ret: R[] = new Array(n);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = next++;
      if (idx >= n) return;
      ret[idx] = await fn(items[idx]!, idx);
    }
  }
  const workers = Math.min(Math.max(1, concurrency), n);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return ret;
}

export function useOverviewTabKeywordsDates({
  site,
  rows,
  setRows,
  bindings,
  resolveBindings,
  resolvePostBodyHtmlForSentiment,
  deriveEntityKeyword,
  deriveFocusKeywordFromPageContext,
  deriveFocusKeywordsFromPageContextBatch,
  deriveEntityKeywordsBatch,
  updateRow,
  setBulkActionProgress,
  sitemapSource,
  bulkScopeUrlKeys,
}: Args) {
  const handleEntityKeywordRow = useCallback(
    async (
      index: number,
      options?: { skipFocusKeywordLoading?: boolean },
    ): Promise<string | null> => {
      const row = rows[index];
      if (!row) return null;
      updateRow(index, { status: "ai-focus-kw" });
      const result = await deriveEntityKeyword(
        row.url,
        row.title,
        row.metaDescription,
        options?.skipFocusKeywordLoading ? { skipLoadingState: true } : undefined,
      );
      if (!result) {
        updateRow(index, { status: "error" });
        return null;
      }
      updateRow(index, { focusKeyword: result, status: "idle" });
      return result;
    },
    [rows, deriveEntityKeyword, updateRow],
  );

  const fetchPlainTextBodyForRow = useCallback(
    async (row: OverviewRow): Promise<string | undefined> => {
      if (!site) return undefined;
      try {
        let binding = bindings[row.url];
        if (!binding) {
          const singleBindingMap = await resolveBindings([row.url], site, undefined, {
            inventoryOnly: true,
          });
          binding = singleBindingMap[row.url];
        }
        if (!binding?.postId) return undefined;
        const html = await resolvePostBodyHtmlForSentiment(row, binding);
        if (!html) return undefined;
        const plain = stripHtmlForKeywordContext(html);
        return plain.length > 0 ? plain.slice(0, 12000) : undefined;
      } catch {
        return undefined;
      }
    },
    [site, bindings, resolveBindings, resolvePostBodyHtmlForSentiment],
  );

  const handleContentAiKeywordRow = useCallback(
    async (
      index: number,
      options?: {
        skipFocusKeywordLoading?: boolean;
        suppressNoBodyToast?: boolean;
        preserveRowStatus?: boolean;
      },
    ): Promise<string | null> => {
      const row = rows[index];
      if (!row) return null;
      if (!options?.preserveRowStatus) {
        updateRow(index, { status: "ai-focus-kw" });
      }
      const body = await fetchPlainTextBodyForRow(row);
      if (site && !body && !options?.suppressNoBodyToast) {
        notify.info(
          "No WordPress body for this URL - keyword uses title, meta, and FAQ only. Connect the site and resolve the post, or scrape first.",
        );
      }
      const result = await deriveFocusKeywordFromPageContext(
        row.url,
        row.title,
        row.metaDescription,
        row.faq,
        body,
        {
          ...(options?.skipFocusKeywordLoading ? { skipLoadingState: true as const } : {}),
          seoResearchBrief: row.seoResearch ?? "",
        },
      );
      if (!result) {
        updateRow(index, { status: "error" });
        return null;
      }
      updateRow(index, {
        focusKeyword: result,
        status: options?.preserveRowStatus && row.status === "research-faq" ? "research-faq" : "idle",
      });
      return result;
    },
    [rows, updateRow, fetchPlainTextBodyForRow, deriveFocusKeywordFromPageContext, site],
  );

  const runKeywordBulkInBatches = useCallback(
    async (opts: {
      indices?: number[];
      mode: "content" | "entity";
      progressKey?: MetaBulkActionKey;
      silent?: boolean;
      successMessage?: string;
      singleBatch?: boolean;
      preserveRowStatus?: boolean;
      skipProgressSlice?: boolean;
    }) => {
      const {
        indices: indicesOverride,
        mode,
        progressKey = mode === "content" ? "contentKw" : "entityKw",
        silent = false,
        successMessage,
        singleBatch = false,
        preserveRowStatus = false,
        skipProgressSlice = false,
      } = opts;
      const indices =
        indicesOverride && indicesOverride.length > 0
          ? indicesOverride
          : overviewBulkRowIndices(rows, bulkScopeUrlKeys);
      if (!indices.length) return { ensured: 0, failed: 0, keywordsByIndex: new Map<number, string>() };

      const total = indices.length;
      const batchSize = singleBatch ? total : OVERVIEW_KEYWORD_BATCH_SIZE;
      const batchCount = singleBatch ? 1 : Math.ceil(total / batchSize);
      const keywordsByIndex = new Map<number, string>();
      const bodyPrefetchConcurrency = singleBatch
        ? Math.min(total, 20)
        : OVERVIEW_KEYWORD_BODY_PREFETCH_CONCURRENCY;

      const statusLabel = mode === "content" ? "Focus keywords" : "Entity keywords";
      let pipelineSteps = buildKeywordBatchPipelineSteps(
        batchCount,
        batchSize,
        total,
        statusLabel,
      );
      let failed = 0;

      if (!skipProgressSlice) {
        setBulkActionProgress((p) => ({
          ...p,
          [progressKey]: {
            ...initBulkSliceWithStatus(progressKey, total, 0),
            totalRows: batchCount,
            pipelineSteps,
          },
        }));
      }

      let completed = 0;
      const bumpBy = (n: number, batchIndex: number) => {
        completed = Math.min(total, completed + n);
        pipelineSteps = setBatchStepStatus(pipelineSteps, batchIndex, "done");
        if (skipProgressSlice) return;
        flushSync(() => {
          setBulkActionProgress((p) => ({
            ...p,
            [progressKey]: {
              ...initBulkSliceWithStatus(progressKey, total, completed),
              completed,
              totalRows: batchCount,
              pipelineSteps,
            },
          }));
        });
      };

      try {
        for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
          const start = batchIndex * batchSize;
          const chunkIndices = indices.slice(start, start + batchSize);

          pipelineSteps = setBatchStepStatus(pipelineSteps, batchIndex, "running");
          if (!skipProgressSlice) {
            flushSync(() => {
              setBulkActionProgress((p) => ({
                ...p,
                [progressKey]: {
                  ...initBulkSliceWithStatus(progressKey, total, start),
                  completed: start,
                  totalRows: batchCount,
                  pipelineSteps,
                },
              }));
            });
          }

          if (!preserveRowStatus) {
            for (const i of chunkIndices) {
              updateRow(i, { status: "ai-focus-kw" });
            }
          }

          let bodyByUrl = new Map<string, string | undefined>();
          if (mode === "content") {
            const chunkRows = chunkIndices.map((i) => rows[i]!).filter(Boolean);
            const bodies = await mapWithConcurrency(
              chunkRows,
              bodyPrefetchConcurrency,
              (row) => fetchPlainTextBodyForRow(row),
            );
            bodyByUrl = new Map(
              chunkRows.map((row, j) => [normalizeOverviewKeywordUrlKey(row.url), bodies[j]]),
            );
          }

          const catalog: OverviewKeywordCatalogRow[] = chunkIndices.map((i) => {
            const row = rows[i]!;
            const base: OverviewKeywordCatalogRow = {
              url: row.url,
              title: row.title ?? "",
              meta: row.metaDescription ?? "",
              faq: row.faq,
            };
            if (mode === "content") {
              const body = bodyByUrl.get(normalizeOverviewKeywordUrlKey(row.url));
              if (body) base.bodyExcerpt = body;
              const brief = row.seoResearch?.trim();
              if (brief) base.seoResearchBrief = brief;
              const hint = pathSlugToFocusHint(row.url);
              if (hint) base.pathHint = hint;
            }
            return base;
          });

          const keywordMap =
            mode === "content"
              ? await deriveFocusKeywordsFromPageContextBatch(catalog)
              : await deriveEntityKeywordsBatch(catalog);

          const missingIndices: number[] = [];
          for (const i of chunkIndices) {
            const row = rows[i];
            if (!row) continue;
            if (!keywordMap.has(normalizeOverviewKeywordUrlKey(row.url))) {
              missingIndices.push(i);
            }
          }

          setRows((prev) =>
            prev.map((row, i) => {
              if (!chunkIndices.includes(i)) return row;
              const kw = keywordMap.get(normalizeOverviewKeywordUrlKey(row.url));
              if (kw) {
                keywordsByIndex.set(i, kw);
                const nextStatus =
                  preserveRowStatus && row.status === "research-faq" ? "research-faq" : "idle";
                return { ...row, focusKeyword: kw, status: nextStatus as typeof row.status };
              }
              return { ...row, status: "error" as const };
            }),
          );

          for (const i of missingIndices) {
            try {
              let fallbackKw: string | null = null;
              if (mode === "content") {
                fallbackKw = await handleContentAiKeywordRow(i, {
                  skipFocusKeywordLoading: true,
                  suppressNoBodyToast: true,
                  preserveRowStatus,
                });
              } else {
                fallbackKw = await handleEntityKeywordRow(i, { skipFocusKeywordLoading: true });
              }
              if (fallbackKw) {
                keywordsByIndex.set(i, fallbackKw);
              } else {
                failed += 1;
              }
            } catch {
              updateRow(i, { status: "error" });
              failed += 1;
            }
          }

          bumpBy(chunkIndices.length, batchIndex);
        }
        const ensured = total - failed;
        if (!silent && successMessage) {
          notify.success(successMessage);
        }
        return { ensured, failed, keywordsByIndex };
      } finally {
        if (!skipProgressSlice) {
          setBulkActionProgress((p) => {
            const next = { ...p };
            delete next[progressKey];
            return next;
          });
        }
      }
    },
    [
      rows,
      setRows,
      setBulkActionProgress,
      updateRow,
      fetchPlainTextBodyForRow,
      deriveFocusKeywordsFromPageContextBatch,
      deriveEntityKeywordsBatch,
      handleContentAiKeywordRow,
      handleEntityKeywordRow,
      bulkScopeUrlKeys,
    ],
  );

  const ensureOverviewKeywordsForMissingRows = useCallback(
    async (options?: {
      progressKey?: MetaBulkActionKey;
      silent?: boolean;
      singleBatch?: boolean;
      preserveRowStatus?: boolean;
      skipProgressSlice?: boolean;
    }) => {
      const missingIndices = overviewBulkRowIndices(rows, bulkScopeUrlKeys).filter(
        (index) => !rows[index]?.focusKeyword?.trim(),
      );
      if (!missingIndices.length) {
        return { ensured: 0, failed: 0, keywordsByIndex: new Map<number, string>() };
      }
      const mode = sitemapSource === "sap" ? "entity" : "content";
      return runKeywordBulkInBatches({
        indices: missingIndices,
        mode,
        progressKey: options?.skipProgressSlice ? undefined : (options?.progressKey ?? "research"),
        silent: options?.silent ?? true,
        singleBatch: options?.singleBatch,
        preserveRowStatus: options?.preserveRowStatus,
        skipProgressSlice: options?.skipProgressSlice,
      });
    },
    [rows, sitemapSource, runKeywordBulkInBatches, bulkScopeUrlKeys],
  );

  const pushDateModifierToAcfForRow = useCallback(
    async (rowIndex: number, dateIso?: string) => {
      if (!site?.username?.trim() || !site.appPassword?.trim()) return;
      const row = rows[rowIndex];
      if (!row) return;
      const iso = (dateIso ?? row.dateModifier ?? "").trim();
      if (!iso) return;
      const bindingMap = await resolveBindings([row.url], site);
      const binding = bindingMap[row.url];
      if (!binding?.postId) return;
      await pushOverviewRowDateModifierToAcf(site, binding, iso);
    },
    [site, rows, resolveBindings],
  );

  const patchRowDateModifierByUrl = useCallback(
    (url: string, dateIso: string) => {
      const key = normalizePageUrlKey(url);
      const idx = rows.findIndex((r) => normalizePageUrlKey(r.url) === key);
      if (idx >= 0) updateRow(idx, { dateModifier: dateIso });
    },
    [rows, updateRow],
  );

  const commitRowDateModifierByUrl = useCallback(
    (url: string) => {
      const key = normalizePageUrlKey(url);
      const idx = rows.findIndex((r) => normalizePageUrlKey(r.url) === key);
      if (idx >= 0) void pushDateModifierToAcfForRow(idx);
    },
    [rows, pushDateModifierToAcfForRow],
  );

  const commitRowDateModifier = useCallback(
    (rowIndex: number) => {
      void pushDateModifierToAcfForRow(rowIndex);
    },
    [pushDateModifierToAcfForRow],
  );

  const handleSetDateToday = useCallback(
    (rowIndex: number) => {
      const iso = overviewDateModifierTodayIso();
      updateRow(rowIndex, { dateModifier: iso });
      void pushDateModifierToAcfForRow(rowIndex, iso);
    },
    [updateRow, pushDateModifierToAcfForRow],
  );

  const handleSetAllDatesToday = useCallback(() => {
    if (bulkScopeUrlKeys.size === 0) return;
    setBulkActionProgress((p) => ({
      ...p,
      dates: initBulkSliceWithStatus("dates", 1, 0),
    }));
    const iso = overviewDateModifierTodayIso();
    const scopedUrls = rows
      .filter((row) => overviewRowInBulkScope(row.url, bulkScopeUrlKeys))
      .map((row) => row.url);
    setRows((prev) =>
      prev.map((row) =>
        overviewRowInBulkScope(row.url, bulkScopeUrlKeys) ? { ...row, dateModifier: iso } : row,
      ),
    );
    if (site && scopedUrls.length > 0) {
      void pushOverviewDateModifiersToAcfForUrls(site, bindings, rows, scopedUrls, iso);
    }
    setBulkActionProgress((p) => ({
      ...p,
      dates: initBulkSliceWithStatus("dates", 1, 1),
    }));
    notify.success(notifySetDateModifierToXForAllRows(iso));
    window.setTimeout(() => {
      setBulkActionProgress((p) => {
        const next = { ...p };
        delete next.dates;
        return next;
      });
    }, 400);
  }, [bulkScopeUrlKeys, setRows, setBulkActionProgress, site, bindings, rows]);

  const handleKeywordsAll = useCallback(async () => {
    if (bulkScopeUrlKeys.size === 0) return;
    if (!site) {
      notify.error(NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN);
      return;
    }
    const indices = overviewBulkRowIndices(rows, bulkScopeUrlKeys);
    if (!indices.length) return;

    const mode = sitemapSource === "sap" ? "entity" : "content";
    const progressKey = mode === "content" ? "contentKw" : "entityKw";
    const total = indices.length;
    const statusLabel = mode === "content" ? "Focus keywords" : "Entity keywords";
    setBulkActionProgress((p) => ({
      ...p,
      [progressKey]: initBulkSliceBatchHarness(
        initBulkSliceWithStatus(progressKey, total, 0),
        total,
        statusLabel,
      ),
    }));

    let completed = 0;
    let ensured = 0;
    let failed = 0;
    const bump = () => {
      completed += 1;
      setBulkActionProgress((p) => {
        const cur = p[progressKey];
        if (!cur) return p;
        return {
          ...p,
          [progressKey]: advanceBulkSliceBatchProgress(cur, completed, total),
        };
      });
    };

    try {
      for (const i of indices) {
        const result =
          mode === "content"
            ? await handleContentAiKeywordRow(i, {
                skipFocusKeywordLoading: true,
                suppressNoBodyToast: true,
              })
            : await handleEntityKeywordRow(i, { skipFocusKeywordLoading: true });
        if (result) ensured += 1;
        else failed += 1;
        bump();
      }
    } finally {
      setBulkActionProgress((p) => {
        const next = { ...p };
        delete next[progressKey];
        return next;
      });
    }

    if (ensured > 0 && failed === 0) {
      notify.success(notifyFocusKeywordsDerivedForXRowS(ensured));
    } else if (ensured > 0 && failed > 0) {
      notify.warning(notifyKeywordsFinishedXUpdatedXFailed(ensured, failed));
    } else if (failed > 0) {
      notify.error(notifyKeywordDerivationFailedForXRowS(failed));
    }
  }, [
    bulkScopeUrlKeys,
    site,
    sitemapSource,
    rows,
    setBulkActionProgress,
    handleContentAiKeywordRow,
    handleEntityKeywordRow,
  ]);

  const handleAiKeywordRow = useCallback(
    async (index: number): Promise<string | null> => {
      if (sitemapSource === "sap") {
        return handleEntityKeywordRow(index);
      }
      return handleContentAiKeywordRow(index);
    },
    [sitemapSource, handleEntityKeywordRow, handleContentAiKeywordRow],
  );

  return {
    ensureOverviewKeywordsForMissingRows,
    handleKeywordsAll,
    handleAiKeywordRow,
    handleSetDateToday,
    handleSetAllDatesToday,
    patchRowDateModifierByUrl,
    commitRowDateModifierByUrl,
    commitRowDateModifier,
  };
}
