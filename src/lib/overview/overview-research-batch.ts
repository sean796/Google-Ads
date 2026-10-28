import pLimit from "p-limit";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";
import type { ResearchHarnessDoneSummary } from "@/lib/overview/overview-research-harness-sections";
import { OVERVIEW_RESEARCH_ROW_CONCURRENCY_MAX } from "@/lib/overview/overview-research-batch-constants";
import {
  exportOverviewGscForPageUrls,
  runOverviewResearchForRow,
  type OverviewResearchRowInput,
  type ResearchArtifactFile,
} from "@/lib/overview/overview-research-row";

export type OverviewResearchEligibleRow = {
  index: number;
  row: OverviewRow;
};

/** Merge keyword-prep results into grid rows (rowsRef can lag behind setRows). */
export function resolveResearchBatchEligibleRows(
  eligible: ReadonlyArray<{ index: number }>,
  getRow: (index: number) => OverviewRow | undefined,
  keywordsByIndex: ReadonlyMap<number, string>,
): OverviewResearchEligibleRow[] {
  const out: OverviewResearchEligibleRow[] = [];
  for (const { index } of eligible) {
    const row = getRow(index);
    if (!row) continue;
    const focusKeyword =
      keywordsByIndex.get(index)?.trim() || row.focusKeyword?.trim() || "";
    out.push({ index, row: { ...row, focusKeyword } });
  }
  return out;
}

export type OverviewResearchBatchDeps = {
  site: WordPressSite | undefined;
  gscQuickWinsFile: string | null;
  serpDumpUrl: (filename: string) => string;
  skipGsc?: boolean;
  silent?: boolean;
};

export type OverviewResearchBatchPhase = "serp" | "done";

export type OverviewResearchBatchProgress = {
  completedInBatch: number;
  batchSize: number;
  batchIndex: number;
  batchCount: number;
  totalCompleted: number;
  total: number;
  phase: OverviewResearchBatchPhase;
};

export type OverviewResearchRowResult = {
  index: number;
  patch: Partial<OverviewRow> | null;
  failed: boolean;
  errorMessage?: string;
  harnessSummaries?: ResearchHarnessDoneSummary;
};

function classifyPatch(patch: Partial<OverviewRow> | null): {
  briefUpdated: boolean;
  serpOnly: boolean;
  failed: boolean;
} {
  if (!patch) return { briefUpdated: false, serpOnly: false, failed: true };
  const briefLen = String(patch.seoResearch ?? "").trim().length;
  if (briefLen > 0) return { briefUpdated: true, serpOnly: false, failed: false };
  if (patch.researchFileName) return { briefUpdated: false, serpOnly: true, failed: false };
  return { briefUpdated: false, serpOnly: false, failed: true };
}

export type OverviewResearchBatchProgressCtx = {
  batchIndex: number;
  batchCount: number;
  total: number;
  completedOffset: number;
};

export type OverviewResearchBatchCallbacks = {
  onProgress?: (p: OverviewResearchBatchProgress) => void;
  /** Fired before sources run for this page (mark row active). */
  onPageStart?: (index: number, row: OverviewRow) => void;
  onPageComplete?: (r: OverviewResearchRowResult) => void | Promise<void>;
  onHarnessSection?: (index: number, payload: BulkHarnessSectionPayload) => void;
  onResearchArtifact?: (index: number, file: ResearchArtifactFile) => void;
  onBatchGscExportStart?: (urlCount: number) => void;
  onBatchGscExportDone?: (filename: string | null) => void;
};

export async function runOverviewResearchBatch(
  eligible: OverviewResearchEligibleRow[],
  deps: OverviewResearchBatchDeps,
  progressCtx: OverviewResearchBatchProgressCtx,
  callbacks?: OverviewResearchBatchCallbacks,
): Promise<{
  results: OverviewResearchRowResult[];
  stats: { briefUpdated: number; serpOnly: number; failed: number };
}> {
  const { onProgress, onPageStart, onPageComplete, onHarnessSection, onResearchArtifact, onBatchGscExportStart, onBatchGscExportDone } =
    callbacks ?? {};
  const results: OverviewResearchRowResult[] = [];
  let briefUpdated = 0;
  let serpOnly = 0;
  let failed = 0;

  if (!eligible.length) {
    return { results, stats: { briefUpdated, serpOnly, failed } };
  }

  const skipGsc = deps.skipGsc === true;
  const batchSize = eligible.length;
  const { batchIndex, batchCount, total, completedOffset } = progressCtx;
  let completedInBatch = 0;
  let phase: OverviewResearchBatchPhase = "serp";

  const emitProgress = () => {
    onProgress?.({
      completedInBatch,
      batchSize,
      batchIndex,
      batchCount,
      totalCompleted: completedOffset + completedInBatch,
      total,
      phase,
    });
  };

  emitProgress();

  const siteGsc = deps.gscQuickWinsFile ?? null;
  let resolvedBatchGsc: string | null = siteGsc;
  const needsBatchGscExport = !skipGsc && !siteGsc && deps.site?.siteUrl;
  if (needsBatchGscExport) {
    const urls = eligible.map((e) => e.row.url?.trim() ?? "").filter(Boolean);
    onBatchGscExportStart?.(urls.length);
    try {
      resolvedBatchGsc = await exportOverviewGscForPageUrls(deps.site!.siteUrl, urls);
    } catch {
      resolvedBatchGsc = null;
    }
    onBatchGscExportDone?.(resolvedBatchGsc);
  }

  const rowLimit = pLimit(OVERVIEW_RESEARCH_ROW_CONCURRENCY_MAX);
  await Promise.all(
    eligible.map(({ index, row }) =>
      rowLimit(async () => {
        let rowResult: OverviewResearchRowResult = {
          index,
          patch: null,
          failed: true,
        };
        onPageStart?.(index, row);
        try {
          const rowInput: OverviewResearchRowInput = {
            row,
            rowIndex: index,
            site: deps.site,
            gscQuickWinsFile: deps.gscQuickWinsFile,
            gscCsvForBatch: resolvedBatchGsc,
            batchResearchMode: true,
            serpDumpUrl: deps.serpDumpUrl,
            skipGsc,
            silent: deps.silent ?? true,
            onHarnessSection: onHarnessSection
              ? (payload) => onHarnessSection(index, payload)
              : undefined,
            onResearchArtifact: onResearchArtifact
              ? (file) => onResearchArtifact(index, file)
              : undefined,
          };
          const { patch, harnessSummaries } = await runOverviewResearchForRow(rowInput);
          const c = classifyPatch(patch);
          rowResult = {
            index,
            patch,
            failed: c.failed,
            harnessSummaries,
            errorMessage: c.failed && !patch ? "Research returned no brief" : undefined,
          };
          results.push(rowResult);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          rowResult = { index, patch: null, failed: true, errorMessage };
          results.push(rowResult);
        } finally {
          completedInBatch += 1;
          await onPageComplete?.(rowResult);
          emitProgress();
        }
      }),
    ),
  );

  results.sort((a, b) => a.index - b.index);

  for (const r of results) {
    const c = classifyPatch(r.patch);
    if (c.briefUpdated) briefUpdated += 1;
    else if (c.serpOnly) serpOnly += 1;
    else failed += 1;
  }

  phase = "done";
  emitProgress();
  return { results, stats: { briefUpdated, serpOnly, failed } };
}
