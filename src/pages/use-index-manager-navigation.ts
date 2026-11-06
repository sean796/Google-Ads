import { useState, useCallback, useEffect, useLayoutEffect } from "react";
import type { Location, NavigateFunction } from "react-router-dom";
import type { QueryClient } from "@tanstack/react-query";
import type { WordPressSite } from "@/components/integrations/types";
import {
  readStoredManagerSettingsCluster,
  writeStoredManagerSettingsCluster,
  type ManagerSettingsClusterId,
} from "@/components/manager/manager-settings-cluster";
import { executeAssistNavigation } from "@/lib/pulse-assist/navigation";
import { registerAgentRunOptimizerNavigation, type useAgentRunOptimizerScope } from "@/contexts/agent-run-optimizer-scope-context";
import { fetchAgentRun } from "@/lib/agent-runs-api";
import {
  isAgentRunOptimizerPath,
  parseAgentRunIdFromPath,
  parseGeneratorSectionFromPath,
  writeGeneratorSectionPath,
} from "@/lib/agent-runs/agent-run-optimizer-url";
import { managerTabPath } from "@/lib/manager-tab-routes";
import {
  type BlogGeneratorSectionId,
  coerceBlogGeneratorSectionId,
  readStoredBlogGeneratorSection,
  writeStoredBlogGeneratorSection,
} from "@/components/blog-generator/blog-generator-sections";
import { writeStoredStudioEditorMode } from "@/components/keyword-research/bulk/studio-editor-modes";
import { prefetchOrganicDashboardBundle } from "@/lib/organic-dashboard/organic-dashboard-prefetch";
import {
  NEO_PULSE_OPEN_ORGANIC_REPORTING_EVENT,
  ORGANIC_REPORTING_MANAGER_TAB,
  type OpenOrganicReportingDetail,
} from "@/lib/organic-dashboard/organic-reporting-nav";
import { NEO_PULSE_OPEN_MASTER_RULES_EVENT } from "@/lib/open-master-rules-settings";
import { isApiTabPath } from "@/lib/api-docs/api-docs-route";
import { isPulseForgePath, parsePulseForgeRoute, setPulseForgeRoute } from "@/lib/pulse-forge/pulse-forge-route";
import { isPulseHostPath } from "@/lib/hosting/pulse-host-route";

type AgentRunOptimizerScopeApi = ReturnType<typeof useAgentRunOptimizerScope>;

type UseIndexManagerNavigationArgs = {
  navigate: NavigateFunction;
  location: Location;
  queryClient: QueryClient;
  sites: WordPressSite[];
  activeWordPressSiteId: string | null;
  setActiveWordPressSiteId: (siteId: string) => void;
  teamId?: number;
  hydrateScopeFromRun: AgentRunOptimizerScopeApi["hydrateScopeFromRun"];
  clearAgentRunOptimizerScope: AgentRunOptimizerScopeApi["clearAgentRunOptimizerScope"];
  agentRunOptimizerScope: AgentRunOptimizerScopeApi["scope"];
};

