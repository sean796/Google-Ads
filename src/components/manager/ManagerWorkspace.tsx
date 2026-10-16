import React, { lazy, Suspense, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { StoredFile, KnowledgeBaseTab } from "@/components/KnowledgeBaseTab";
import { ManagerSettingsContent } from "@/components/manager/ManagerSettingsContent";
import { BlogGeneratorShell } from "@/components/blog-generator/BlogGeneratorShell";
import { IntegrationsTab } from "@/components/IntegrationsTab";
import { ChatTabContent } from "@/components/chat/ChatTabContent";
import { TasksTabContent } from "@/components/manager/tasks/TasksTabContent";
import { PulseForgeTabContent } from "@/components/manager/pulse-forge/PulseForgeTabContent";
import { UsersTabContent } from "@/components/manager/UsersTabContent";
import { SupportTabContent } from "@/components/manager/support/SupportTabContent";
import { PpcTabContent } from "@/components/ppc/PpcTabContent";
import { MetaAdsCampaignWorkspace } from "@/components/ppc/meta/MetaAdsCampaignWorkspace";
import { GbpPostShell } from "@/components/gbp-post/GbpPostShell";
import { ContentCreatorCampaignWorkspace } from "@/components/social/content-creator/ContentCreatorCampaignWorkspace";
import { SocialCreatorCampaignWorkspace } from "@/components/social/creator/SocialCreatorCampaignWorkspace";
import { SitemapOptimizerResearchTab } from "@/components/research/sitemap-optimizer/SitemapOptimizerResearchTab";
import { VerticalBenchmarkShell } from "@/components/vertical-benchmark/VerticalBenchmarkShell";
import { PulseHostTabContent } from "@/components/hosting/PulseHostTabContent";
import { VideoGeneratorTabContent } from "@/components/video-generator/VideoGeneratorTabContent";
import { NeoEmcpTabContent } from "@/components/neo-emcp/NeoEmcpTabContent";

const ApiDocsTabContent = lazy(() =>
  import("@/components/api-docs/ApiDocsTabContent").then((m) => ({ default: m.ApiDocsTabContent })),
);
import { saveDataForSEOApiKey, saveSemrushApiKey, loadSemrushApiKey } from "@/lib/api";
import type { ManagerSettingsClusterId } from "@/components/manager/manager-settings-cluster";
import type { GeneratorFreeFlowBindings } from "@/components/generator/generator-free-flow-bindings";
import type { AssistNavigateTarget } from "@/lib/pulse-assist/types";
import { cn } from "@/lib/utils";
import { ManagerMegaMenuNav } from "@/components/manager/ManagerMegaMenuNav";
import { ManagerTopBarDisplayConsole } from "@/components/manager/ManagerTopBarDisplayConsole";
import { ManagerSeedWorkspaceProvider } from "@/contexts/manager-seed-workspace-context";
import { ManagerErrorLogProvider } from "@/contexts/manager-error-log-context";
import {
  MANAGER_TOP_BAR_CLASS,
} from "@/components/manager/manager-top-bar-nav-styles";
import { PulseAssistContextProvider } from "@/contexts/pulse-assist-context";
import { PulseAssistRoot } from "@/components/pulse-assist/PulseAssistRoot";
import { AgentRunsShell } from "@/components/agent-runs/AgentRunsShell";
import { OrganicReportingEmbeddedPanel } from "@/components/organic-dashboard/OrganicReportingEmbeddedPanel";

export interface ManagerWorkspaceProps {
  variant: "embedded" | "overlay";
  onClose?: () => void;
  /** Flow + Image bindings for Generator section pills */
  freeFlowBindings?: GeneratorFreeFlowBindings;
  onResetBlueprint?: () => void;
  onResetWorkspace?: () => void;
  managerTab: string;
  onManagerTabChange: (tab: string) => void;
  onManualContentUpdate: (content: string) => void;
  onFilesUpdate: (files: StoredFile[]) => void;
  currentKBFiles: StoredFile[];
  apiKey: string;
  setApiKey: (key: string) => void;
  saveApiKey: (key: string) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  agentResearchModel: string;
  setAgentResearchModel: (model: string) => void;
  agentImageModel: string;
  setAgentImageModel: (model: string) => void;
  agentMetaModel: string;
  setAgentMetaModel: (model: string) => void;
  agentReportModel: string;
  setAgentReportModel: (model: string) => void;
  agentAdsModel: string;
  setAgentAdsModel: (model: string) => void;
  temperature: number;
  setTemperature: (value: number) => void;
  maxTokens: number;
  setMaxTokens: (value: number) => void;
  topP: number;
  setTopP: (value: number) => void;
  flowPurpose?: string;
  /** @deprecated Notifications are built into ManagerTopBarDisplayConsole */
  embeddedTopBarNotifications?: React.ReactNode;
  /** Row 1 far left: logo / brand only. */
  embeddedTopBarStart?: React.ReactNode;
  /** Shown below the top row when set (e.g. generation progress) */
  embeddedTopBarProgress?: React.ReactNode;
  /** Shown at bottom of embedded scroll area (inside the same overflow-y-auto as tab content). */
  embeddedFooter?: React.ReactNode;
  /** Active Dashboard section (Properties, API Keys, …) - synced with mega menu. */
  managerDashboardCluster: ManagerSettingsClusterId;
  onManagerDashboardClusterChange: (id: ManagerSettingsClusterId) => void;
  /** Integrations: open Generator → Entity with site + entity sitemap prefilled. */
  onNavigateToSapGenerator?: (site: WordPressSite, sitemapUrl: string) => void;
  /** Pulse Assist in-app navigation (pulse:nav/... links). */
  onAssistNavigate?: (target: AssistNavigateTarget) => void;
}

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
}) => {
  const [dataForSEOApiKey, setDataForSEOApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem("dataforseo-api-key") || "";
    } catch {
      return "";
    }
  });
  const [semrushApiKey, setSemrushApiKey] = useState<string>(() => {
    try {
      return loadSemrushApiKey();
    } catch {
      return "";
    }
  });
  const embedded = variant === "embedded";
  const displayConsole = (
    <ManagerTopBarDisplayConsole
      variant="embedded"
      managerTab={managerTab}
      onManagerTabChange={onManagerTabChange}
      onResetWorkspace={onResetWorkspace}
      showReset
    />
  );
  const chatFullBleed =
    embedded &&
    (managerTab === "chat" ||
      managerTab === "tasks" ||
      managerTab === "pulse-forge" ||
      managerTab === "video-generator" ||
      managerTab === "api");
  /** Radix tabpanel must participate in flex-1 chain when embedded; parent-only selectors are unreliable. */
  const embeddedTabPanelStretch = embedded ? "flex h-full min-h-0 flex-1 flex-col overflow-hidden" : undefined;
  const showResetToolbar = embedded && onResetBlueprint && onResetWorkspace;

  /** Embedded: small air gap below the sticky mega menu; overlay keeps classic inset. */
  const embeddedTabPanelTopClass = embedded ? "mt-0" : "mt-2";
  const embeddedMainColumnTopClass = embedded ? "pt-3 md:pt-4" : "pt-2 md:pt-3";

  const embeddedManagerStickyHeader =
    embedded && showResetToolbar ? (
      <div className="neo-pulse-embedded-sticky-chrome sticky top-0 z-[60] w-full shrink-0 bg-black">
        <div
          data-neo-pulse-manager-sticky-nav
          className={cn(
            "flex w-full shrink-0 flex-col pt-2.5 pb-2.5 text-foreground shadow-none md:pt-3 md:pb-3",
            MANAGER_TOP_BAR_CLASS,
          )}
        >
          <div className="relative z-[1] flex w-full min-w-0 flex-nowrap items-center gap-2.5 py-1.5 pl-3 pr-0 md:pl-5">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              {embeddedTopBarStart ? (
                <div className="flex shrink-0 items-center">{embeddedTopBarStart}</div>
              ) : null}
              <div className="flex min-w-0 items-center overflow-x-auto">
                <ManagerMegaMenuNav
                  managerTab={managerTab}
                  onManagerTabChange={onManagerTabChange}
                  variant="embedded"
                  dashboardCluster={managerDashboardCluster}
                  onDashboardClusterChange={onManagerDashboardClusterChange}
                />
              </div>
            </div>
            <div className="ml-auto flex shrink-0">{displayConsole}</div>
          </div>
        </div>
        {embeddedTopBarProgress ? (
          <div className="relative z-[1] shrink-0 bg-zinc-900 px-3 py-1.5 md:px-5 md:py-2">
            {embeddedTopBarProgress}
          </div>
        ) : null}
      </div>
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
            <Button onClick={onClose} variant="ghost" className="text-white hover:text-primary">
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
                  variant="compact"
                  dashboardCluster={managerDashboardCluster}
                  onDashboardClusterChange={onManagerDashboardClusterChange}
                />
              </div>
              <div className="flex shrink-0">
                <ManagerTopBarDisplayConsole
                  variant="compact"
                  managerTab={managerTab}
                  onManagerTabChange={onManagerTabChange}
                  onResetWorkspace={onResetWorkspace}
                  showReset={Boolean(showResetToolbar)}
                />
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
                  managerTab === "video-generator" ||
                  managerTab === "neo-emcp" ||
                  managerTab === "api" ||
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
          <OrganicReportingEmbeddedPanel />
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
          <KnowledgeBaseTab
            onFilesUpdate={onFilesUpdate}
            onManualContentUpdate={onManualContentUpdate}
            currentFiles={currentKBFiles}
          />
        </TabsContent>

        <TabsContent value="generator" className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}>
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
        </TabsContent>

        <TabsContent
          value="integrations"
          className={cn(
            embeddedTabPanelTopClass,
            "shadow-none ring-0 ring-offset-0 outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=inactive]:hidden",
            embeddedTabPanelStretch,
          )}
        >
          <IntegrationsTab onNavigateToSapGenerator={onNavigateToSapGenerator} />
        </TabsContent>

        <TabsContent value="chat" className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}>
          <ChatTabContent />
        </TabsContent>

        <TabsContent value="tasks" forceMount className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}>
          <TasksTabContent onOpenPulseForge={() => onManagerTabChange("pulse-forge")} />
        </TabsContent>

        <TabsContent value="pulse-forge" forceMount className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}>
          <PulseForgeTabContent />
        </TabsContent>

        <TabsContent value="support" className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}>
          <SupportTabContent />
        </TabsContent>

        <TabsContent value="users" className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}>
          <UsersTabContent />
        </TabsContent>

        <TabsContent
          value="dashboard"
          className={cn(
            embeddedTabPanelTopClass,
            "shadow-none ring-0 ring-offset-0 outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=inactive]:hidden",
            embeddedTabPanelStretch,
          )}
        >
          <ManagerSettingsContent
            apiKey={apiKey}
            setApiKey={setApiKey}
            saveApiKey={saveApiKey}
            dataForSEOApiKey={dataForSEOApiKey}
            setDataForSEOApiKey={setDataForSEOApiKey}
            saveDataForSEOApiKeyToStorage={saveDataForSEOApiKey}
            semrushApiKey={semrushApiKey}
            setSemrushApiKey={setSemrushApiKey}
            saveSemrushApiKeyToStorage={saveSemrushApiKey}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            agentResearchModel={agentResearchModel}
            setAgentResearchModel={setAgentResearchModel}
            agentImageModel={agentImageModel}
            setAgentImageModel={setAgentImageModel}
            agentMetaModel={agentMetaModel}
            setAgentMetaModel={setAgentMetaModel}
            agentReportModel={agentReportModel}
            setAgentReportModel={setAgentReportModel}
            agentAdsModel={agentAdsModel}
            setAgentAdsModel={setAgentAdsModel}
            temperature={temperature}
            setTemperature={setTemperature}
            maxTokens={maxTokens}
            setMaxTokens={setMaxTokens}
            topP={topP}
            setTopP={setTopP}
            settingsCluster={managerDashboardCluster}
            onSettingsClusterChange={onManagerDashboardClusterChange}
          />
        </TabsContent>

        <TabsContent
          value="ppc-google"
          className={cn(
            embeddedTabPanelTopClass,
            "data-[state=inactive]:hidden",
            embeddedTabPanelStretch,
            embedded && "overflow-hidden",
          )}
        >
          <PpcTabContent
            apiKey={apiKey}
            selectedModel={selectedModel}
            temperature={temperature}
            maxTokens={maxTokens}
            topP={topP}
            onPlatformChange={onManagerTabChange}
          />
        </TabsContent>

        <TabsContent
          value="ppc-meta"
          className={cn(
            embeddedTabPanelTopClass,
            "data-[state=inactive]:hidden",
            embeddedTabPanelStretch,
            embedded && "overflow-hidden",
          )}
        >
          <MetaAdsCampaignWorkspace
            apiKey={apiKey}
            selectedModel={selectedModel}
            onPlatformChange={onManagerTabChange}
          />
        </TabsContent>

        <TabsContent
          value="gbp-post"
          className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}
        >
          <GbpPostShell onPlatformChange={onManagerTabChange} />
        </TabsContent>

        <TabsContent
          value="content-calendar"
          className={cn(
            embeddedTabPanelTopClass,
            "data-[state=inactive]:hidden",
            embeddedTabPanelStretch,
            embedded && "overflow-hidden",
          )}
        >
          <ContentCreatorCampaignWorkspace
            apiKey={apiKey}
            selectedModel={selectedModel}
            onPlatformChange={onManagerTabChange}
          />
        </TabsContent>

        <TabsContent
          value="social-creator"
          className={cn(
            embeddedTabPanelTopClass,
            "data-[state=inactive]:hidden",
            embeddedTabPanelStretch,
            embedded && "overflow-hidden",
          )}
        >
          <SocialCreatorCampaignWorkspace
            apiKey={apiKey}
            selectedModel={selectedModel}
            onPlatformChange={onManagerTabChange}
          />
        </TabsContent>

        <TabsContent
          value="sitemap-optimizer"
          className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}
        >
          <SitemapOptimizerResearchTab />
        </TabsContent>

        <TabsContent
          value="vertical-benchmarks"
          className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}
        >
          <VerticalBenchmarkShell openRouterApiKey={apiKey} />
        </TabsContent>


        <TabsContent
          value="pulse-host"
          className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}
        >
          <PulseHostTabContent />
        </TabsContent>

        <TabsContent
          value="video-generator"
          className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}
        >
          <VideoGeneratorTabContent apiKey={apiKey} />
        </TabsContent>

        <TabsContent
          value="neo-emcp"
          className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}
        >
          <NeoEmcpTabContent apiKey={apiKey} />
        </TabsContent>

        <TabsContent value="api" className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}>
          <Suspense fallback={null}>
            <ApiDocsTabContent />
          </Suspense>
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
      <PulseAssistContextProvider managerTab={managerTab} onAssistNavigate={onAssistNavigate}>
        <div className="flex h-full min-h-0 min-w-0 w-full max-w-none flex-1 flex-col overflow-hidden bg-background">
          {embeddedManagerStickyHeader}
          <div className="relative flex min-h-0 min-w-0 w-full flex-1 flex-row gap-0 overflow-hidden">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pr-[var(--neo-pulse-shortcut-rail-width)]">
              {inner}
              {embeddedFooter ? (
                <div className="neo-pulse-embedded-footer-chrome relative z-[60] w-full shrink-0">
                  {embeddedFooter}
                </div>
              ) : null}
            </div>
            <div className="neo-pulse-docked-rail-slot pointer-events-none absolute inset-y-0 right-0 z-30 w-[var(--neo-pulse-shortcut-rail-width)]">
              <PulseAssistRoot layout="docked" />
            </div>
          </div>
        </div>
      </PulseAssistContextProvider>
    </AgentRunsShell>
  );
};
