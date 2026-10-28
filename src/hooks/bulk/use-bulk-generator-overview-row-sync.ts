import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
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
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { normalizeBulkGeneratorSiteBaseUrl } from "@/lib/bulk/bulk-generator-studio-rows";
import { getSitePrefetchOverviewRowsForSourceSync } from "@/lib/local-analysis/entity-site-warm-cache";
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
  sitemapSource: OverviewSitemapSource,
): string {
  const fileCounts = Array.from(bindings.filesByRow.entries())
    .map(([i, files]) => {
      const completed = files.filter((f) => f.status === "completed").length;
      const latestTs = files.reduce((max, f) => (f.timestamp > max ? f.timestamp : max), 0);
      return `${i}:${files.length}:${completed}:${latestTs}`;
    })
    .join(",");
  const rowMeta = bindings.displayRows
    .map(
      (r, i) =>
        `${i}:${r.title ?? ""}:${r.keyword ?? ""}:${r.target_slug ?? ""}:${r.destination_url ?? ""}:${r.meta_description ?? ""}`,
    )
    .join(";");
  return [
    variant,
    siteBaseUrl ?? "",
    sitemapSource,
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
  const pathSite = ctrl.site ?? bindings.connectedSite ?? null;
  const sapInventoryRows = useMemo(() => {
    if (!pathSite?.id) return [];
    return getSitePrefetchOverviewRowsForSourceSync(pathSite, "sap");
  }, [pathSite]);
  const syncingFromBindingsRef = useRef(false);
  const lastSigRef = useRef("");
  const prevSitemapSourceRef = useRef(ctrl.sitemapSource);
  const activeDocRowIndexRef = useRef(0);

  useLayoutEffect(() => {
    const sig = bindingsRowsSignature(bindings, variant, siteBaseUrl, ctrl.sitemapSource);
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;

    const sitemapSourceChanged = prevSitemapSourceRef.current !== ctrl.sitemapSource;
    const priorRows = ctrl.rowsRef.current;
    const activeRowIndexBeforeRemap = sitemapSourceChanged
      ? ctrl.expandedPageUrl
        ? rowIndexForOverviewUrl(priorRows, ctrl.expandedPageUrl)
        : activeDocRowIndexRef.current
      : -1;
    prevSitemapSourceRef.current = ctrl.sitemapSource;

    const preserveByUrl = new Map<string, Pick<OverviewRow, "postContent" | "postContentOptimized">>();
    const preserveByRowIndex = new Map<
      number,
      Pick<OverviewRow, "postContent" | "postContentOptimized">
    >();
    priorRows.forEach((row, index) => {
      if (!row.postContent?.trim()) return;
      const body = {
        postContent: row.postContent,
        postContentOptimized: row.postContentOptimized ?? row.postContent,
      };
      preserveByRowIndex.set(index, body);
      const key = normalizePageUrlKey(row.url);
      if (key) preserveByUrl.set(key, body);
    });

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
      sitemapSource: ctrl.sitemapSource,
      site: pathSite,
      sapInventoryRows,
      preserveByUrl,
      preserveByRowIndex,
      streamingRowIndex: bindings.isProcessing ? bindings.currentRow : undefined,
    });

    syncingFromBindingsRef.current = true;
    const keepPriorRowsWhileProcessing =
      next.length === 0 && bindings.isProcessing && ctrl.rowsRef.current.length > 0;
    if (!keepPriorRowsWhileProcessing) {
      ctrl.setRows(next);
      if (sitemapSourceChanged) {
        const idx =
          activeRowIndexBeforeRemap >= 0 && activeRowIndexBeforeRemap < next.length
            ? activeRowIndexBeforeRemap
            : 0;
        activeDocRowIndexRef.current = idx;
        const remappedUrl = next[idx]?.url ?? next[0]?.url ?? null;
        ctrl.setExpandedPageUrl(remappedUrl);
      } else if (next.length === 0) {
        ctrl.setExpandedPageUrl(null);
      }
    }
    syncingFromBindingsRef.current = false;
  }, [bindings, variant, siteBaseUrl, ctrl, ctrl.sitemapSource, pathSite, sapInventoryRows]);

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
  ]);

  const selectDocUrl = useCallback(
    (url: string) => {
      if (normalizePageUrlKey(ctrl.expandedPageUrl ?? "") === normalizePageUrlKey(url)) return;
      ctrl.setExpandedPageUrl(url);
      const index = rowIndexForOverviewUrl(builtRows, url);
      if (index >= 0) activeDocRowIndexRef.current = index;
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

  const resolveActiveDocRowIndex = useCallback((): number => {
    if (ctrl.rows.length === 0) return -1;
    if (ctrl.expandedPageUrl) {
      const byUrl = rowIndexForOverviewUrl(ctrl.rows, ctrl.expandedPageUrl);
      if (byUrl >= 0) {
        activeDocRowIndexRef.current = byUrl;
        return byUrl;
      }
    }
    const idx = Math.min(activeDocRowIndexRef.current, ctrl.rows.length - 1);
    return idx >= 0 ? idx : 0;
  }, [ctrl.expandedPageUrl, ctrl.rows]);

  return {
    onBulkGeneratorOverviewRowPatched,
    selectDocUrl,
    optimizingRowUrl,
    resolveActiveDocRowIndex,
  };
}
