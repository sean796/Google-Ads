import { BulkGeneratorDetailsDrawer } from "@/components/keyword-research/bulk/BulkGeneratorDetailsDrawer";
import type { LocalAnalysisDetailsPanelProps } from "@/components/sap-generator/LocalAnalysisDetailsPanel";

/** Entity Generator details — same universal drawer as CSV / Prompt / Opt. */
export function EntityDetailsDrawer({
  workspaceBusy,
  headerProgress,
  isProcessing = workspaceBusy,
  status = "",
  harnessSections = [],
  harnessByRow,
  batchPrepHarnessSections,
  harnessPlannedSectionCount = null,
  displayRows,
  currentRow,
  sitemapInventoryLinks = [],
  gscHostedLink = null,
  sitemapInventoryLoading = false,
  prepAccordionTitle = "Sitemap prep",
  pipelineSectionTitles,
  liveMessage,
}: LocalAnalysisDetailsPanelProps) {
  return (
    <BulkGeneratorDetailsDrawer
      variant="prompt"
      workspaceBusy={workspaceBusy}
      headerProgress={
        headerProgress
          ? {
              phase: headerProgress.phase,
              completed: headerProgress.completed,
              total: headerProgress.total,
              progressPct: headerProgress.progressPct,
              harnessActive: harnessSections.length > 0,
            }
          : null
      }
      isProcessing={isProcessing}
      status={status || headerProgress?.phase?.trim() || ""}
      harnessSections={harnessSections}
      harnessByRow={harnessByRow}
      batchPrepHarnessSections={batchPrepHarnessSections}
      harnessPlannedSectionCount={harnessPlannedSectionCount}
      currentRow={currentRow}
      totalRows={displayRows.length}
      displayRows={displayRows}
      postDestination="local"
      wpConfig={null}
      sitemapInventoryLinks={sitemapInventoryLinks}
      siteKwHostedLink={gscHostedLink}
      sitemapInventoryLoading={sitemapInventoryLoading}
      prepAccordionTitle={prepAccordionTitle}
      pipelineSectionTitles={pipelineSectionTitles}
      liveMessage={liveMessage}
      entitySapRowDisplay
    />
  );
}
