import { useCallback, useEffect, useMemo, useRef } from "react";
import type { BulkGeneratorWorkspaceBindings } from "@/components/keyword-research/bulk/bulk-generator-workspace-bindings";
import type { OverviewTabController } from "@/hooks/overview/use-overview-tab-controller";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import {
  buildBulkGeneratorOverviewRows,
  bulkGeneratedFilesToOptimizationArtifacts,
  overviewRowPatchToCsvPatch,
  rowIndexForOverviewUrl,
} from "@/lib/bulk/bulk-generator-overview-row-bridge";
import type { BulkGeneratorStudioVariant } from "@/lib/bulk/bulk-generator-studio-rows";
import { normalizeBulkGeneratorSiteBaseUrl } from "@/lib/bulk/bulk-generator-studio-rows";
import { generatedFilesForUrl } from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";

export type UseBulkGeneratorOverviewRowSyncArgs = {
  ctrl: OverviewTabController;
  bindings: BulkGeneratorWorkspaceBindings;
  variant: BulkGeneratorStudioVariant;
  followRunRow: boolean;
  onFollowRunRowChange: (value: boolean) => void;
};

function countCompletedFiles(filesByRow: Map<number, { status: string }[]>): number {
  let n = 0;
  for (const files of filesByRow.values()) {
    n += files.filter((f) => f.status === "completed").length;
  }
  return n;
}

function countHarnessDoneSections(
  harnessByRow: Map<number, { status: string }[]>,
): number {
  let n = 0;
  for (const sections of harnessByRow.values()) {
    n += sections.filter((s) => s.status === "done").length;
  }
  return n;
}

function bindingsRowsSignature(
  bindings: BulkGeneratorWorkspaceBindings,
  variant: BulkGeneratorStudioVariant,
  siteBaseUrl: string | null,
): string {
  const fileCounts = Array.from(bindings.filesByRow.entries())
    .map(([i, files]) => {
      const completed = files.filter((f) => f.status === "completed").length;
      return `${i}:${files.length}:${completed}`;
    })
    .join(",");
  const rowMeta = bindings.displayRows
    .map((r, i) => `${i}:${r.title ?? ""}:${r.keyword ?? ""}:${r.meta_description ?? ""}`)
    .join(";");
  return [
    variant,
    siteBaseUrl ?? "",
    bindings.displayRows.length,
    bindings.numberOfBlogs,
    bindings.hasGeneratedChecklist ? "1" : "0",
    bindings.currentRow,
    bindings.isProcessing ? "1" : "0",
    fileCounts,
    bindings.harnessByRow.size,
    countCompletedFiles(bindings.filesByRow),
    countHarnessDoneSections(bindings.harnessByRow),
    rowMeta,
  ].join("|");
}

