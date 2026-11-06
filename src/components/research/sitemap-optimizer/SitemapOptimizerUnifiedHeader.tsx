import { useMemo } from "react";
import { GitMerge } from "lucide-react";
import { UnifiedWorkspaceChrome } from "@/components/shared/UnifiedWorkspaceChrome";
import type { SitemapUrlOptimizerWorkspaceBindings } from "@/components/research/sitemap-optimizer/sitemap-url-optimizer-workspace-bindings";
import type { SitemapPlanDetailsPanelProps } from "@/components/research/sitemap-optimizer/SitemapPlanDetailsPanel";
import { SitemapPlanToolbar, type SitemapPlanToolbarProps } from "@/components/research/sitemap-optimizer/SitemapPlanToolbar";
import { SitemapPlanCollectionPills } from "@/components/research/sitemap-optimizer/SitemapPlanCollectionPills";
import { SitemapWorkspaceModePills } from "@/components/research/sitemap-optimizer/SitemapWorkspaceModePills";
import { UrlOptimizerToolbar } from "@/components/research/url-optimizer/UrlOptimizerToolbar";
import { ContentOptimizerDetailsDrawer } from "@/components/overview/overview-tab/ContentOptimizerDetailsDrawer";
import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { SitemapOptimizerWorkspaceMode } from "@/lib/sitemap-optimizer/types";
import {
  buildSitemapMergePublishBulkGeneratorDetailsProps,
  type SitemapMergePublishDetailsInput,
} from "@/lib/sitemap-optimizer/sitemap-merge-publish-bulk-details-bindings";
import { buildSitemapPlanBulkGeneratorDetailsProps } from "@/lib/sitemap-optimizer/sitemap-plan-bulk-details-bindings";
import { buildUrlOptimizerBulkGeneratorDetailsProps } from "@/lib/sitemap-optimizer/url-optimizer-bulk-details-bindings";

export type SitemapOptimizerUnifiedHeaderProps = {
  workspaceSubMode: SitemapOptimizerWorkspaceMode;
  onWorkspaceSubModeChange: (mode: SitemapOptimizerWorkspaceMode) => void;
  modeSwitchDisabled: boolean;
  workspaceBusy: boolean;
  planToolbarProps: SitemapPlanToolbarProps;
  planProgressSnapshot: MetaBulkMicroSnapshot | null;
  planCanOpenDetails: boolean;
  planIsProcessing: boolean;
  planDetailsProps: SitemapPlanDetailsPanelProps;
  planBusy: boolean;
  mergePublishActive: boolean;
  mergePublishCanOpenDetails: boolean;
  mergePublishProgressSnapshot: MetaBulkMicroSnapshot | null;
  mergePublishIsProcessing: boolean;
  mergePublishDetailsInput: SitemapMergePublishDetailsInput;
  urlBindings: SitemapUrlOptimizerWorkspaceBindings | null;
};

export function SitemapOptimizerUnifiedHeader({
  workspaceSubMode,
  onWorkspaceSubModeChange,
  modeSwitchDisabled,
  workspaceBusy,
  planToolbarProps,
  planProgressSnapshot,
  planCanOpenDetails,
  planIsProcessing,
  planDetailsProps,
  planBusy,
  mergePublishActive,
  mergePublishCanOpenDetails,
  mergePublishProgressSnapshot,
  mergePublishIsProcessing,
  mergePublishDetailsInput,
  urlBindings,
}: SitemapOptimizerUnifiedHeaderProps) {
  const isPlan = workspaceSubMode === "plan";
  const isUrl = workspaceSubMode === "url_optimizer";
  const useMergePublish = isPlan && mergePublishActive;

  const progressSnapshot = useMergePublish
    ? mergePublishProgressSnapshot
    : isPlan
      ? planProgressSnapshot
      : (urlBindings?.progressSnapshot ?? null);

  const canOpenDetails = useMergePublish
    ? mergePublishCanOpenDetails
    : isPlan
      ? planCanOpenDetails
      : Boolean(urlBindings?.canOpenDetails);

  const isProcessing = useMergePublish
    ? mergePublishIsProcessing
    : isPlan
      ? planIsProcessing
      : Boolean(urlBindings?.running);

  const detailsPanelId = useMergePublish
    ? "sitemap-merge-publish-details-panel"
    : isPlan
      ? "sitemap-plan-details-panel"
      : "sitemap-url-optimizer-details-panel";

  const planDrawerProps = useMemo(
    () => buildSitemapPlanBulkGeneratorDetailsProps({ ...planDetailsProps, busy: planBusy }),
    [planDetailsProps, planBusy],
  );

  const urlDrawerProps = useMemo(
    () =>
      urlBindings?.detailsProps
        ? buildUrlOptimizerBulkGeneratorDetailsProps(urlBindings.detailsProps)
        : null,
    [urlBindings?.detailsProps],
  );

  const mergePublishDrawerProps = useMemo(
    () => buildSitemapMergePublishBulkGeneratorDetailsProps(mergePublishDetailsInput),
    [mergePublishDetailsInput],
  );

  const activeDrawerProps = useMergePublish
    ? mergePublishDrawerProps
    : isPlan
      ? planDrawerProps
      : urlDrawerProps;

  return (
    <UnifiedWorkspaceChrome
      icon={GitMerge}
      title="Sitemap"
      titleRowMenu={
        isPlan ? (
          <SitemapPlanCollectionPills
            collectionOptions={planToolbarProps.collectionOptions}
            selected={planToolbarProps.selected}
            selectCollection={planToolbarProps.selectCollection}
            disabled={planToolbarProps.busy}
          />
        ) : null
      }
      titleRowEnd={
        <SitemapWorkspaceModePills
          workspaceSubMode={workspaceSubMode}
          onWorkspaceSubModeChange={onWorkspaceSubModeChange}
          disabled={modeSwitchDisabled}
        />
      }
      workspaceBusy={workspaceBusy}
      progressSnapshot={progressSnapshot}
      canOpenDetails={canOpenDetails}
      isProcessing={isProcessing}
      detailsPanelId={detailsPanelId}
      toolbar={
        isPlan ? (
          <SitemapPlanToolbar {...planToolbarProps} />
        ) : isUrl && urlBindings ? (
          <UrlOptimizerToolbar {...urlBindings.toolbarProps} />
        ) : null
      }
      detailsPanel={
        activeDrawerProps ? (
          <ContentOptimizerDetailsDrawer
            postDestination={
              useMergePublish && mergePublishDetailsInput.bulkState ? "wordpress" : "local"
            }
            {...activeDrawerProps}
          />
        ) : null
      }
    />
  );
}
