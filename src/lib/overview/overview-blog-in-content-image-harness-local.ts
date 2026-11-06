import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import {
  emitInContentImageHarnessPayload,
  setInContentImageHarnessMessage,
  type BlogInContentImageCatalogRow,
} from "@/lib/overview/overview-blog-in-content-image-harness-batch";
import {
  IN_CONTENT_STEP_CHECKLIST,
  IN_CONTENT_STEP_GENERATE,
  IN_CONTENT_STEP_INSERT,
  appendLocalImagePhaseLog,
  formatLocalImagePhaseLine,
  makeInContentImageHarnessDonePayload,
  makeInContentImageHarnessProgressPayload,
  rebuildLocalImageBatchSummaryFile,
} from "@/lib/overview/overview-blog-in-content-image-harness-sections";
import type { OverviewHarnessSetters } from "@/lib/overview/overview-blog-overview-harness-mutations";
import {
  buildPeerSitesPlanFile,
  formatPeerSitesChecklistStatus,
  mergeGeneratedFilesByName,
} from "@/lib/overview/overview-peer-csv-details";
import { extractPreferredBodyImageFromHtml } from "@/lib/overview/sap-cross-site-image-search";

export function handleLocalImageHarnessSkip(params: {
  url: string;
  row: BlogInContentImageCatalogRow;
  sourceHtml: string;
  hasExisting: boolean;
  gate: { reason: string };
  harnessSetters: OverviewHarnessSetters;
  updateRow: (index: number, patch: Partial<OverviewRow>) => void;
}): void {
  const { url, row, sourceHtml, hasExisting, gate, harnessSetters, updateRow } = params;
  updateRow(row.index, { status: "idle" });
  // #region agent log
  // #endregion
  harnessSetters.setBulkOptimizationState((prev) => {
    const current = prev[harnessSetters.batchKey];
    if (!current) return prev;
    const urlLocalImageOutcomes = {
      ...(current.urlLocalImageOutcomes || {}),
      [url]: "skipped" as const,
    };
    const urlSkipReasons = {
      ...(current.urlSkipReasons || {}),
      [url]: gate.reason,
    };
    const urlGeneratedFiles = { ...(current.urlGeneratedFiles || {}) };
    const summaryFile = rebuildLocalImageBatchSummaryFile({
      urls: current.urls || [],
      urlKeywords: current.urlKeywords,
      urlOutcomes: urlLocalImageOutcomes,
      urlSkipReasons,
      urlGeneratedFiles,
    });
    return {
      ...prev,
      [harnessSetters.batchKey]: {
        ...current,
        urlStatuses: { ...(current.urlStatuses || {}), [url]: "skipped" },
        urlSkipReasons,
        urlLocalImageOutcomes,
        batchPeerLibraryFiles: mergeGeneratedFilesByName(
          current.batchPeerLibraryFiles || [],
          [summaryFile],
        ),
      },
    };
  });
  const existing = extractPreferredBodyImageFromHtml(sourceHtml);
  const checklistLabel = hasExisting
    ? "Already has Local Image"
    : "No Local Image to replace";
  emitInContentImageHarnessPayload(
    url,
    harnessSetters,
    makeInContentImageHarnessDonePayload(
      row.index,
      IN_CONTENT_STEP_CHECKLIST,
      checklistLabel,
    ),
  );
  emitInContentImageHarnessPayload(
    url,
    harnessSetters,
    makeInContentImageHarnessDonePayload(
      row.index,
      IN_CONTENT_STEP_GENERATE,
      existing?.url
        ? `${gate.reason}\n${existing.url}`
        : gate.reason,
    ),
  );
  emitInContentImageHarnessPayload(
    url,
    harnessSetters,
    makeInContentImageHarnessDonePayload(
      row.index,
      IN_CONTENT_STEP_INSERT,
      hasExisting
        ? "No insert — Local Image already on page"
        : "No insert — nothing to replace",
    ),
  );
  setInContentImageHarnessMessage(
    harnessSetters,
    `${gate.reason} ${row.title || url}`,
  );
}