export function useBulkGeneratorOverviewRowSync({
  ctrl,
  bindings,
  variant,
  followRunRow,
  onFollowRunRowChange,
}: UseBulkGeneratorOverviewRowSyncArgs) {
  const siteBaseUrl = bindings.connectedSite?.siteUrl ?? null;
  const syncingFromBindingsRef = useRef(false);
  const lastSigRef = useRef("");

  useEffect(() => {
    const sig = bindingsRowsSignature(bindings, variant, siteBaseUrl);
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;

    const preserveByUrl = new Map<string, Pick<OverviewRow, "postContent" | "postContentOptimized">>();
    for (const row of ctrl.rowsRef.current) {
      const key = normalizePageUrlKey(row.url);
      if (!key || !row.postContent?.trim()) continue;
      preserveByUrl.set(key, {
        postContent: row.postContent,
        postContentOptimized: row.postContentOptimized ?? row.postContent,
      });
    }

    const next = buildBulkGeneratorOverviewRows({
      variant,
      displayRows: bindings.displayRows,
      numberOfBlogs: bindings.numberOfBlogs,
      hasGeneratedChecklist: bindings.hasGeneratedChecklist,
      filesByRow: bindings.filesByRow,
      harnessByRow: bindings.harnessByRow,
      currentRow: bindings.currentRow,
      isProcessing: bindings.isProcessing,
      failedRowIndices: bindings.failedRowIndices,
      siteBaseUrl,
      preserveByUrl,
      streamingRowIndex: bindings.isProcessing ? bindings.currentRow : undefined,
    });

    syncingFromBindingsRef.current = true;
    ctrl.setRows(next);
    if (next.length === 0) {
      ctrl.setExpandedPageUrl(null);
    }
    syncingFromBindingsRef.current = false;
  }, [bindings, variant, siteBaseUrl, ctrl]);

  const builtRows = ctrl.displayRows;

  const onBulkGeneratorOverviewRowPatched = useCallback(
    (displayIndex: number, patch: Partial<OverviewRow>) => {
      if (syncingFromBindingsRef.current) return;
      const csvPatch = overviewRowPatchToCsvPatch(patch);
      if (Object.keys(csvPatch).length === 0) return;
      bindings.onDisplayRowChange(displayIndex, csvPatch);
    },
    [bindings],
  );

  useEffect(() => {
    if (!bindings.isProcessing || !followRunRow) return;
    const url = builtRows[bindings.currentRow]?.url;
    if (!url) return;
    if (normalizePageUrlKey(ctrl.expandedPageUrl ?? "") === normalizePageUrlKey(url)) return;
    ctrl.setExpandedPageUrl(url);
  }, [
    bindings.isProcessing,
    bindings.currentRow,
    followRunRow,
    builtRows,
    ctrl.expandedPageUrl,
    ctrl.setExpandedPageUrl,
  ]);

  useEffect(() => {
    const siteId = ctrl.site?.id;
    if (!siteId) return;

    const batchKey = `${siteId}-batch`;
    const urlGeneratedFiles: Record<string, Array<{ name: string; content: string; mimeType: string }>> =
      {};

    builtRows.forEach((row, index) => {
      const artifacts = bulkGeneratedFilesToOptimizationArtifacts(bindings.filesByRow.get(index));
      if (artifacts.length) {
        urlGeneratedFiles[row.url] = artifacts;
      }
    });

    ctrl.opt.setBulkOptimizationState((prev) => {
      const existing = prev[batchKey];
      return {
        ...prev,
        [batchKey]: {
          urls: builtRows.map((r) => r.url),
          currentIndex: bindings.currentRow,
          urlStatuses: existing?.urlStatuses ?? {},
          currentStep: bindings.processingStepLog.at(-1) ?? existing?.currentStep ?? "",
          urlGeneratedFiles: {
            ...(existing?.urlGeneratedFiles ?? {}),
            ...urlGeneratedFiles,
          },
          runKind: existing?.runKind ?? "content",
        },
      };
    });

    const activeUrl = ctrl.expandedPageUrl ?? builtRows[0]?.url;
    if (!activeUrl) return;
    const activeFiles = generatedFilesForUrl(urlGeneratedFiles, activeUrl);
    if (!activeFiles.length) return;
    const manager = new OptimizationFileManager();
    for (const f of activeFiles) {
      manager.addFile(f.name, f.content, f.mimeType);
    }
    ctrl.opt.setOptimizationFileManagers((prev) => ({
      ...prev,
      [siteId]: manager,
    }));
  }, [
    bindings.filesByRow,
    bindings.currentRow,
    bindings.processingStepLog,
    builtRows,
    ctrl.expandedPageUrl,
    ctrl.site?.id,
    ctrl.opt,
  ]);

  const selectDocUrl = useCallback(
    (url: string) => {
      if (normalizePageUrlKey(ctrl.expandedPageUrl ?? "") === normalizePageUrlKey(url)) return;
      ctrl.setExpandedPageUrl(url);
      const index = rowIndexForOverviewUrl(builtRows, url);
      if (bindings.isProcessing && index >= 0 && index !== bindings.currentRow) {
        onFollowRunRowChange(false);
      }
      if (bindings.isProcessing && index === bindings.currentRow) {
        onFollowRunRowChange(true);
      }
    },
    [ctrl, builtRows, bindings.isProcessing, bindings.currentRow, onFollowRunRowChange],
  );

  const optimizingRowUrl = useMemo(() => {
    if (!bindings.isProcessing) return null;
    return builtRows[bindings.currentRow]?.url ?? null;
  }, [bindings.isProcessing, bindings.currentRow, builtRows]);

  return {
    onBulkGeneratorOverviewRowPatched,
    selectDocUrl,
    optimizingRowUrl,
  };
}