export function useIndexManagerNavigation({
  navigate,
  location,
  queryClient,
  sites,
  activeWordPressSiteId,
  setActiveWordPressSiteId,
  teamId,
  hydrateScopeFromRun,
  clearAgentRunOptimizerScope,
  agentRunOptimizerScope,
}: UseIndexManagerNavigationArgs) {
  const [managerDashboardCluster, setManagerDashboardCluster] = useState<ManagerSettingsClusterId>(() =>
    readStoredManagerSettingsCluster(),
  );

  const handleManagerDashboardClusterChange = useCallback((id: ManagerSettingsClusterId) => {
    setManagerDashboardCluster(id);
    writeStoredManagerSettingsCluster(id);
  }, []);

  useEffect(() => {
    const onOpenMasterRules = () => {
      navigate("/dashboard");
      handleManagerDashboardClusterChange("master-rules");
    };
    window.addEventListener(NEO_PULSE_OPEN_MASTER_RULES_EVENT, onOpenMasterRules as EventListener);
    return () => {
      window.removeEventListener(NEO_PULSE_OPEN_MASTER_RULES_EVENT, onOpenMasterRules as EventListener);
    };
  }, [handleManagerDashboardClusterChange, navigate]);

  const handleManagerTabChange = useCallback(
    (tab: string) => {
      if (tab === "vertical-benchmarks") {
        clearAgentRunOptimizerScope();
        writeStoredStudioEditorMode("vertical-benchmarks");
        writeStoredBlogGeneratorSection("bulk-prompt");
        navigate("/generator/bulk-prompt");
        return;
      }
      if (tab !== "generator") {
        clearAgentRunOptimizerScope();
      }
      if (tab === "generator") {
        navigate(managerTabPath("generator", readStoredBlogGeneratorSection()));
        return;
      }
      if (tab === "api") {
        navigate(isApiTabPath(location.pathname) ? location.pathname : "/api");
        return;
      }
      if (tab === "pulse-forge") {
        navigate(isPulseForgePath(location.pathname) ? location.pathname : "/pulse-forge/forge");
        return;
      }
      if (tab === "pulse-host") {
        navigate(isPulseHostPath(location.pathname) ? location.pathname : "/pulse-host");
        return;
      }
      navigate(managerTabPath(tab));
    },
    [clearAgentRunOptimizerScope, navigate, location.pathname]
  );

  const handleNavigateToSapGenerator = useCallback(
    (site: WordPressSite, _sitemapUrl: string) => {
      if (site?.id) {
        setActiveWordPressSiteId(site.id);
      }
      handleManagerTabChange("local-dominator");
    },
    [setActiveWordPressSiteId, handleManagerTabChange]
  );

  const openOrganicReportingTab = useCallback(
    (siteId: string) => {
      const enabled = sites.filter((s) => s.enabled !== false);
      const site = enabled.find((s) => s.id === siteId);
      if (!site) return;
      prefetchOrganicDashboardBundle(queryClient, site);
      setActiveWordPressSiteId(site.id);
      handleManagerTabChange(ORGANIC_REPORTING_MANAGER_TAB);
    },
    [sites, queryClient, setActiveWordPressSiteId, handleManagerTabChange],
  );

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenOrganicReportingDetail>).detail;
      if (detail?.siteId) openOrganicReportingTab(detail.siteId);
    };
    window.addEventListener(NEO_PULSE_OPEN_ORGANIC_REPORTING_EVENT, onOpen);
    return () => window.removeEventListener(NEO_PULSE_OPEN_ORGANIC_REPORTING_EVENT, onOpen);
  }, [openOrganicReportingTab]);

  const navigateToOrganicReporting = useCallback(() => {
    const enabled = sites.filter((s) => s.enabled !== false);
    const site =
      (activeWordPressSiteId
        ? enabled.find((s) => s.id === activeWordPressSiteId)
        : undefined) ?? enabled[0];
    if (site) {
      openOrganicReportingTab(site.id);
      return;
    }
    handleManagerDashboardClusterChange("properties");
    handleManagerTabChange("dashboard");
  }, [
    sites,
    activeWordPressSiteId,
    openOrganicReportingTab,
    handleManagerDashboardClusterChange,
    handleManagerTabChange,
  ]);

  const navigateToGeneratorSection = useCallback(
    (section: BlogGeneratorSectionId, options?: { keepAgentScope?: boolean }) => {
      const coerced = coerceBlogGeneratorSectionId(section);
      try {
        writeStoredBlogGeneratorSection(coerced);
      } catch {
        /* ignore */
      }
      if (!options?.keepAgentScope) {
        clearAgentRunOptimizerScope();
        writeGeneratorSectionPath(coerced);
      }
    },
    [clearAgentRunOptimizerScope],
  );

  const syncAgentRunScopeFromPath = useCallback(async () => {
    const runId = parseAgentRunIdFromPath(location.pathname);
    if (runId && teamId) {
      const section = parseGeneratorSectionFromPath(location.pathname);
      if (section) {
        const coerced = coerceBlogGeneratorSectionId(section);
        if (readStoredBlogGeneratorSection() !== coerced) {
          try {
            writeStoredBlogGeneratorSection(coerced);
          } catch {
            /* ignore */
          }
        }
      }
      if (agentRunOptimizerScope?.runId === runId) {
        return;
      }
      const run = await fetchAgentRun(teamId, runId);
      if (run) {
        hydrateScopeFromRun(run);
        return;
      }
    }
    if (!isAgentRunOptimizerPath(location.pathname)) {
      clearAgentRunOptimizerScope();
    }
  }, [
    location.pathname,
    teamId,
    hydrateScopeFromRun,
    clearAgentRunOptimizerScope,
    agentRunOptimizerScope?.runId,
  ]);

  useLayoutEffect(() => {
    void syncAgentRunScopeFromPath();
  }, [syncAgentRunScopeFromPath]);

  useEffect(() => {
    registerAgentRunOptimizerNavigation({
      onManagerTabChange: handleManagerTabChange,
      onGeneratorSectionChange: (section, options) =>
        navigateToGeneratorSection(section as BlogGeneratorSectionId, options),
    });
    return () => registerAgentRunOptimizerNavigation(null);
  }, [handleManagerTabChange, navigateToGeneratorSection]);

  const handleAssistNavigate = useCallback(
    (target: Parameters<typeof executeAssistNavigation>[0]) => {
      executeAssistNavigation(target, {
        onManagerTabChange: handleManagerTabChange,
        onGeneratorSectionChange: (section) =>
          navigateToGeneratorSection(section as BlogGeneratorSectionId),
        onDashboardClusterChange: (cluster) =>
          handleManagerDashboardClusterChange(cluster as ManagerSettingsClusterId),
        onPulseForgeHash: (hash) => {
          const body = hash.replace(/^#/, "").replace(/^\//, "");
          setPulseForgeRoute(parsePulseForgeRoute(`/${body}`));
        },
        onOrganicReporting: navigateToOrganicReporting,
      });
    },
    [
      handleManagerTabChange,
      navigateToGeneratorSection,
      handleManagerDashboardClusterChange,
      navigateToOrganicReporting,
    ],
  );

  return {
    managerDashboardCluster,
    handleManagerDashboardClusterChange,
    handleManagerTabChange,
    handleNavigateToSapGenerator,
    handleAssistNavigate,
    navigateToGeneratorSection,
  };
}
