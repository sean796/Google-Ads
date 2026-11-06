import React from "react";
import { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import { ContentOptimizationControls } from "@/components/integrations/wordpress/ContentOptimizationControls";
import { OptimizationSettingsPanel } from "@/components/integrations/wordpress/OptimizationSettingsPanel";
import { DEFAULT_SETTINGS } from "@/lib/optimization-settings-defaults";
import { OptimizationHistoryPanel } from "@/components/integrations/wordpress/OptimizationHistoryPanel";
import { BulkOptimizationPanel } from "@/components/integrations/wordpress/BulkOptimizationPanel";
import { GscPerformancePreviewRow } from "@/components/integrations/wordpress/GscPerformancePreviewRow";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_BATCH_CLEARED_FROM_VIEW } from "@/lib/notify-messages";
import type { WordPressSite } from "@/components/integrations/types";

/** Single-site + bulk content optimization UI (used inside Content Optimizer shell). */
export const ContentOptimizerRunPanel: React.FC<{ site: WordPressSite }> = ({ site }) => {
  const opt = useWordPressOptimization();
  const batchKey = `${site.id}-batch`;
  const bulkState = opt.bulkOptimizationState[batchKey] ?? null;
  const batchProgress = opt.optimizationProgress[batchKey];

  const isBusy =
    Boolean(opt.isOptimizingContent[site.id]) || Boolean(opt.isOptimizingContent[batchKey]);
  const rowProgress = opt.optimizationProgress[site.id] ?? batchProgress;
  const progressText = `${rowProgress?.step || ""} ${rowProgress?.message || ""}`.toLowerCase();
  const gscMap = opt.gscPerformancePreview[site.id] || {};
  const singleOptimizeUrl =
    typeof opt.optimizeUrl[site.id] === "string" ? (opt.optimizeUrl[site.id] as string) : "";
  const bulkActiveUrl =
    bulkState?.urls?.length && typeof bulkState.currentIndex === "number"
      ? bulkState.urls[bulkState.currentIndex] ?? null
      : null;
  const gscContextUrl = bulkState ? bulkActiveUrl : singleOptimizeUrl;
  const gscSnapshotForContext = gscContextUrl ? gscMap[gscContextUrl] : undefined;
  const gscPreviewLoading =
    isBusy &&
    !gscSnapshotForContext?.queries?.length &&
    (progressText.includes("gsc") ||
      progressText.includes("search console") ||
      progressText.includes("page performance"));

  return (
    <div className="space-y-6 text-base">
      {bulkState ? (
        <BulkOptimizationPanel
          variant="page"
          bulkState={bulkState}
          batchKey={batchKey}
          siteProgress={rowProgress}
          pageTitle={`Content Optimizer - ${site.name}`}
          pageSubtitle="Bulk operation in progress"
          gscPreviewByUrl={gscMap}
          gscActiveUrl={bulkActiveUrl}
          gscFetching={gscPreviewLoading}
          onRequestClose={({ abortingRun }) => {
            opt.resetBulkBatch(batchKey);
            if (abortingRun) {
              notify.info(NOTIFY_BATCH_CLEARED_FROM_VIEW);
            }
          }}
        />
      ) : null}

      <div className={cn("space-y-4", bulkState && "mt-6")}>
        {!bulkState &&
        (gscSnapshotForContext?.queries?.length || (gscPreviewLoading && singleOptimizeUrl)) ? (
          <div className="py-1">
            <GscPerformancePreviewRow
              snapshot={gscSnapshotForContext ?? null}
              loading={gscPreviewLoading && !gscSnapshotForContext?.queries?.length}
            />
          </div>
        ) : null}
        <ContentOptimizationControls
          cardClassName="mt-4 w-full border-0 bg-transparent shadow-none"
          site={site}
          url={opt.optimizeUrl[site.id] || ""}
          updateMode={opt.optimizeUpdateMode[site.id] || "update"}
          isOptimizing={isBusy}
          progress={rowProgress}
          fileManager={opt.optimizationFileManagers[site.id]}
          onUrlChange={(url) => {
            opt.setGscPerformancePreview((p) => ({ ...p, [site.id]: {} }));
            opt.setOptimizeUrl((prev) => ({ ...prev, [site.id]: url }));
          }}
          onUpdateModeChange={(mode) => opt.setOptimizeUpdateMode((p) => ({ ...p, [site.id]: mode }))}
          onOptimize={(postData) => opt.handleOptimize(site, postData)}
          multiSelect
          optimizationOptions={
            opt.optimizationOptions[site.id] || {
              optimizeTitle: true,
              optimizeMeta: true,
              optimizeExcerpt: true,
              optimizeContent: true,
              optimizeFeaturedImage: false,
              autoOptimize: true,
              testMode: false,
              stagingSite: false,
              bulkFaqMinimum4: false,
            }
          }
          onOptimizationOptionsChange={(o) => opt.setOptimizationOptions((p) => ({ ...p, [site.id]: o }))}
          inContentImageType={opt.inContentImageTypes[site.id] || ""}
          inContentImagePrompt={opt.inContentImagePrompts[site.id] || ""}
          onInContentImageTypeChange={(t) => opt.setInContentImageTypes((p) => ({ ...p, [site.id]: t }))}
          onInContentImagePromptChange={(pr) => opt.setInContentImagePrompts((p) => ({ ...p, [site.id]: pr }))}
        />

        <OptimizationSettingsPanel
          site={site}
          settings={opt.optimizationSettings[site.id] || DEFAULT_SETTINGS}
          onSettingsChange={(s) => opt.handleOptimizationSettingsChange(site.id, s)}
          disabled={isBusy}
        />

        <OptimizationHistoryPanel
          site={site}
          history={opt.optimizationHistory[site.id] || []}
          onClearHistory={() => opt.handleClearHistory(site.id)}
          disabled={false}
        />
      </div>
    </div>
  );
};
