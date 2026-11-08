import pLimit from "p-limit";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewInventoryUrlMatch } from "@/lib/overview/overview-row-scrape";
import type { AiAllMetaCatalogRow } from "@/lib/overview/overview-ai-all-meta-batch-catalog";
import type { AiAllMetaRowPatch } from "@/lib/overview/overview-ai-all-meta-batch-parse";
import { normalizeOverviewKeywordUrlKey } from "@/lib/overview/overview-keyword-batch-parse";
import {
  OVERVIEW_AI_ALL_META_BATCH_SIZE,
  OVERVIEW_AI_ALL_META_ROW_CONCURRENCY_MAX,
} from "@/lib/overview/overview-ai-all-meta-batch-constants";
import {
  buildPlannedMetaHarnessSections,
  formatSeoResearchArtifact,
  makeMetaHarnessStartPayloads,
  metaHarnessNonFaqSectionCount,
  metaHarnessPlannedSectionCount,
  resolveMetaHarnessSeoResearchBrief,
  type MetaHarnessPrepSummaries,
} from "@/lib/overview/overview-ai-all-meta-harness-sections";
import { buildMetaPagePingFromOverviewRow } from "@/lib/overview/overview-ai-all-meta-page-ping";
import {
  emitMetaHarnessPayloads,
  finishMetaRowHarness,
  setMetaUrlStatus,
  type MetaHarnessSetters,
} from "@/lib/overview/overview-ai-all-meta-harness-mutations";
import {
  runFaqPairsForRow,
  type FaqHarnessOptimizeDeps,
} from "@/lib/overview/overview-faq-harness-run";
import type { FaqHarnessSetters } from "@/lib/overview/overview-faq-harness-mutations";
import { overviewBulkPageRanges } from "@/lib/overview/overview-bulk-page-size";
import { setOverviewBulkHarnessPageState } from "@/lib/overview/overview-bulk-page-state";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import { aiseoRowFilesForUpload, buildAiseoElementJsonFile } from "@/lib/overview/overview-aiseo-row-artifacts";
import { resolveAiseoHarnessSourceHtml } from "@/lib/overview/overview-aiseo-source-html";

export type AiAllMetaEligibleRow = {
  index: number;
  row: OverviewRow;
  entry: AiAllMetaCatalogRow;
};

export type AiAllMetaRowResult = {
  index: number;
  url: string;
  ok: boolean;
  error?: string;
};

export type RunOverviewAiAllMetaBatchParams = {
  site: WordPressSite;
  sitemapSource: OverviewSitemapSource;
  getInventoryMatchForUrl: (
    site: WordPressSite | null,
    url: string,
  ) => OverviewInventoryUrlMatch | undefined;
  eligible: AiAllMetaEligibleRow[];
  harnessSetters: MetaHarnessSetters;
  batchKey: string;
  bulkAiFaqSeedCount: number;
  faqDeps: FaqHarnessOptimizeDeps;
  runAiAllMetaBatchForCatalog: (
    chunk: AiAllMetaCatalogRow[],
  ) => Promise<Map<string, AiAllMetaRowPatch>>;
  updateRow: (index: number, patch: Partial<OverviewRow>) => void;
  isCancelled: () => boolean;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
  onRowStart?: (index: number, row: OverviewRow) => void;
  onRowComplete?: (result: AiAllMetaRowResult) => void;
};

type PreparedMetaRow = {
  eligibleRow: AiAllMetaEligibleRow;
  runEntry: AiAllMetaCatalogRow;
  prep: MetaHarnessPrepSummaries;
};

export function buildAiAllMetaEligibleRows(
  rows: OverviewRow[],
  catalog: AiAllMetaCatalogRow[],
): AiAllMetaEligibleRow[] {
  const eligible: AiAllMetaEligibleRow[] = [];
  for (const entry of catalog) {
    const row = rows[entry.index];
    if (!row?.url?.trim()) continue;
    eligible.push({ index: entry.index, row, entry });
  }
  return eligible;
}

function prepDonePayload(
  entry: AiAllMetaCatalogRow,
  sectionIndex: number,
  markdownSlice: string,
): BulkHarnessSectionPayload {
  const planned = buildPlannedMetaHarnessSections(entry);
  return {
    rowIndex: entry.index,
    sectionIndex,
    totalSections: planned.length,
    title: planned[sectionIndex]!.title,
    phase: "done",
    markdownSlice,
  };
}

