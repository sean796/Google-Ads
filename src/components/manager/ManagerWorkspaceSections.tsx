import { ManagerMegaMenuNav } from "@/components/manager/ManagerMegaMenuNav";
import { ManagerSettingsContent } from "@/components/manager/ManagerSettingsContent";
import { PpcTabContent } from "@/components/ppc/PpcTabContent";
import { MetaAdsCampaignWorkspace } from "@/components/ppc/meta/MetaAdsCampaignWorkspace";
import { GbpPostShell } from "@/components/gbp-post/GbpPostShell";
import { ContentCreatorCampaignWorkspace } from "@/components/social/content-creator/ContentCreatorCampaignWorkspace";
import { SocialCreatorCampaignWorkspace } from "@/components/social/creator/SocialCreatorCampaignWorkspace";
import { saveDataForSEOApiKey, saveSemrushApiKey } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  MANAGER_SITE_CONSOLE_DOCK_CLASS,
  MANAGER_TOP_BAR_CLASS,
  MANAGER_TOP_BAR_EDGE_INSET_CLASS,
  MANAGER_TOP_BAR_MENU_RAIL_RESERVE_CLASS,
  MANAGER_TOP_BAR_ROW_CLASS,
} from "@/components/manager/manager-top-bar-nav-styles";
import { TabsContent } from "@/ui";
import type {
  ManagerWorkspacePlatformTabsProps,
  ManagerWorkspaceSettingsTabProps,
  ManagerWorkspaceStickyHeaderProps,
} from "@/components/manager/manager-workspace-props";

export function ManagerWorkspaceStickyHeader({
  managerTab,
  onManagerTabChange,
  onGeneratorSectionChange,
  managerDashboardCluster,
  onManagerDashboardClusterChange,
  embeddedTopBarStart,
  embeddedTopBarProgress,
  displayConsole,
}: ManagerWorkspaceStickyHeaderProps) {
  return (
      <div className="neo-pulse-embedded-sticky-chrome sticky top-0 z-[60] w-full shrink-0 bg-black">
        <div
          data-neo-pulse-manager-sticky-nav
          className={cn(MANAGER_TOP_BAR_ROW_CLASS, MANAGER_TOP_BAR_CLASS, "text-foreground shadow-none")}
        >
          <div
            className={cn(
              "flex h-9 min-h-9 items-center gap-2 overflow-hidden self-center",
              MANAGER_TOP_BAR_EDGE_INSET_CLASS,
              MANAGER_TOP_BAR_MENU_RAIL_RESERVE_CLASS,
            )}
          >
            {embeddedTopBarStart ? (
              <div className="flex shrink-0 items-center">{embeddedTopBarStart}</div>
            ) : null}
            <div className="flex min-w-0 items-center overflow-x-auto">
              <ManagerMegaMenuNav
                managerTab={managerTab}
                onManagerTabChange={onManagerTabChange}
                onGeneratorSectionChange={onGeneratorSectionChange}
                variant="embedded"
                dashboardCluster={managerDashboardCluster}
                onDashboardClusterChange={onManagerDashboardClusterChange}
              />
            </div>
          </div>
          <div className={MANAGER_SITE_CONSOLE_DOCK_CLASS}>{displayConsole}</div>
        </div>
        {embeddedTopBarProgress ? (
          <div className="relative z-[1] shrink-0 bg-ui-field px-3 py-1.5 md:px-5 md:py-2">
            {embeddedTopBarProgress}
          </div>
        ) : null}
      </div>
  );
}

export function ManagerWorkspaceSettingsTab({
  embeddedTabPanelTopClass,
  embeddedTabPanelStretch,
  managerTab,
  apiKey,
  setApiKey,
  saveApiKey,
  dataForSEOApiKey,
  setDataForSEOApiKey,
  semrushApiKey,
  setSemrushApiKey,
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
  managerDashboardCluster,
  onManagerDashboardClusterChange,
}: ManagerWorkspaceSettingsTabProps) {
  return (
        <TabsContent
          value="dashboard"
          className={cn(
            embeddedTabPanelTopClass,
            "shadow-none ring-0 ring-offset-0 outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=inactive]:hidden",
            embeddedTabPanelStretch,
          )}
        >
          {managerTab === "dashboard" ? (
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
          ) : null}
        </TabsContent>
  );
}

export function ManagerWorkspacePlatformTabs({
  embedded,
  embeddedTabPanelTopClass,
  embeddedTabPanelStretch,
  managerTab,
  apiKey,
  selectedModel,
  temperature,
  maxTokens,
  topP,
  onManagerTabChange,
}: ManagerWorkspacePlatformTabsProps) {
  return (
    <>
        <TabsContent
          value="ppc-google"
          className={cn(
            embeddedTabPanelTopClass,
            "data-[state=inactive]:hidden",
            embeddedTabPanelStretch,
            embedded && "overflow-hidden",
          )}
        >
          {managerTab === "ppc-google" ? (
            <PpcTabContent
              apiKey={apiKey}
              selectedModel={selectedModel}
              temperature={temperature}
              maxTokens={maxTokens}
              topP={topP}
              onPlatformChange={onManagerTabChange}
            />
          ) : null}
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
          {managerTab === "ppc-meta" ? (
            <MetaAdsCampaignWorkspace
              apiKey={apiKey}
              selectedModel={selectedModel}
              onPlatformChange={onManagerTabChange}
            />
          ) : null}
        </TabsContent>

        <TabsContent
          value="gbp-post"
          className={cn(embeddedTabPanelTopClass, "data-[state=inactive]:hidden", embeddedTabPanelStretch)}
        >
          {managerTab === "gbp-post" ? <GbpPostShell onPlatformChange={onManagerTabChange} /> : null}
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
          {managerTab === "content-calendar" ? (
            <ContentCreatorCampaignWorkspace
              apiKey={apiKey}
              selectedModel={selectedModel}
              onPlatformChange={onManagerTabChange}
            />
          ) : null}
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
          {managerTab === "social-creator" ? (
            <SocialCreatorCampaignWorkspace
              apiKey={apiKey}
              selectedModel={selectedModel}
              onPlatformChange={onManagerTabChange}
            />
          ) : null}
        </TabsContent>
    </>
  );
}
