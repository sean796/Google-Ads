import React, { useMemo } from "react";
import { ContentCreatorRowCompact } from "@/components/social/content-creator/ContentCreatorRowCompact";
import { ContentCreatorRowDetails } from "@/components/social/content-creator/ContentCreatorRowDetails";
import {
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS,
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { overviewGridPageSlice } from "@/components/overview/overview-grid-pagination-helpers";
import { buildContentCreatorGridRows } from "@/components/social/content-creator/content-creator-row-constants";
import { cn } from "@/lib/utils";
import type { ContentCreatorWorkspaceController } from "@/hooks/social/use-content-creator-workspace";

export type ContentCreatorCampaignsSectionProps = {
  ctrl: ContentCreatorWorkspaceController;
};

export function ContentCreatorCampaignsSection({ ctrl }: ContentCreatorCampaignsSectionProps) {
  const gridRows = useMemo(() => buildContentCreatorGridRows(ctrl.displayRows), [ctrl.displayRows]);

  const paginatedGridRows = useMemo(
    () => overviewGridPageSlice(gridRows, ctrl.gridPageIndex),
    [gridRows, ctrl.gridPageIndex],
  );

  const renderPlaceholderStripe = (stripeIndex: number) => (
    <div className={cn(contentOptimizerRowStripeClass(stripeIndex), "flex-1")} aria-hidden />
  );

  const realRowCount = paginatedGridRows.filter(Boolean).length;
  const placeholderCount = paginatedGridRows.length - realRowCount;

  const renderRow = (row: ContentCreatorWorkspaceController["rows"][number], stripeIndex: number) => {
    const panelId = `neo-pulse-content-creator-${row.id || stripeIndex}`;
    const isExpanded = ctrl.expandedRowId === row.id;
    const deleteDisabled = ctrl.isGenerating || row.status === "generating";
    const fieldsReadOnly = row.status === "generating";
    const generateDisabled = ctrl.isGenerating && row.status !== "generating";
    const isRowGenerating = row.status === "generating";

    const sharedRowProps = {
      row,
      stripeIndex,
      panelId,
      deleteDisabled,
      fieldsReadOnly,
      onToggle: () => ctrl.toggleExpandedRowId(row.id),
      onDelete: () => ctrl.handleDeleteRow(row.id),
      onKeywordChange: (keyword: string) => ctrl.updateRow(row.id, { keyword }),
      onLandingPageChange: (landingPageUrl: string) => ctrl.updateRow(row.id, { landingPageUrl }),
      generateDisabled,
      isRowGenerating,
      onGenerate: () => void ctrl.handleGenerateRow(row.id),
    };

    if (!isExpanded) {
      return <ContentCreatorRowCompact {...sharedRowProps} isExpanded={false} />;
    }

    return (
      <div className={cn(contentOptimizerRowStripeClass(stripeIndex), "w-full min-w-0")}>
        <ContentCreatorRowCompact {...sharedRowProps} isExpanded={true} embedded />
        <ContentCreatorRowDetails
          row={row}
          panelId={panelId}
          fieldsReadOnly={fieldsReadOnly}
          onUpdateRow={(patch) => ctrl.updateRow(row.id, patch)}
        />
      </div>
    );
  };

  return (
    <div
      className={cn(CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS, "flex min-h-full min-w-0 flex-1 flex-col")}
      aria-label="Content calendar rows"
    >
      {paginatedGridRows.map((row, index) => {
        if (!row) return null;
        return (
          <div key={row.id} className={cn(CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS, "shrink-0")}>
            {renderRow(row, index)}
          </div>
        );
      })}
      {placeholderCount > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col" aria-hidden>
          {Array.from({ length: placeholderCount }, (_, offset) =>
            renderPlaceholderStripe(realRowCount + offset),
          )}
        </div>
      ) : null}
    </div>
  );
}
