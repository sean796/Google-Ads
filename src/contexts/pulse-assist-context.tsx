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

type PulseAssistContextValue = {
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

const defaultOverview: PulseAssistOverviewBridge = {
  expandedPageUrl: null,
  expandedPageTitle: null,
  sitemapSource: null,
  postId: 0,
};

const defaultTasks: PulseAssistTasksBridge = {
  activeProjectId: null,
  activeProjectTitle: null,
};

const PulseAssistContext = createContext<PulseAssistContextValue | null>(null);

export function usePulseAssistContext(): PulseAssistContextValue {
  const ctx = useContext(PulseAssistContext);
  if (!ctx) {
    throw new Error("usePulseAssistContext must be used within PulseAssistContextProvider");
  }
  return ctx;
}

function readContentOptimizerSection(): string | undefined {
  try {
    const v = sessionStorage.getItem(CONTENT_OPTIMIZER_SECTION_STORAGE_KEY);
    if (v === "content" || v === "multi-site") return v;
  } catch {
    /* ignore */
  }
  return undefined;
}

export function PulseAssistContextProvider({
  managerTab,
  managerDashboardCluster,
  onAssistNavigate,
  children,
}: {
  managerTab: string;
  managerDashboardCluster: ManagerSettingsClusterId;
  onAssistNavigate?: (target: AssistNavigateTarget) => void;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const { sites } = useWordPressSites();
  const { activeWordPressSiteId } = useActiveWordPressSite();
  const [overview, setOverviewState] = useState<PulseAssistOverviewBridge>(defaultOverview);
  const [tasks, setTasksState] = useState<PulseAssistTasksBridge>(defaultTasks);

  const connectedSites = useMemo(() => sites, [sites]);

  const activeSite = useMemo(
    () => connectedSites.find((s) => s.id === activeWordPressSiteId && s.enabled !== false) ?? null,
    [connectedSites, activeWordPressSiteId],
  );

  const [generatorSection, setGeneratorSection] = useState<string>(() => {
    try {
      return readStoredBlogGeneratorSection() || "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    const onSection = (id: BlogGeneratorSectionId) => setGeneratorSection(id);
    registerBlogGeneratorSectionListener(onSection);
    return () => unregisterBlogGeneratorSectionListener(onSection);
  }, []);

  useEffect(() => {
    if (managerTab === "generator") {
      try {
        setGeneratorSection(readStoredBlogGeneratorSection() || "");
      } catch {
        /* ignore */
      }
    }
  }, [managerTab]);

  const researchSection = useMemo(() => {
    if (managerTab !== "generator" || generatorSection !== "research") return undefined;
    return readStoredResearchSection();
  }, [managerTab, generatorSection]);

  const sitemapMode = useMemo(() => {
    if (managerTab !== "sitemap-optimizer") return undefined;
    return readStoredSitemapOptimizerSection();
  }, [managerTab]);

  const contentOptimizerSection = useMemo(() => {
    if (managerTab !== "generator" || generatorSection !== "opt") return undefined;
    return readContentOptimizerSection();
  }, [managerTab, generatorSection]);

  const setOverviewBridge = useCallback((patch: Partial<PulseAssistOverviewBridge>) => {
    setOverviewState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setTasksBridge = useCallback((patch: Partial<PulseAssistTasksBridge>) => {
    setTasksState((prev) => ({ ...prev, ...patch }));
  }, []);

  const navigateTo = useCallback(
    (target: AssistNavigateTarget) => {
      onAssistNavigate?.(target);
    },
    [onAssistNavigate],
  );

  const value = useMemo(
    (): PulseAssistContextValue => ({
      managerTab,
      dashboardCluster: managerDashboardCluster,
      activeSite,
      activeSiteId: activeWordPressSiteId,
      allSites: connectedSites,
      siteDisplayName: activeSite ? wordpressSiteDisplayName(activeSite) : "",
      canAssist: AUTH_DISABLED || Boolean(user),
      generatorSection,
      researchSection,
      sitemapMode,
      contentOptimizerSection,
      overview,
      tasks,
      setOverviewBridge,
      setTasksBridge,
      navigateTo,
    }),
    [
      managerTab,
      managerDashboardCluster,
      activeSite,
      activeWordPressSiteId,
      connectedSites,
      generatorSection,
      researchSection,
      sitemapMode,
      contentOptimizerSection,
      overview,
      tasks,
      setOverviewBridge,
      setTasksBridge,
      navigateTo,
      user,
    ],
  );

  return <PulseAssistContext.Provider value={value}>{children}</PulseAssistContext.Provider>;
}
