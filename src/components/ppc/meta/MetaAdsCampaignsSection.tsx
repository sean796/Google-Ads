import React, { useMemo } from "react";
import { MetaAdsAdRowCompact } from "@/components/ppc/meta/MetaAdsAdRowCompact";
import { MetaAdsAdRowDetails } from "@/components/ppc/meta/MetaAdsAdRowDetails";
import {
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS,
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { overviewGridPageSlice } from "@/components/overview/overview-grid-pagination-helpers";
import { buildPpcMetaGridRows } from "@/components/ppc/meta/meta-ads-row-constants";
import { cn } from "@/lib/utils";
import type { MetaAdContextSource } from "@/lib/ppc/meta-ads-types";
import type { PpcMetaWorkspaceController } from "@/hooks/ppc/use-ppc-meta-workspace";

export type MetaAdsCampaignsSectionProps = {
  ctrl: PpcMetaWorkspaceController;
};

export function MetaAdsCampaignsSection({ ctrl }: MetaAdsCampaignsSectionProps) {
  const gridRows = useMemo(() => buildPpcMetaGridRows(ctrl.displayAds), [ctrl.displayAds]);

  const paginatedGridRows = useMemo(
    () => overviewGridPageSlice(gridRows, ctrl.gridPageIndex),
    [gridRows, ctrl.gridPageIndex],
  );

  const renderPlaceholderStripe = (stripeIndex: number) => (
    <div className={cn(contentOptimizerRowStripeClass(stripeIndex), "flex-1")} aria-hidden />
  );

  const realRowCount = paginatedGridRows.filter(Boolean).length;
  const placeholderCount = paginatedGridRows.length - realRowCount;

  const renderAdRow = (row: PpcMetaWorkspaceController["ads"][number], stripeIndex: number) => {
    const panelId = `neo-pulse-ppc-meta-ad-${row.id || stripeIndex}`;
    const isExpanded = ctrl.expandedAdId === row.id;
    const deleteDisabled = ctrl.isGenerating || row.status === "generating";
    const nameReadOnly = row.status === "generating";
    const keywordReadOnly = row.status === "generating";
    const fieldsReadOnly = row.status === "generating";
    const generateDisabled = ctrl.isGenerating && row.status !== "generating";
    const isRowGenerating = row.status === "generating";

    const rowGenerateProps = {
      generateDisabled,
      isRowGenerating,
      onGenerate: () => void ctrl.handleGenerateAdRow(row.id),
    };

    const handleNameChange = (name: string) => {
      ctrl.updateAd(row.id, { adName: name });
    };

    const handleKeywordChange = (focusKeyword: string) => {
      ctrl.updateAd(row.id, { focusKeyword });
    };

    const handleContextSourceChange = (contextSource: MetaAdContextSource) => {
      ctrl.updateAd(row.id, { contextSource });
    };

    const handleContextUrlChange = (contextUrl: string) => {
      ctrl.updateAd(row.id, { contextUrl });
    };

    const handleLandingPageChange = (landingPageUrl: string) => {
      ctrl.updateAd(row.id, { landingPageUrl });
    };

    const sharedRowProps = {
      row,
      stripeIndex,
      panelId,
      deleteDisabled,
      nameReadOnly,
      keywordReadOnly,
      fieldsReadOnly,
      onToggle: () => ctrl.toggleExpandedAdId(row.id),
      onDelete: () => ctrl.handleDeleteAd(row.id),
      onNameChange: handleNameChange,
      onKeywordChange: handleKeywordChange,
      onContextSourceChange: handleContextSourceChange,
      onContextUrlChange: handleContextUrlChange,
      onLandingPageChange: handleLandingPageChange,
      generateConfig: ctrl.generateConfig,
      onUpdateAd: (patch: Parameters<typeof ctrl.updateAd>[1]) => ctrl.updateAd(row.id, patch),
      ...rowGenerateProps,
    };

    if (!isExpanded) {
      return <MetaAdsAdRowCompact {...sharedRowProps} isExpanded={false} />;
    }

    return (
      <div className={cn(contentOptimizerRowStripeClass(stripeIndex), "w-full min-w-0")}>
        <MetaAdsAdRowCompact {...sharedRowProps} isExpanded={true} embedded />
        <MetaAdsAdRowDetails
          row={row}
          panelId={panelId}
          fieldsReadOnly={fieldsReadOnly}
          includeImage={ctrl.generateConfig.includeImage}
          generateConfig={ctrl.generateConfig}
          onUpdateAd={(patch) => ctrl.updateAd(row.id, patch)}
        />
      </div>
    );
  };

  return (
    <div
      className={cn(CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS, "flex min-h-full min-w-0 flex-1 flex-col")}
      aria-label="Meta ad rows"
    >
      {paginatedGridRows.map((row, index) => {
        if (!row) return null;
        return (
          <div key={row.id} className={cn(CONTENT_OPTIMIZER_MULTI_SITE_ROW_WRAPPER_CLASS, "shrink-0")}>
            {renderAdRow(row, index)}
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
