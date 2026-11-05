import React, { useMemo } from "react";
import { Download } from "lucide-react";
import { OptimizationArtifactDownloads } from "@/components/integrations/wordpress/OptimizationArtifactDownloads";
import { BulkHarnessSectionsPanel } from "@/components/keyword-research/bulk/BulkHarnessSectionsPanel";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";
import type { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import { WorkspaceDetailsSection } from "@/components/shared/WorkspaceDetailsStack";
import { OptimizationProgressInlineStatus } from "@/components/overview/overview-tab/OptimizationProgressInlineStatus";
import { pickLatestOptimizationStatus } from "@/lib/content-optimization/optimization-progress-humanize";
import { Button } from "@/ui";

type Opt = ReturnType<typeof useWordPressOptimization>;

export function SinglePageOptimizationDetailsPanel({
  siteId,
  opt,
  stripeIndex = 0,
  hideRowBody = false,
}: {
  siteId: string;
  opt: Opt;
  pageUrl?: string;
  stripeIndex?: number;
  /** Bulk batch: status only here; harness/files live on the one expanded URL row. */
  hideRowBody?: boolean;
}) {
  const isOptimizing = Boolean(opt.isOptimizingContent[siteId]);
  const progress = opt.optimizationProgress[siteId];
  const fileManager = opt.optimizationFileManagers[siteId];
  const downloadableFiles = useMemo(() => {
    void progress?.filesRevision;
    return fileManager?.getFiles() ?? progress?.generatedFiles ?? [];
  }, [fileManager, progress?.filesRevision, progress?.generatedFiles]);

  const harnessSections = (progress?.harnessSections ?? []) as BulkHarnessSectionUi[];
  const statusLine = pickLatestOptimizationStatus(progress);
  const fileCount = fileManager?.getFileCount() ?? downloadableFiles.length;
  const hasArtifactDownloads = downloadableFiles.some(
    (f) =>
      f.name.toLowerCase().startsWith("checklist-") ||
      f.name.toLowerCase().startsWith("blueprint-") ||
      f.name.toLowerCase().startsWith("content-"),
  );

  if (
    !hideRowBody &&
    harnessSections.length === 0 &&
    !hasArtifactDownloads &&
    fileCount === 0 &&
    !statusLine
  ) {
    return null;
  }
  if (hideRowBody && !statusLine) {
    return null;
  }

  return (
    <WorkspaceDetailsSection stripeIndex={stripeIndex}>
      {statusLine ? (
        <OptimizationProgressInlineStatus progress={progress} isOptimizing={isOptimizing} />
      ) : null}
      {!hideRowBody && harnessSections.length > 0 ? (
        <BulkHarnessSectionsPanel
          harnessSections={harnessSections}
          harnessPlannedSectionCount={progress?.harnessPlannedSectionCount ?? null}
          currentRow={0}
          totalRows={1}
          isProcessing={isOptimizing}
          variant="details-flat"
          hideHeader
          hideProgressMicroLines
          activeIndicator="border"
          blogImportCompact
        />
      ) : null}

      {!hideRowBody && (hasArtifactDownloads || (fileCount > 0 && fileManager)) ? (
        <div className="flex flex-wrap items-center gap-2 px-2.5 py-2 sm:px-3">
          {hasArtifactDownloads ? (
            <OptimizationArtifactDownloads files={downloadableFiles} variant="details" />
          ) : null}
          {fileCount > 0 && fileManager ? (
            <Button
              variant="quiet"
              type="button"
              onClick={() => fileManager.downloadAllFiles()}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download all
            </Button>
          ) : null}
        </div>
      ) : null}
    </WorkspaceDetailsSection>
  );
}
