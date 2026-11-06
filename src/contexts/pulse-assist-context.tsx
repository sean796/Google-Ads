import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  readStoredBlogGeneratorSection,
  registerBlogGeneratorSectionListener,
  unregisterBlogGeneratorSectionListener,
  type BlogGeneratorSectionId,
} from "@/components/blog-generator/blog-generator-sections";
import { CONTENT_OPTIMIZER_SECTION_STORAGE_KEY } from "@/components/content-optimizer/content-optimizer-sections";
import type { ManagerSettingsClusterId } from "@/components/manager/manager-settings-cluster";
import { readStoredResearchSection } from "@/components/research/research-workspace-sections";
import { readStoredSitemapOptimizerSection } from "@/components/research/sitemap-optimizer/sitemap-optimizer-sections";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { useAuth } from "@/contexts/AuthContext";
import { AUTH_DISABLED } from "@/lib/auth-disabled";
import { wordpressSiteDisplayName } from "@/lib/wordpress-site-display-name";
import type { WordPressSite } from "@/components/integrations/types";
import type { AssistNavigateTarget } from "@/lib/pulse-assist/types";

export type PulseAssistOverviewBridge = {
  expandedPageUrl: string | null;
  expandedPageTitle: string | null;
  sitemapSource: string | null;
  postId: number;
};

export type PulseAssistTasksBridge = {
  activeProjectId: number | null;
  activeProjectTitle: string | null;
};

export type PulseAssistContextValue = {
  managerTab: string;
  dashboardCluster: ManagerSettingsClusterId;
  activeSite: WordPressSite | null;
  activeSiteId: string | null;
  allSites: WordPressSite[];
  siteDisplayName: string;
  canAssist: boolean;
  generatorSection: string;
  researchSection?: string;
  sitemapMode?: string;
  contentOptimizerSection?: string;
  overview: PulseAssistOverviewBridge;
  tasks: PulseAssistTasksBridge;
  setOverviewBridge: (patch: Partial<PulseAssistOverviewBridge>) => void;
  setTasksBridge: (patch: Partial<PulseAssistTasksBridge>) => void;
  navigateTo: (target: AssistNavigateTarget) => void;
};

export const defaultOverview: PulseAssistOverviewBridge = {
  expandedPageUrl: null,
  expandedPageTitle: null,
  sitemapSource: null,
  postId: 0,
};

export const defaultTasks: PulseAssistTasksBridge = {
  activeProjectId: null,
  activeProjectTitle: null,
};

export const PulseAssistContext = createContext<PulseAssistContextValue | null>(null);

export function usePulseAssistContext(): PulseAssistContextValue {
  const ctx = useContext(PulseAssistContext);
  if (!ctx) {
    throw new Error("usePulseAssistContext must be used within PulseAssistContextProvider");
  }
  return ctx;
}

export function readContentOptimizerSection(): string | undefined {
  try {
    const v = sessionStorage.getItem(CONTENT_OPTIMIZER_SECTION_STORAGE_KEY);
    if (v === "content" || v === "multi-site") return v;
  } catch {
    /* ignore */
  }
  return undefined;
}


