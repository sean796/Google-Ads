import type React from "react";
import type { WordPressSite } from "@/components/integrations/types";
import type { StoredFile } from "@/components/KnowledgeBaseTab";
import type { ManagerSettingsClusterId } from "@/components/manager/manager-settings-cluster";
import type { GeneratorFreeFlowBindings } from "@/components/generator/generator-free-flow-bindings";
import type { AssistNavigateTarget } from "@/lib/pulse-assist/types";
import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";

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
  /** Tools → SEO mega menu generator mode rows. */
  onGeneratorSectionChange?: (section: BlogGeneratorSectionId) => void;
}


export interface ManagerWorkspaceStickyHeaderProps {
  managerTab: string;
  onManagerTabChange: (tab: string) => void;
  onGeneratorSectionChange?: (section: BlogGeneratorSectionId) => void;
  managerDashboardCluster: ManagerSettingsClusterId;
  onManagerDashboardClusterChange: (id: ManagerSettingsClusterId) => void;
  embeddedTopBarStart?: React.ReactNode;
  embeddedTopBarProgress?: React.ReactNode;
  displayConsole: React.ReactNode;
}

export type ManagerWorkspacePlatformTabsProps = Pick<
  ManagerWorkspaceProps,
  "managerTab" | "onManagerTabChange" | "apiKey" | "selectedModel" | "temperature" | "maxTokens" | "topP"
> & {
  embedded: boolean;
  embeddedTabPanelTopClass: string;
  embeddedTabPanelStretch: string | undefined;
};

export type ManagerWorkspaceSettingsTabProps = Pick<
  ManagerWorkspaceProps,
  | "managerTab"
  | "apiKey"
  | "setApiKey"
  | "saveApiKey"
  | "selectedModel"
  | "setSelectedModel"
  | "agentResearchModel"
  | "setAgentResearchModel"
  | "agentImageModel"
  | "setAgentImageModel"
  | "agentMetaModel"
  | "setAgentMetaModel"
  | "agentReportModel"
  | "setAgentReportModel"
  | "agentAdsModel"
  | "setAgentAdsModel"
  | "temperature"
  | "setTemperature"
  | "maxTokens"
  | "setMaxTokens"
  | "topP"
  | "setTopP"
  | "managerDashboardCluster"
  | "onManagerDashboardClusterChange"
> & {
  embeddedTabPanelTopClass: string;
  embeddedTabPanelStretch: string | undefined;
  dataForSEOApiKey: string;
  setDataForSEOApiKey: (key: string) => void;
  semrushApiKey: string;
  setSemrushApiKey: (key: string) => void;
};
