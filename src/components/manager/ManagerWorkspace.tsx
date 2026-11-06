import React from "react";
import { X } from "lucide-react";

import { KnowledgeBaseTab } from "@/components/KnowledgeBaseTab";
import { BlogGeneratorShell } from "@/components/blog-generator/BlogGeneratorShell";
import { IntegrationsTab } from "@/components/IntegrationsTab";
import { ChatTabContent } from "@/components/chat/ChatTabContent";
import { TasksTabContent } from "@/components/manager/tasks/TasksTabContent";
import { PulseForgeTabContent } from "@/components/manager/pulse-forge/PulseForgeTabContent";
import { UsersTabContent } from "@/components/manager/UsersTabContent";
import { SupportTabContent } from "@/components/manager/support/SupportTabContent";
import { SitemapOptimizerResearchTab } from "@/components/research/sitemap-optimizer/SitemapOptimizerResearchTab";
import { PulseHostTabContent } from "@/components/hosting/PulseHostTabContent";
import { AgentLibraryTabContent } from "@/components/manager/agents/AgentLibraryTabContent";
import { ImageStudioTabContent } from "@/components/video-generator/ImageStudioTabContent";
import { VideoGeneratorTabContent } from "@/components/video-generator/VideoGeneratorTabContent";
import { OrganicReportingEmbeddedPanel } from "@/components/organic-dashboard/OrganicReportingEmbeddedPanel";
import { OrganicReportingLocalGridSection } from "@/components/organic-dashboard/local-grid/OrganicReportingLocalGridSection";
import { ApiDocsTabContent } from "@/components/api-docs/ApiDocsTabContent";
import { cn } from "@/lib/utils";
import { ManagerMegaMenuNav } from "@/components/manager/ManagerMegaMenuNav";
import { ManagerTopBarDisplayConsole } from "@/components/manager/ManagerTopBarDisplayConsole";
import { ManagerSeedWorkspaceProvider } from "@/contexts/ManagerSeedWorkspaceProvider";
import { ManagerErrorLogProvider } from "@/contexts/ManagerErrorLogProvider";
import { PulseAssistContextProvider } from "@/contexts/PulseAssistContextProvider";
import { PulseAssistRoot } from "@/components/pulse-assist/PulseAssistRoot";
import { AgentRunsShell } from "@/components/agent-runs/AgentRunsShell";
import { Button, Tabs, TabsContent } from "@/ui";
import type { ManagerWorkspaceProps } from "@/components/manager/manager-workspace-props";
import { useManagerWorkspaceApiKeys } from "@/components/manager/use-manager-workspace-api-keys";
import {
  ManagerWorkspacePlatformTabs,
  ManagerWorkspaceSettingsTab,
  ManagerWorkspaceStickyHeader,
} from "@/components/manager/ManagerWorkspaceSections";

