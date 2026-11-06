import { useCallback } from "react";
import type { MutableRefObject } from "react";
import { flushSync } from "react-dom";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_A_BULK_RUN_IS_ALREADY_IN_PROGRESS, NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN, notifyFinishedResearchForXRowSDataforseo, notifyResearchFailedForAllXRowSBriefJs, notifyResearchFinishedXXBriefJsonUpdated, notifyResearchRanOnXRowSButBriefJsonW } from "@/lib/notify-messages";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { isProductionBackendMisconfigured } from "@/lib/mcp-tools";
import { runOverviewResearchBatch, resolveResearchBatchEligibleRows, type OverviewResearchRowResult } from "@/lib/overview/overview-research-batch";
import { overviewDateModifierTodayIso } from "@/lib/overview/overview-bulk-seo-payload";
import { uploadOverviewResearchedRowToWordPress } from "@/lib/overview/overview-research-row-wp-upload";
import { attachAiseoUploadGeneratedFiles, type AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import { failResearchRowHarness, finalizeOverviewResearchHarnessBatch, initOverviewResearchHarnessBatchState, makeResearchHarnessCallback, makeResearchArtifactCallback, finishResearchRowHarness, setResearchActiveRow, setResearchBatchPrepMessage, type ResearchHarnessSetters } from "@/lib/overview/overview-research-harness-run";
import { isOverviewBatchRunning } from "@/lib/overview/overview-batch-slot";
import { overviewBulkPageRanges } from "@/lib/overview/overview-bulk-page-size";
import { setOverviewBulkHarnessPageState } from "@/lib/overview/overview-bulk-page-state";
import { overviewBulkRowEntries } from "@/lib/overview/overview-bulk-row-scope";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewTabBase } from "@/hooks/overview/use-overview-tab-base";

type Args = Pick<
  OverviewTabBase,
  | "rowsRef"
  | "updateRow"
  | "setGscQuickWinsFile"
  | "opt"
  | "bindings"
  | "getInventoryMatchForUrl"
> & {
  site: WordPressSite | undefined;
  gscQuickWinsFile: string | null;
  serpDumpUrl: (filename: string) => string;
  handleDataForSeoResearch: (
    rowIndex: number,
    options?: { skipGsc?: boolean; silent?: boolean },
  ) => Promise<Partial<OverviewRow> | null>;
  ensureOverviewKeywordsForMissingRows: (options?: {
    progressKey?: "research" | "contentKw" | "entityKw";
    silent?: boolean;
    singleBatch?: boolean;
    preserveRowStatus?: boolean;
    skipProgressSlice?: boolean;
  }) => Promise<{ ensured: number; failed: number; keywordsByIndex: Map<number, string> }>;
  bulkScopeUrlKeysRef: MutableRefObject<Set<string>>;
};

async function runResearchRefreshForRows(
  indices: number[],
  getRows: () => OverviewRow[],
  handleDataForSeoResearch: Args["handleDataForSeoResearch"],
): Promise<number> {
  let refreshed = 0;
  for (const index of indices) {
    const row = getRows()[index];
    if (!row) continue;
    // Never skip: always run research (handler writes missing keywords first).
     
    const patch = await handleDataForSeoResearch(index, { silent: true });
    if (patch) refreshed += 1;
  }
  return refreshed;
}

