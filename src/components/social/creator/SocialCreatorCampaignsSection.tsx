import React, { useMemo } from "react";
import { SocialCreatorPostRowCompact } from "@/components/social/creator/SocialCreatorPostRowCompact";
import { SocialCreatorPostRowDetails } from "@/components/social/creator/SocialCreatorPostRowDetails";
import {
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS,
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { overviewGridPageSlice } from "@/components/overview/overview-grid-pagination-helpers";
import { buildPpcMetaGridRows } from "@/components/social/creator/social-creator-row-constants";
import { cn } from "@/lib/utils";
import type { MetaAdContextSource } from "@/lib/social/social-creator-types";
import type { SocialCreatorWorkspaceController } from "@/hooks/social/use-social-creator-workspace";

export type SocialCreatorCampaignsSectionProps = {
  ctrl: SocialCreatorWorkspaceController;
};

export function SocialCreatorCampaignsSection({ ctrl }: SocialCreatorCampaignsSectionProps) {
  const gridRows = useMemo(() => buildPpcMetaGridRows(ctrl.displayPosts), [ctrl.displayPosts]);

  const paginatedGridRows = useMemo(
    () => overviewGridPageSlice(gridRows, ctrl.gridPageIndex),
    [gridRows, ctrl.gridPageIndex],
  );

  const renderPlaceholderStripe = (stripeIndex: number) => (
    <div className={cn(contentOptimizerRowStripeClass(stripeIndex), "flex-1")} aria-hidden />
  );

  const realRowCount = paginatedGridRows.filter(Boolean).length;
  const placeholderCount = paginatedGridRows.length - realRowCount;

  const renderPostRow = (row: SocialCreatorWorkspaceController["posts"][number], stripeIndex: number) => {
    const panelId = `neo-pulse-social-creator-${row.id || stripeIndex}`;
    const isExpanded = ctrl.expandedPostId === row.id;
    const deleteDisabled = ctrl.isGenerating || row.status === "generating";
    const keywordReadOnly = row.status === "generating";
    const fieldsReadOnly = row.status === "generating";
    const generateDisabled = ctrl.isGenerating && row.status !== "generating";
    const isRowGenerating = row.status === "generating";

    const rowGenerateProps = {
      generateDisabled,
      isRowGenerating,
      onGenerate: () => void ctrl.handleGeneratePostRow(row.id),
    };

    const handleKeywordChange = (focusKeyword: string) => {
      ctrl.updatePost(row.id, { focusKeyword });
    };

    const handleContextSourceChange = (contextSource: MetaAdContextSource) => {
      ctrl.updatePost(row.id, { contextSource });
    };

    const handleContextUrlChange = (contextUrl: string) => {
      ctrl.updatePost(row.id, { contextUrl });
    };

    const handleLandingPageChange = (landingPageUrl: string) => {
      ctrl.updatePost(row.id, { landingPageUrl });
    };

    const sharedRowProps = {
      row,
      stripeIndex,
      panelId,
      deleteDisabled,
      keywordReadOnly,
      fieldsReadOnly,
      onToggle: () => ctrl.toggleExpandedPostId(row.id),
      onDelete: () => ctrl.handleDeletePost(row.id),
      onKeywordChange: handleKeywordChange,
      onContextSourceChange: handleContextSourceChange,
      onContextUrlChange: handleContextUrlChange,
      onLandingPageChange: handleLandingPageChange,
      generateConfig: ctrl.generateConfig,
      onUpdateAd: (patch: Parameters<typeof ctrl.updatePost>[1]) => ctrl.updatePost(row.id, patch),
      ...rowGenerateProps,
    };

    if (!isExpanded) {
      return <SocialCreatorPostRowCompact {...sharedRowProps} isExpanded={false} />;
    }

    return (
      <div className={cn(contentOptimizerRowStripeClass(stripeIndex), "w-full min-w-0")}>
        <SocialCreatorPostRowCompact {...sharedRowProps} isExpanded={true} embedded />
        <SocialCreatorPostRowDetails
          row={row}
          panelId={panelId}
          fieldsReadOnly={fieldsReadOnly}
          includeImage={ctrl.generateConfig.includeImage}
          generateConfig={ctrl.generateConfig}
          onUpdateAd={(patch) => ctrl.updatePost(row.id, patch)}
        />
      </div>
    );
  };

  return (
    <div
      className={cn(CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS, "flex min-h-full min-w-0 flex-1 flex-col")}
      aria-label="Social post rows"
    >
      {paginatedGridRows.map((row, index) => {
        if (!row) return null;
        return (
          <div key={row.id} className={cn(CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS, "shrink-0")}>
            {renderPostRow(row, index)}
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
