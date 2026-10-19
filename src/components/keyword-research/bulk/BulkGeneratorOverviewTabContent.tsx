import React, { useEffect, useMemo, useState } from "react";
import { OverviewStudioRevisionsPage } from "@/components/overview/studio/OverviewStudioRevisionsPage";
import { OverviewStudioTabShell } from "@/components/overview/studio/OverviewStudioTabShell";
import { OverviewVisualDocCanvas } from "@/components/overview/studio/OverviewVisualDocCanvas";
import type { BulkGeneratorWorkspaceBindings } from "@/components/keyword-research/bulk/bulk-generator-workspace-bindings";
import { useOverviewTabController } from "@/hooks/overview/use-overview-tab-controller";
import { useBulkGeneratorOverviewRowSync } from "@/hooks/bulk/use-bulk-generator-overview-row-sync";
import { usePulseAssistOverviewBridge } from "@/hooks/use-pulse-assist-overview-bridge";
import { setStudioDocRevisionsViewBridge } from "@/lib/overview/studio-doc-revisions-view-bridge";
import type { BulkGeneratorStudioVariant } from "@/lib/bulk/bulk-generator-studio-rows";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewSitemapLeftDockBulkGeneratorDock } from "@/components/overview/studio/OverviewSitemapLeftDock";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { BulkPromptComposePanel } from "@/components/keyword-research/bulk/BulkPromptComposePanel";
import { bulkGeneratorDetailsPanelId } from "@/components/keyword-research/bulk/bulk-generator-studio-chrome";
import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import type { MetaBulkMicroSnapshot } from "@/components/overview/OverviewBulkMicroProgress";
import type { ContentOptimizerSectionId } from "@/components/content-optimizer/content-optimizer-sections";
import type { ReactNode } from "react";

export type BulkGeneratorOverviewTabContentProps = {
  site: WordPressSite;
  bindings: BulkGeneratorWorkspaceBindings;
  variant: BulkGeneratorStudioVariant;
  workspaceBusy: boolean;
  apiKey: string;
  selectedModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  bulkGeneratorDock: OverviewSitemapLeftDockBulkGeneratorDock;
  bulkGeneratorDetailsPanel: BulkGeneratorDetailsPanelProps;
  progressSnapshot: MetaBulkMicroSnapshot | null;
  bulkGeneratedFilesStepTotal: number;
  bulkGeneratedFilesStepCompleted: number;
  bulkGeneratorBand2Toolbar: ReactNode;
  optimizerSection: ContentOptimizerSectionId;
  onOptimizerSectionChange: (id: ContentOptimizerSectionId) => void;
};