function chunkCatalogRows<T>(items: T[], size: number): T[][] {
  if (size <= 0 || !items.length) return items.length ? [items] : [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function pushRowResult(
  results: AiAllMetaRowResult[],
  rowResult: AiAllMetaRowResult,
  onRowComplete?: (result: AiAllMetaRowResult) => void,
): void {
  results.push(rowResult);
  onRowComplete?.(rowResult);
}

export async function runOverviewAiAllMetaBatch(
  params: RunOverviewAiAllMetaBatchParams,
): Promise<{ results: AiAllMetaRowResult[]; applied: number; failed: number }> {
  const {
    site,
    sitemapSource,
    getInventoryMatchForUrl,
    eligible,
    harnessSetters,
    batchKey,
    bulkAiFaqSeedCount,
    faqDeps,
    runAiAllMetaBatchForCatalog,
    updateRow,
    isCancelled,
    uploadAfterRowWrite,
    onRowStart,
    onRowComplete,
  } = params;

  const results: AiAllMetaRowResult[] = [];
  let applied = 0;
  let failed = 0;

  if (!eligible.length) {
    return { results, applied, failed };
  }

  const faqHarnessSetters: FaqHarnessSetters = {
    siteId: harnessSetters.siteId,
    batchKey: harnessSetters.batchKey,
    setBulkOptimizationState: harnessSetters.setBulkOptimizationState,
    setOptimizationProgress: harnessSetters.setOptimizationProgress,
  };

  const pageRanges = overviewBulkPageRanges(eligible.length);

  for (const { start, end, page, pageCount } of pageRanges) {
    const pageEligible = eligible.slice(start, end);
    if (isCancelled()) break;

    setOverviewBulkHarnessPageState({
      batchKey,
      siteId: harnessSetters.siteId,
      page,
      pageCount,
      start,
      end,
      total: eligible.length,
      setBulkOptimizationState: harnessSetters.setBulkOptimizationState,
      setOptimizationProgress: harnessSetters.setOptimizationProgress,
      step: "Generating meta...",
    });

    const pingOutcomes: Array<PreparedMetaRow | AiAllMetaRowResult> = [];
    for (const eligibleRow of pageEligible) {
      const { index, row, entry } = eligibleRow;
      const url = row.url.trim();
      try {
        if (isCancelled()) {
          pingOutcomes.push({ index, url, ok: false, error: "Cancelled" });
          continue;
        }

        onRowStart?.(index, row);
        setMetaUrlStatus(batchKey, url, "optimizing", harnessSetters.setBulkOptimizationState);
        updateRow(index, { status: "ai-meta" });

        emitMetaHarnessPayloads(
          url,
          makeMetaHarnessStartPayloads(entry.index, entry),
          harnessSetters,
        );

        const pingResult = buildMetaPagePingFromOverviewRow(row);
        const seoResearchBrief =
          resolveMetaHarnessSeoResearchBrief(entry.seoResearchBrief, pingResult.postFieldsSeoResearch) ??
          entry.seoResearchBrief;
        const runEntry = { ...entry, seoResearchBrief };
        const prep: MetaHarnessPrepSummaries = {
          pagePing: pingResult,
          seoResearchBrief,
        };

        emitMetaHarnessPayloads(
          url,
          [prepDonePayload(runEntry, 0, formatSeoResearchArtifact(seoResearchBrief))],
          harnessSetters,
        );

        pingOutcomes.push({ eligibleRow, runEntry, prep });
      } catch (err) {
        finishMetaRowHarness(entry, null, {}, harnessSetters, updateRow, { awaitFaqPairs: false });
        pingOutcomes.push({
          index,
          url,
          ok: false,
          error: err instanceof Error ? err.message : "Meta prep failed.",
        });
      }
    }

    const preparedRows: PreparedMetaRow[] = [];
    for (const outcome of pingOutcomes) {
      if ("eligibleRow" in outcome) {
        preparedRows.push(outcome);
      } else {
        failed += 1;
        pushRowResult(results, outcome, onRowComplete);
      }
    }

    if (isCancelled()) break;

    type MetaReadyRow = PreparedMetaRow & { patch: AiAllMetaRowPatch };
    const faqQueue: MetaReadyRow[] = [];

    for (const catalogChunk of chunkCatalogRows(preparedRows, OVERVIEW_AI_ALL_META_BATCH_SIZE)) {
      if (isCancelled()) break;

      let patchMap: Map<string, AiAllMetaRowPatch>;
      try {
        patchMap = await runAiAllMetaBatchForCatalog(catalogChunk.map((item) => item.runEntry));
      } catch (err) {
        // Batch agent failure (for example unparsable model JSON) fails every
        // row in the chunk with the real error instead of an empty result.
        const message = err instanceof Error ? err.message : "Meta batch agent failed";
        for (const item of catalogChunk) {
          failed += 1;
          pushRowResult(
            results,
            { index: item.eligibleRow.index, url: item.eligibleRow.row.url.trim(), ok: false, error: message },
            onRowComplete,
          );
        }
        continue;
      }

      for (const item of catalogChunk) {
        const { index, row } = item.eligibleRow;
        const url = row.url.trim();
        const patch = patchMap.get(normalizeOverviewKeywordUrlKey(url)) ?? null;
        const metaOk = finishMetaRowHarness(item.runEntry, patch, item.prep, harnessSetters, updateRow, {
          awaitFaqPairs: item.runEntry.faqMode !== "none",
        });

        if (!metaOk || !patch) {
          failed += 1;
          pushRowResult(
            results,
            { index, url, ok: false, error: "No result from batch agent" },
            onRowComplete,
          );
          continue;
        }

        if (item.runEntry.faqMode !== "none") {
          faqQueue.push({ ...item, patch });
        } else {
          if (uploadAfterRowWrite) {
            const { html: postHtml } = await resolveAiseoHarnessSourceHtml({
              row: { ...row, ...patch },
              site,
              sitemapSource,
              getInventoryMatchForUrl,
            });
            const bodyForFiles =
              postHtml.trim() || row.postContentOptimized?.trim() || row.postContent?.trim() || "";
            const elementFile = buildAiseoElementJsonFile("ai-all-meta.json", {
              url,
              focusKeyword: item.runEntry.focusKeyword,
              title: patch.title ?? patch.aiTitle ?? item.runEntry.existingTitle,
              metaDescription: patch.metaDescription ?? patch.aiMeta ?? item.runEntry.existingMeta,
            });
            const rowFiles = aiseoRowFilesForUpload({
              runKind: "aiAllMeta",
              url,
              elementFiles: elementFile ? [elementFile] : [],
              postHtml: bodyForFiles || undefined,
            });
            await uploadAfterRowWrite({
              index,
              url,
              html: bodyForFiles,
              rowFiles,
            });
          }
          applied += 1;
          pushRowResult(results, { index, url, ok: true }, onRowComplete);
        }
      }
    }

    if (isCancelled()) break;

    const faqLimit = pLimit(OVERVIEW_AI_ALL_META_ROW_CONCURRENCY_MAX);
    await Promise.all(
      faqQueue.map((item) =>
        faqLimit(async () => {
          const { index, row } = item.eligibleRow;
          const url = row.url.trim();
          try {
            const workingRow = { ...row, ...item.patch };
            const faqOk = await runFaqPairsForRow({
              site,
              sitemapSource,
              getInventoryMatchForUrl,
              row: workingRow,
              rowIndex: index,
              bulkAiFaqSeedCount,
              deps: faqDeps,
              harnessSetters: faqHarnessSetters,
              updateRow,
              uploadAfterRowWrite,
              sectionIndexOffset: metaHarnessNonFaqSectionCount(item.runEntry),
              totalHarnessSections: metaHarnessPlannedSectionCount(item.runEntry),
              skipLoadingState: true,
            });
            if (!faqOk) {
              failed += 1;
              pushRowResult(
                results,
                { index, url, ok: false, error: "FAQ pair optimization failed" },
                onRowComplete,
              );
              return;
            }
            applied += 1;
            pushRowResult(results, { index, url, ok: true }, onRowComplete);
          } catch (err) {
            failed += 1;
            pushRowResult(
              results,
              {
                index,
                url,
                ok: false,
                error: err instanceof Error ? err.message : "FAQ optimization failed.",
              },
              onRowComplete,
            );
          }
        }),
      ),
    );
  }

  return { results, applied, failed };
}