export function useOverviewTabResearchAllBatch({
  rowsRef,
  updateRow,
  setGscQuickWinsFile,
  site,
  gscQuickWinsFile,
  serpDumpUrl,
  opt,
  bindings,
  getInventoryMatchForUrl,
  bulkScopeUrlKeysRef,
  ensureOverviewKeywordsForMissingRows,
}: Args) {
  const runResearchAll = useCallback(
    async () => {
      const scopeKeys = bulkScopeUrlKeysRef.current;
      if (scopeKeys.size === 0) return;
      if (!site) {
        notify.error(NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN);
        return;
      }
      if (isProductionBackendMisconfigured()) {
        notify.error(
          "Backend API URL is not configured for production. On Render, set VITE_MCP_API_BASE on the static frontend service (e.g. https://your-api.onrender.com/api/mcp) and redeploy neo-pulseonefront-end.",
          { duration: 14000 },
        );
        return;
      }

      const batchKey = `${site.id}-batch`;
      if (isOverviewBatchRunning(opt.isOptimizingContent, batchKey)) {
        notify.error(NOTIFY_A_BULK_RUN_IS_ALREADY_IN_PROGRESS);
        return;
      }

      let harnessInitialized = false;
      let briefUpdated = 0;
      let serpOnly = 0;
      let failed = 0;
      let researchTotal = 0;

      try {
        const currentRows = rowsRef.current;
        const eligible = overviewBulkRowEntries(currentRows, scopeKeys).map(({ row, index }) => {
          const kw = row.focusKeyword?.trim() || "";
          return { row: { ...row, focusKeyword: kw }, index };
        });

        if (!eligible.length) {
          notify.error("No rows in the current scope to research.", { duration: 10000 });
          return;
        }

        researchTotal = eligible.length;

        const batchDeps = {
          site,
          gscQuickWinsFile: null,
          serpDumpUrl,
          skipGsc: false,
          silent: true,
        };

        const indexToUrl = new Map<number, string>();
        const indexToKeyword = new Map<number, string>();
        for (const { index, row } of eligible) {
          const url = row.url?.trim();
          if (url) indexToUrl.set(index, url);
          const kw = row.focusKeyword?.trim();
          if (kw) indexToKeyword.set(index, kw);
        }

        const harnessSetters: ResearchHarnessSetters = {
          siteId: site.id,
          batchKey,
          setBulkOptimizationState: opt.setBulkOptimizationState,
          setOptimizationProgress: opt.setOptimizationProgress,
        };
        const onHarnessSection = makeResearchHarnessCallback(
          indexToUrl,
          indexToKeyword,
          researchTotal,
          harnessSetters,
        );
        const onResearchArtifact = makeResearchArtifactCallback(indexToUrl, harnessSetters);

        const prepMessage = `Researching ${researchTotal} page(s)…`;

        flushSync(() => {
          initOverviewResearchHarnessBatchState({
            site,
            rows: eligible.map((e) => e.row),
            setBulkOptimizationState: opt.setBulkOptimizationState,
            setOptimizationProgress: opt.setOptimizationProgress,
            setIsOptimizingContent: opt.setIsOptimizingContent,
            setOptimizationFileManagers: opt.setOptimizationFileManagers,
            prepMessage,
          });
          for (const { index } of eligible) {
            updateRow(index, {
              status: "research-faq",
              seoResearch: "",
              briefFileName: null,
              researchFileName: null,
            });
          }
          const first = eligible[0];
          const firstUrl = first?.row.url?.trim();
          if (firstUrl) {
            setResearchActiveRow(
              batchKey,
              firstUrl,
              opt.setBulkOptimizationState,
              researchTotal,
            );
          }
        });
        harnessInitialized = true;

        setResearchBatchPrepMessage(
          batchKey,
          site.id,
          "Ensuring focus keywords…",
          harnessSetters,
        );
        const keywordPrep = await ensureOverviewKeywordsForMissingRows({
          silent: true,
          preserveRowStatus: true,
          skipProgressSlice: true,
          singleBatch: true,
        });

        const researchEligible = resolveResearchBatchEligibleRows(
          eligible,
          (index) => rowsRef.current[index],
          keywordPrep.keywordsByIndex,
        );

        indexToKeyword.clear();
        indexToUrl.clear();
        for (const { index, row } of researchEligible) {
          const url = row.url?.trim();
          if (url) indexToUrl.set(index, url);
          const kw = row.focusKeyword?.trim();
          if (kw) indexToKeyword.set(index, kw);
        }

        const batchCallbacks = {
          onBatchGscExportStart: (urlCount: number) => {
            setResearchBatchPrepMessage(
              batchKey,
              site.id,
              `GSC export for ${urlCount} page(s)…`,
              harnessSetters,
            );
          },
          onBatchGscExportDone: (filename: string | null) => {
            setResearchBatchPrepMessage(
              batchKey,
              site.id,
              filename
                ? `GSC export complete (${filename})`
                : "GSC export finished (no file saved)",
              harnessSetters,
            );
          },
          onPageStart: (index: number, row: OverviewRow) => {
            const url = row.url?.trim();
            if (!url) return;
            flushSync(() => {
              updateRow(index, { status: "research-faq" });
              setResearchActiveRow(
                batchKey,
                url,
                opt.setBulkOptimizationState,
                researchTotal,
              );
            });
          },
          onHarnessSection,
          onResearchArtifact,
          onPageComplete: async (r: OverviewResearchRowResult) => {
            const url = indexToUrl.get(r.index)?.trim();
            const brief = String(r.patch?.seoResearch ?? "").trim();
            const willUpload = Boolean(r.patch) && !r.failed && Boolean(brief);
            flushSync(() => {
              if (r.patch) {
                updateRow(r.index, { status: willUpload ? "uploading" : "idle", ...r.patch });
              } else {
                updateRow(r.index, { status: "error" });
              }
              if (url) {
                if (r.failed && !r.patch) {
                  if (r.harnessSummaries) {
                    finishResearchRowHarness(
                      url,
                      r.index,
                      r.harnessSummaries,
                      harnessSetters,
                      false,
                      undefined,
                      researchEligible.find((e) => e.index === r.index)?.row.focusKeyword,
                    );
                  } else {
                    failResearchRowHarness(
                      url,
                      r.errorMessage ?? "Research failed",
                      harnessSetters,
                      r.index,
                      researchTotal,
                    );
                  }
                } else {
                  finishResearchRowHarness(
                    url,
                    r.index,
                    r.harnessSummaries,
                    harnessSetters,
                    Boolean(r.patch) && !r.failed,
                    r.patch?.seoResearch,
                    researchEligible.find((e) => e.index === r.index)?.row.focusKeyword,
                  );
                }
              }
            });
            if (!willUpload) return;
            const live = rowsRef.current[r.index];
            const baseRow =
              live ?? researchEligible.find((e) => e.index === r.index)?.row;
            if (!baseRow) {
              updateRow(r.index, { status: "idle" });
              return;
            }
            const merged: OverviewRow = { ...baseRow, ...r.patch };
            try {
              const wp = await uploadOverviewResearchedRowToWordPress({
                site,
                row: merged,
                bindings,
                getInventoryMatchForUrl,
              });
              if (url && wp.generatedFiles.length) {
                attachAiseoUploadGeneratedFiles(
                  batchKey,
                  opt.setBulkOptimizationState,
                  url,
                  wp.generatedFiles,
                  wp.ok,
                );
              }
              if (wp.skipped) {
                updateRow(r.index, { status: "idle" });
                return;
              }
              if (wp.ok) {
                updateRow(r.index, {
                  status: "idle",
                  dateModifier: overviewDateModifierTodayIso(),
                  ...(wp.postId != null ? { postId: wp.postId } : {}),
                });
                return;
              }
              updateRow(r.index, { status: "error" });
            } catch {
              updateRow(r.index, { status: "error" });
            }
          },
        };

        const pageRanges = overviewBulkPageRanges(researchEligible.length);
        let completedOffset = 0;
        for (const { start, end, page, pageCount } of pageRanges) {
          const slice = researchEligible.slice(start, end);
          setOverviewBulkHarnessPageState({
            batchKey,
            siteId: site.id,
            page,
            pageCount,
            start,
            end,
            total: researchTotal,
            setBulkOptimizationState: opt.setBulkOptimizationState,
            setOptimizationProgress: opt.setOptimizationProgress,
            step: "Researching…",
          });

          const { stats: pageStats } = await runOverviewResearchBatch(
            slice,
            batchDeps,
            { batchIndex: page, batchCount: pageCount, total: researchTotal, completedOffset },
            batchCallbacks,
          );

          briefUpdated += pageStats.briefUpdated;
          serpOnly += pageStats.serpOnly;
          failed += pageStats.failed;
          completedOffset += slice.length;
        }

        finalizeOverviewResearchHarnessBatch(
          batchKey,
          site.id,
          briefUpdated,
          researchTotal,
          opt.setBulkOptimizationState,
          opt.setOptimizationProgress,
          opt.setIsOptimizingContent,
        );
        if (site.siteUrl && BACKEND_API_BASE && !gscQuickWinsFile) {
          try {
            const exportRes = await fetch(`${BACKEND_API_BASE}/api/gsc/export-overview-quick-wins`, {
              method: "POST",
              headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({
                siteUrl: site.siteUrl,
                siteWideQueriesOnly: true,
              }),
            });
            const exportJson = await exportRes.json().catch(() => null);
            if (exportRes.ok && exportJson?.storedFile) {
              setGscQuickWinsFile(exportJson.storedFile);
            }
          } catch {
            /* optional */
          }
        }

        if (failed === researchTotal) {
          notify.error(notifyResearchFailedForAllXRowSBriefJs(researchTotal), { duration: 14000 });
        } else if (briefUpdated === 0) {
          notify.warning(notifyResearchRanOnXRowSButBriefJsonW(researchTotal, serpOnly, failed), {
            duration: 12000,
          });
        } else if (failed > 0 || serpOnly > 0) {
          notify.warning(
            notifyResearchFinishedXXBriefJsonUpdated(briefUpdated, researchTotal, serpOnly > 0),
            { duration: 10000 },
          );
        } else {
          notify.success(notifyFinishedResearchForXRowSDataforseo(briefUpdated));
        }
      } catch (err: unknown) {
        const msg =
          err && typeof err === "object" && "message" in err
            ? String((err as { message: unknown }).message)
            : "Research batch failed.";
        notify.error(msg, { duration: 12000 });
        if (harnessInitialized && site) {
          finalizeOverviewResearchHarnessBatch(
            batchKey,
            site.id,
            briefUpdated,
            researchTotal || rowsRef.current.length,
            opt.setBulkOptimizationState,
            opt.setOptimizationProgress,
            opt.setIsOptimizingContent,
          );
        }
      }
    },
    [
      rowsRef,
      site,
      gscQuickWinsFile,
      serpDumpUrl,
      setGscQuickWinsFile,
      updateRow,
      bindings,
      getInventoryMatchForUrl,
      bulkScopeUrlKeysRef,
      ensureOverviewKeywordsForMissingRows,
      opt.setBulkOptimizationState,
      opt.setOptimizationProgress,
      opt.setIsOptimizingContent,
      opt.isOptimizingContent,
      opt.setOptimizationFileManagers,
    ],
  );

  const handleResearchAll = runResearchAll;

  return { handleResearchAll };
}