export function BulkGeneratorOverviewTabContent({
  site,
  bindings,
  variant,
  workspaceBusy,
  apiKey,
  selectedModel,
  temperature,
  maxTokens,
  topP,
  bulkGeneratorDock,
  bulkGeneratorDetailsPanel,
  progressSnapshot,
  bulkGeneratedFilesStepTotal,
  bulkGeneratedFilesStepCompleted,
  bulkGeneratorBand2Toolbar,
  optimizerSection,
  onOptimizerSectionChange,
}: BulkGeneratorOverviewTabContentProps) {
  const [followRunRow, setFollowRunRow] = useState(true);
  const [studioCenterView, setStudioCenterView] = useState<"document" | "revisions">("document");
  const [inFlightAutoSeoUrl, setInFlightAutoSeoUrl] = useState<string | null>(null);

  const patchHandlerRef = React.useRef<(displayIndex: number, patch: Partial<OverviewRow>) => void>(() => {});

  const ctrl = useOverviewTabController({
    site,
    apiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    optimizerSection,
    onOptimizerSectionChange,
    paginationLayoutTotal: Math.max(bindings.displayRows.length, bindings.numberOfBlogs, 1),
    studioRowSource: "bulk-generator",
    onBulkGeneratorOverviewRowPatched: (index, patch) => {
      patchHandlerRef.current(index, patch);
    },
  });

  const sync = useBulkGeneratorOverviewRowSync({
    ctrl,
    bindings,
    variant,
    followRunRow,
    onFollowRunRowChange: setFollowRunRow,
  });

  patchHandlerRef.current = sync.onBulkGeneratorOverviewRowPatched;

  useEffect(() => {
    if (ctrl.expandedPageUrl) {
      const activeKey = normalizePageUrlKey(ctrl.expandedPageUrl);
      const exists = ctrl.displayRows.some((r) => normalizePageUrlKey(r.url) === activeKey);
      if (exists) return;
    }
    if (variant === "prompt" && !bindings.hasGeneratedChecklist) {
      ctrl.setExpandedPageUrl(null);
      return;
    }
    const firstUrl = ctrl.displayRows[0]?.url;
    if (firstUrl) ctrl.setExpandedPageUrl(firstUrl);
  }, [
    ctrl.expandedPageUrl,
    ctrl.displayRows,
    ctrl.setExpandedPageUrl,
    variant,
    bindings.hasGeneratedChecklist,
  ]);

  const activeRowIndex = useMemo(() => {
    if (!ctrl.expandedPageUrl) return -1;
    const activeKey = normalizePageUrlKey(ctrl.expandedPageUrl);
    return ctrl.rows.findIndex((r) => normalizePageUrlKey(r.url) === activeKey);
  }, [ctrl.expandedPageUrl, ctrl.rows]);

  const activeRow = activeRowIndex >= 0 ? ctrl.rows[activeRowIndex] ?? null : null;

  const expandedPageTitle = useMemo(() => {
    if (!activeRow) return null;
    return activeRow.title || ctrl.wpTitlesByUrl[activeRow.url] || null;
  }, [activeRow, ctrl.wpTitlesByUrl]);

  usePulseAssistOverviewBridge({
    sitemapSource: ctrl.sitemapSource,
    expandedPageUrl: activeRow?.url ?? ctrl.expandedPageUrl,
    expandedPageTitle,
  });

  useEffect(() => {
    setStudioDocRevisionsViewBridge({
      openRevisions: () => setStudioCenterView("revisions"),
    });
    return () => setStudioDocRevisionsViewBridge(null);
  }, []);

  useEffect(() => {
    setStudioCenterView("document");
  }, [activeRow?.url]);

  const bulkWorkspaceBusy = workspaceBusy || bindings.isProcessing;

  const showPromptCompose =
    variant === "prompt" && !bindings.hasGeneratedChecklist && studioCenterView === "document";

  const canGenerateContent = useMemo(() => {
    if (bulkWorkspaceBusy) return false;
    if (variant === "csv") return (bindings.rows.length ?? 0) > 0;
    if (variant === "prompt") return bindings.hasGeneratedChecklist;
    return (bindings.displayRows.length ?? 0) > 0;
  }, [bulkWorkspaceBusy, variant, bindings.rows.length, bindings.hasGeneratedChecklist, bindings.displayRows.length]);

  const bulkGeneratorStudioActions = useMemo(
    () => ({
      onGenerateContent: () => void bindings.handleStartProcessing(),
      canGenerateContent,
    }),
    [bindings.handleStartProcessing, canGenerateContent],
  );

  const promptComposeBody = showPromptCompose ? (
    <BulkPromptComposePanel
      generalIntent={bindings.generalIntent}
      onGeneralIntentChange={(v) => bindings.setGeneralIntent(v)}
      numberOfBlogs={bindings.numberOfBlogs}
      onNumberOfBlogsChange={(v) => bindings.setNumberOfBlogs(v)}
      optionalPrompt={bindings.optionalPrompt}
      onOptionalPromptChange={(v) => bindings.setOptionalPrompt(v)}
      workspaceBusy={bulkWorkspaceBusy}
      isGeneratingChecklist={bindings.isGeneratingChecklist}
      hasGeneratedChecklist={bindings.hasGeneratedChecklist}
      promptSiteContextBlocked={
        Boolean(bindings.connectedSite) && !bindings.promptSiteContextReady
      }
      onGenerateChecklist={() => void bindings.handleGenerateChecklist()}
      onApprove={() => void bindings.handleApprove()}
    />
  ) : undefined;

  return (
    <OverviewStudioTabShell
      dock={{
        ctrl,
        activeUrl: activeRow?.url ?? ctrl.expandedPageUrl,
        optimizingRowUrl: sync.optimizingRowUrl,
        batchBulkState: undefined,
        batchRunning: false,
        onSelectUrl: sync.selectDocUrl,
        bulkWorkspaceBusy,
        optimizerSection,
        onOptimizerSectionChange,
        bulkGeneratorDock,
      }}
      main={
        studioCenterView === "revisions" && activeRow ? (
          <OverviewStudioRevisionsPage
            row={activeRow}
            wpTitlesByUrl={ctrl.wpTitlesByUrl}
            siteId={ctrl.site?.id ?? null}
            onBackToEditor={() => setStudioCenterView("document")}
          />
        ) : (
          <OverviewVisualDocCanvas
            ctrl={ctrl}
            row={activeRow}
            rowIndex={activeRowIndex}
            bulkWorkspaceBusy={bulkWorkspaceBusy}
            bulkMicroSnapshot={progressSnapshot}
            batchBulkState={undefined}
            optimizingRowUrl={sync.optimizingRowUrl}
            onInFlightAutoSeoUrlChange={setInFlightAutoSeoUrl}
            onOpenRevisions={() => setStudioCenterView("revisions")}
            bulkGeneratorStudioActions={bulkGeneratorStudioActions}
            bulkGeneratorDetailsPanel={bulkGeneratorDetailsPanel}
            bulkGeneratedFilesPanelId={bulkGeneratorDetailsPanelId(variant)}
            bulkGeneratedFilesStepTotal={bulkGeneratedFilesStepTotal}
            bulkGeneratedFilesStepCompleted={bulkGeneratedFilesStepCompleted}
            bulkGeneratorBand2Toolbar={bulkGeneratorBand2Toolbar}
            studioBody={promptComposeBody}
          />
        )
      }
    />
  );
}