export function createLocalImageHarnessPeerCallbacks(params: {
  url: string;
  row: BlogInContentImageCatalogRow;
  entity: string;
  harnessSetters: OverviewHarnessSetters;
}): {
  localPhaseLog: () => string;
  onPeerPlanReady: (peers: Array<{ name: string; siteUrl: string }>) => void;
  onPeerCsvReady: (file: { name: string; content: string; mimeType: string }) => void;
  onLocalImagePhase: (info: {
    phase: "looking" | "found" | "not_found" | "reusing" | "generating";
    detail?: string;
  }) => void;
  onPeerLibrariesReady: (
    files: Array<{ name: string; content: string; mimeType: string }>,
  ) => void;
} {
  const { url, row, entity, harnessSetters } = params;
  let localPhaseLog = "";
  const publishPeerPlan = (
    peers: Array<{ name: string; siteUrl: string }>,
  ) => {
    // #region agent log
    // #endregion
    const planFile = buildPeerSitesPlanFile({ entity, peers });
    harnessSetters.setBulkOptimizationState((prev) => {
      const current = prev[harnessSetters.batchKey];
      if (!current) return prev;
      // One batch-level plan only (do not attach per keyword).
      if ((current.batchPeerLibraryFiles || []).some((f) => f.name === planFile.name)) {
        return prev;
      }
      return {
        ...prev,
        [harnessSetters.batchKey]: {
          ...current,
          batchPeerLibraryFiles: mergeGeneratedFilesByName(
            current.batchPeerLibraryFiles || [],
            [planFile],
          ),
        },
      };
    });
    emitInContentImageHarnessPayload(
      url,
      harnessSetters,
      makeInContentImageHarnessDonePayload(
        row.index,
        IN_CONTENT_STEP_CHECKLIST,
        formatPeerSitesChecklistStatus({
          entity,
          peerCount: peers.length,
        }),
      ),
    );
  };

  const attachPeerCsv = (file: {
    name: string;
    content: string;
    mimeType: string;
  }) => {
    harnessSetters.setBulkOptimizationState((prev) => {
      const current = prev[harnessSetters.batchKey];
      if (!current) return prev;
      return {
        ...prev,
        [harnessSetters.batchKey]: {
          ...current,
          batchPeerLibraryFiles: mergeGeneratedFilesByName(
            current.batchPeerLibraryFiles || [],
            [file],
          ),
        },
      };
    });
  };

  const publishLocalPhase = (info: {
    phase: "looking" | "found" | "not_found" | "reusing" | "generating";
    detail?: string;
  }) => {
    localPhaseLog = appendLocalImagePhaseLog(localPhaseLog, info);
    emitInContentImageHarnessPayload(
      url,
      harnessSetters,
      makeInContentImageHarnessProgressPayload(
        row.index,
        IN_CONTENT_STEP_GENERATE,
        localPhaseLog,
      ),
    );
    setInContentImageHarnessMessage(
      harnessSetters,
      formatLocalImagePhaseLine(info),
    );
  };
  const onPeerLibrariesReady = (
    peerCsvFiles: Array<{ name: string; content: string; mimeType: string }>,
  ) => {
    // #region agent log
    // #endregion
    harnessSetters.setBulkOptimizationState((prev) => {
      const current = prev[harnessSetters.batchKey];
      if (!current) return prev;
      return {
        ...prev,
        [harnessSetters.batchKey]: {
          ...current,
          batchPeerLibraryFiles: mergeGeneratedFilesByName(
            current.batchPeerLibraryFiles || [],
            peerCsvFiles,
          ),
        },
      };
    });
  };
  return {
    localPhaseLog: () => localPhaseLog,
    onPeerPlanReady: publishPeerPlan,
    onPeerCsvReady: attachPeerCsv,
    onLocalImagePhase: publishLocalPhase,
    onPeerLibrariesReady,
  };
}
