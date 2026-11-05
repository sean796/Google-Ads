import { useState } from "react";
import { useVerticalBenchmarkController } from "@/hooks/vertical-benchmark/use-vertical-benchmark-controller";
import { VerticalBenchmarkClientRoster } from "@/components/vertical-benchmark/VerticalBenchmarkClientRoster";
import { VerticalBenchmarkWorkspaceHeader } from "@/components/vertical-benchmark/VerticalBenchmarkWorkspaceHeader";
import {
  SEO_WORKSPACE_BODY_SCROLL_CLASS,
  SEO_WORKSPACE_HEADER_CLASS,
  SEO_WORKSPACE_SHELL_CLASS,
} from "@/components/seo/seo-workspace-layout";
import { cn } from "@/lib/utils";

type Props = {
  openRouterApiKey: string;
};

export function VerticalBenchmarkShell({ openRouterApiKey }: Props) {
  const c = useVerticalBenchmarkController(openRouterApiKey);

  return (
    <div className={SEO_WORKSPACE_SHELL_CLASS}>
      <div className={SEO_WORKSPACE_HEADER_CLASS}>
        <VerticalBenchmarkWorkspaceHeader
          contentTypeFilter={c.contentTypeFilter}
          onContentTypeFilterChange={c.setContentTypeFilter}
          tagFilter={c.tagFilter}
          onTagFilterChange={c.setTagFilter}
          tagFilterOptions={c.tagFilterOptions}
          onCreateBulkTemplate={c.handleCreateBulkTemplate}
          onDownloadBulkTemplate={c.handleDownloadBulkTemplate}
          canDownloadBulkTemplate={c.canDownloadBulkTemplate}
          onGridCsvFile={c.handleGridCsvFile}
          onClearGridCsv={c.clearGridCsv}
          exporting={c.exporting}
          generatingBulkTemplate={c.generatingBulkTemplate}
          busy={c.busy}
          exportProgress={c.exportProgress}
          bulkTemplateProgress={c.bulkTemplateProgress}
          bulkInventoryLinks={c.bulkInventoryLinks}
          gridCsvContext={c.gridCsvContext}
          gridCsvFileName={c.gridCsvFileName}
          gridCsvParsing={c.gridCsvParsing}
          rosterCount={c.rosterSites.length}
          selectedCount={c.selectedSiteIdList.length}
          blogCount={c.blogCount}
          onBlogCountChange={c.setBlogCount}
        />
      </div>

      <div className={cn(SEO_WORKSPACE_BODY_SCROLL_CLASS, "relative min-h-0 flex-1")}>
        <VerticalBenchmarkClientRoster
          sites={c.rosterSites}
          selectedSiteIds={c.selectedSiteIds}
          clientTagLabelBySiteId={c.clientTagLabelBySiteId}
          tagSortDir={c.tagSortDir}
          onToggleTagSort={c.toggleTagSort}
          onToggleSite={c.toggleSiteSelected}
          onSelectAllChange={(selectAll) => {
            if (selectAll) c.loadAllClients();
            else c.selectNoClients();
          }}
          className="min-h-0 flex-1"
        />
      </div>
    </div>
  );
}