export const ManagerWorkspace: React.FC<ManagerWorkspaceProps> = ({
  variant,
  onClose,
  freeFlowBindings,
  onResetBlueprint,
  onResetWorkspace,
  managerTab,
  onManagerTabChange,
  onManualContentUpdate,
  onFilesUpdate,
  currentKBFiles,
  apiKey,
  setApiKey,
  saveApiKey,
  selectedModel,
  setSelectedModel,
  agentResearchModel,
  setAgentResearchModel,
  agentImageModel,
  setAgentImageModel,
  agentMetaModel,
  setAgentMetaModel,
  agentReportModel,
  setAgentReportModel,
  agentAdsModel,
  setAgentAdsModel,
  temperature,
  setTemperature,
  maxTokens,
  setMaxTokens,
  topP,
  setTopP,
  flowPurpose,
  embeddedTopBarStart,
  embeddedTopBarProgress,
  embeddedFooter,
  managerDashboardCluster,
  onManagerDashboardClusterChange,
  onNavigateToSapGenerator,
  onAssistNavigate,
  onGeneratorSectionChange,
}) => {
  const { dataForSEOApiKey, setDataForSEOApiKey, semrushApiKey, setSemrushApiKey } =
    useManagerWorkspaceApiKeys();
  const embedded = variant === "embedded";
  const displayConsole = <ManagerTopBarDisplayConsole variant="embedded" />;
  const chatFullBleed =
    embedded &&
    (managerTab === "chat" ||
      managerTab === "tasks" ||
      managerTab === "pulse-forge" ||
      managerTab === "image-generator" ||
      managerTab === "video-generator" ||
      managerTab === "generator" ||
      managerTab === "local-dominator" ||
      managerTab === "organic-reporting" ||
      managerTab === "api");
  /** Radix tabpanel must participate in flex-1 chain when embedded; parent-only selectors are unreliable. */
  const embeddedTabPanelStretch = embedded ? "flex h-full min-h-0 flex-1 flex-col overflow-hidden" : undefined;
  const showResetToolbar = embedded && onResetBlueprint && onResetWorkspace;

  /** Embedded: small air gap below the sticky mega menu; overlay keeps classic inset. */
  const embeddedTabPanelTopClass = embedded ? "mt-0" : "mt-2";
  const embeddedMainColumnTopClass = embedded ? "pt-3 md:pt-4" : "pt-2 md:pt-3";
  /** Keeps content width static beside docked rail without shifting when sidebar drawer opens. */
  const embeddedAssistAwareInsetClass = "pr-[var(--neo-pulse-shortcut-rail-width)]";

  const embeddedManagerStickyHeader =
    embedded && showResetToolbar ? (
      <ManagerWorkspaceStickyHeader
        managerTab={managerTab} onManagerTabChange={onManagerTabChange}
        onGeneratorSectionChange={onGeneratorSectionChange} managerDashboardCluster={managerDashboardCluster}
        onManagerDashboardClusterChange={onManagerDashboardClusterChange} embeddedTopBarStart={embeddedTopBarStart}
        embeddedTopBarProgress={embeddedTopBarProgress} displayConsole={displayConsole}
      />
    ) : null;

  const inner = (
    <ManagerErrorLogProvider>
    <ManagerSeedWorkspaceProvider>
    <div
      className={cn("flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden", !embedded && "mx-auto max-w-[1600px]")}
    >
      {!embedded && !showResetToolbar ? (
        <div
          className={cn(
            "mb-3 flex shrink-0 items-center justify-between",
            "text-white"
          )}
        >
          <h1 className="text-lg font-semibold">Manager</h1>
          {variant === "overlay" && onClose ? (
            <Button variant="quiet" onClick={onClose}>
              <X className="h-6 w-6" />
            </Button>
          ) : null}
        </div>
      ) : null}

      <Tabs value={managerTab} onValueChange={onManagerTabChange} className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
        {embedded && showResetToolbar ? null : (
          <div className="mb-2 flex shrink-0 flex-col gap-1.5 text-foreground">
            <div className="flex flex-wrap items-center gap-2.5 justify-between">
              <div className="min-w-0 flex-1 overflow-x-auto px-1">
                <ManagerMegaMenuNav
                  managerTab={managerTab}
                  onManagerTabChange={onManagerTabChange}
                  onGeneratorSectionChange={onGeneratorSectionChange}
                  variant="compact"
                  dashboardCluster={managerDashboardCluster}
                  onDashboardClusterChange={onManagerDashboardClusterChange}
                />
              </div>
              <div className="flex shrink-0">
                <ManagerTopBarDisplayConsole variant="compact" />
              </div>
            </div>
          </div>
        )}

        <div
          className={cn(
            "flex min-h-0 w-full flex-1 flex-col",
            embedded ? "pt-0" : embeddedMainColumnTopClass,
            embedded && "flex h-0 min-h-0 flex-1 flex-col overflow-hidden bg-background pb-0",
            !embedded && "mx-auto max-w-[1600px] overflow-hidden px-3 md:px-6 pb-3 md:pb-4",
          )}
        >
        <div
          className={cn(
            "h-0 min-h-0 w-full max-h-full flex-1",
            embedded && !chatFullBleed && "px-[10%]",
            /* Embedded tabs (non-Free Flow): column flex keeps each visible tabpanel at intrinsic height so scrollHeight matches content */
            embedded &&
              cn(
                "flex flex-col overflow-x-hidden overscroll-y-contain",
                /* Integrations + Generator (incl. Opt): inner shells own vertical scroll; outer must not scroll */
                managerTab === "integrations" ||
                  managerTab === "knowledge" ||
                  managerTab === "generator" ||
                  managerTab === "chat" ||
                  managerTab === "tasks" ||
                  managerTab === "pulse-forge" ||
                  managerTab === "image-generator" ||
                  managerTab === "video-generator" ||
                  managerTab === "api" ||
                  managerTab === "local-dominator" ||
                  managerTab === "organic-reporting"
                  ? "overflow-y-hidden"
                  : "neo-pulse-embedded-tab-scroller overflow-y-auto",
              ),
            !embedded && "flex flex-col overflow-hidden"
          )}
        >
        {/* Mounted only while active: the panel syncs its state into the URL (#organic-reporting), which must not run from other tabs. */}
        <TabsContent
          value="organic-reporting"
          className={cn(
            embeddedTabPanelTopClass,
            "data-[state=inactive]:hidden",
            embeddedTabPanelStretch,
            embedded && "overflow-hidden",
          )}
        >
          {managerTab === "organic-reporting" ? <OrganicReportingEmbeddedPanel /> : null}
        </TabsContent>

        <TabsContent
          value="local-dominator"
          className={cn(
            embeddedTabPanelTopClass,
            "data-[state=inactive]:hidden",
            embeddedTabPanelStretch,
            embedded && "overflow-hidden",
          )}
        >
          {managerTab === "local-dominator" ? <OrganicReportingLocalGridSection /> : null}
        </TabsContent>

        <TabsContent
          value="knowledge"
          className={cn(
            embeddedTabPanelTopClass,
            "data-[state=inactive]:hidden",
            embeddedTabPanelStretch,
            embedded && "overflow-hidden",
          )}
        >
          {managerTab === "knowledge" ? (
            <KnowledgeBaseTab
              onFilesUpdate={onFilesUpdate}
              onManualContentUpdate={onManualContentUpdate}
              currentFiles={currentKBFiles}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="generator" className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}>
          {managerTab === "generator" ? (
            <BlogGeneratorShell
              flowPurpose={flowPurpose}
              dataForSEOApiKey={dataForSEOApiKey}
              openRouterApiKey={apiKey}
              selectedModel={selectedModel}
              temperature={temperature}
              maxTokens={maxTokens}
              topP={topP}
              freeFlowBindings={freeFlowBindings}
              onResetBlueprint={onResetBlueprint}
            />
          ) : null}
        </TabsContent>

        <TabsContent
          value="integrations"
          className={cn(
            embeddedTabPanelTopClass,
            "shadow-none ring-0 ring-offset-0 outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=inactive]:hidden",
            embeddedTabPanelStretch,
          )}
        >
          {managerTab === "integrations" ? (
            <IntegrationsTab onNavigateToSapGenerator={onNavigateToSapGenerator} />
          ) : null}
        </TabsContent>

        <TabsContent value="chat" className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}>
          {managerTab === "chat" ? <ChatTabContent /> : null}
        </TabsContent>

        <TabsContent value="tasks" className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}>
          {managerTab === "tasks" ? <TasksTabContent onOpenPulseForge={() => onManagerTabChange("pulse-forge")} /> : null}
        </TabsContent>

        <TabsContent value="pulse-forge" className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}>
          {managerTab === "pulse-forge" ? <PulseForgeTabContent /> : null}
        </TabsContent>

        <TabsContent value="support" className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}>
          {managerTab === "support" ? <SupportTabContent /> : null}
        </TabsContent>

        <TabsContent value="users" className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}>
          {managerTab === "users" ? <UsersTabContent /> : null}
        </TabsContent>

        <ManagerWorkspaceSettingsTab
          embeddedTabPanelTopClass={embeddedTabPanelTopClass} embeddedTabPanelStretch={embeddedTabPanelStretch}
          managerTab={managerTab} apiKey={apiKey} setApiKey={setApiKey} saveApiKey={saveApiKey}
          dataForSEOApiKey={dataForSEOApiKey} setDataForSEOApiKey={setDataForSEOApiKey}
          semrushApiKey={semrushApiKey} setSemrushApiKey={setSemrushApiKey}
          selectedModel={selectedModel} setSelectedModel={setSelectedModel}
          agentResearchModel={agentResearchModel} setAgentResearchModel={setAgentResearchModel}
          agentImageModel={agentImageModel} setAgentImageModel={setAgentImageModel}
          agentMetaModel={agentMetaModel} setAgentMetaModel={setAgentMetaModel}
          agentReportModel={agentReportModel} setAgentReportModel={setAgentReportModel}
          agentAdsModel={agentAdsModel} setAgentAdsModel={setAgentAdsModel}
          temperature={temperature} setTemperature={setTemperature}
          maxTokens={maxTokens} setMaxTokens={setMaxTokens} topP={topP} setTopP={setTopP}
          managerDashboardCluster={managerDashboardCluster}
          onManagerDashboardClusterChange={onManagerDashboardClusterChange}
        />

        <ManagerWorkspacePlatformTabs
          embedded={embedded} embeddedTabPanelTopClass={embeddedTabPanelTopClass}
          embeddedTabPanelStretch={embeddedTabPanelStretch} managerTab={managerTab}
          apiKey={apiKey} selectedModel={selectedModel} temperature={temperature}
          maxTokens={maxTokens} topP={topP} onManagerTabChange={onManagerTabChange}
        />

        <TabsContent
          value="sitemap-optimizer"
          className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}
        >
          {managerTab === "sitemap-optimizer" ? <SitemapOptimizerResearchTab /> : null}
        </TabsContent>

        <TabsContent
          value="vertical-benchmarks"
          className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}
        >
          {managerTab === "vertical-benchmarks" ? (
            <BlogGeneratorShell
              flowPurpose={flowPurpose}
              dataForSEOApiKey={dataForSEOApiKey}
              openRouterApiKey={apiKey}
              selectedModel={selectedModel}
              temperature={temperature}
              maxTokens={maxTokens}
              topP={topP}
              freeFlowBindings={freeFlowBindings}
              onResetBlueprint={onResetBlueprint}
            />
          ) : null}
        </TabsContent>

        <TabsContent
          value="pulse-host"
          className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}
        >
          {managerTab === "pulse-host" ? <PulseHostTabContent /> : null}
        </TabsContent>

        <TabsContent
          value="agent-library"
          className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}
        >
          {managerTab === "agent-library" ? <AgentLibraryTabContent /> : null}
        </TabsContent>

        <TabsContent
          value="image-generator"
          className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}
        >
          {managerTab === "image-generator" ? <ImageStudioTabContent apiKey={apiKey} bindings={freeFlowBindings} /> : null}
        </TabsContent>

        <TabsContent
          value="video-generator"
          className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}
        >
          {managerTab === "video-generator" ? <VideoGeneratorTabContent apiKey={apiKey} /> : null}
        </TabsContent>

        <TabsContent value="api" className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}>
          {managerTab === "api" ? (
            <ApiDocsTabContent />
          ) : null}
        </TabsContent>
        </div>
        </div>
      </Tabs>
    </div>
    </ManagerSeedWorkspaceProvider>
    </ManagerErrorLogProvider>
  );

  if (variant === "overlay") {
    return (
      <AgentRunsShell>
        <PulseAssistContextProvider
          managerTab={managerTab}
          managerDashboardCluster={managerDashboardCluster}
          onAssistNavigate={onAssistNavigate}
        >
          <div className="absolute inset-0 z-50 flex overflow-hidden bg-black/90 backdrop-blur-sm">
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:p-8">{inner}</div>
            <PulseAssistRoot layout="docked" />
          </div>
        </PulseAssistContextProvider>
      </AgentRunsShell>
    );
  }

  return (
    <AgentRunsShell>
      <PulseAssistContextProvider
        managerTab={managerTab}
        managerDashboardCluster={managerDashboardCluster}
        onAssistNavigate={onAssistNavigate}
      >
        <div className="relative flex h-full min-h-0 min-w-0 w-full max-w-none flex-1 flex-col overflow-hidden bg-background">
          {embeddedManagerStickyHeader}
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
            <div
              className={cn(
                "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
                embeddedAssistAwareInsetClass,
              )}
            >
              {inner}
            </div>
            <div className="neo-pulse-docked-rail-slot pointer-events-none absolute inset-y-0 right-0 z-30 w-[var(--neo-pulse-shortcut-rail-width)]">
              <PulseAssistRoot layout="docked" />
            </div>
          </div>
          {embeddedFooter ? (
            <div className="neo-pulse-embedded-footer-chrome relative z-[60] w-full shrink-0">
              {embeddedFooter}
            </div>
          ) : null}
        </div>
      </PulseAssistContextProvider>
    </AgentRunsShell>
  );
};
