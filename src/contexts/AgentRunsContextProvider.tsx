/* @refresh reset */
import {
  useMemo,
  type ReactNode,
} from "react";
import { AgentRunsContext } from "@/contexts/agent-runs-react-context";
import { useTeam } from "@/contexts/TeamContext";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import type { SidebarPanel } from "@/lib/pulse-assist/storage";
import { useAgentRunsList } from "@/contexts/use-agent-runs-list";
import { useAgentRunsStartRun } from "@/contexts/use-agent-runs-start-run";
import { useAgentRunsWorkflowDispatch } from "@/contexts/use-agent-runs-workflow-dispatch";
import { useAgentRunsRunControls } from "@/contexts/use-agent-runs-run-controls";
import { useAgentRunsLifecycle } from "@/contexts/use-agent-runs-lifecycle";

type AgentRunsContextProviderProps = {
  children: ReactNode;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  sidebarPanel: SidebarPanel;
  setSidebarPanel: (panel: SidebarPanel) => void;
};

export function AgentRunsContextProvider({
  children,
  sidebarOpen,
  setSidebarOpen,
  sidebarPanel,
  setSidebarPanel,
}: AgentRunsContextProviderProps) {
  const { activeTeam, myTasks, members, refreshTasksWorkspace } = useTeam();
  const { activeWordPressSiteId } = useActiveWordPressSite();
  const teamId = activeTeam?.id ?? null;

  const {
    runs,
    setRuns,
    selectedRunId,
    setSelectedRunId,
    runsRef,
    sites,
    agentsSiteIds,
    kickClientAgentRuns,
    agentsSiteFilter,
    setAgentsSiteFilter,
    setAgentsSiteFilterState,
    refreshRuns,
    patchRunInList,
    openSidebar,
    seedOptimisticWorkflowAgent,
    patchOptimisticWorkflowAgentProgress,
  } = useAgentRunsList({
    teamId,
    activeWordPressSiteId,
    setSidebarOpen,
    setSidebarPanel,
  });

  const {
    startRun,
    mapStartRunResult,
    startRunForWorkflow,
    startRunFromTask,
    startRunFromTaskForWorkflow,
  } = useAgentRunsStartRun({
    teamId,
    activeWordPressSiteId,
    sites,
    runsRef,
    kickClientAgentRuns,
    openSidebar,
    patchRunInList,
    refreshRuns,
    setRuns,
  });

  const { dispatchWorkflowRun } = useAgentRunsWorkflowDispatch({
    teamId,
    activeWordPressSiteId,
    agentsSiteIds,
    setAgentsSiteFilterState,
    refreshRuns,
    refreshTasksWorkspace,
    myTasks,
    members,
    patchOptimisticWorkflowAgentProgress,
    mapStartRunResult,
    startRun,
    startRunForWorkflow,
    startRunFromTask,
    startRunFromTaskForWorkflow,
    runs,
  });

  const {
    cancelRun,
    resumeRun,
    clearHistory,
    cancelActiveRuns,
  } = useAgentRunsRunControls({
    teamId,
    runs,
    runsRef,
    sites,
    patchRunInList,
    kickClientAgentRuns,
    refreshRuns,
    setRuns,
    setSelectedRunId,
  });

  const { selectedRun, hasTerminalHistory } = useAgentRunsLifecycle({
    teamId,
    runs,
    runsRef,
    selectedRunId,
    setSelectedRunId,
    setRuns,
    sites,
    patchRunInList,
    refreshRuns,
  });

  const value = useMemo(
    () => ({
      runs,
      selectedRunId,
      selectedRun,
      sidebarOpen,
      setSidebarOpen,
      sidebarPanel,
      setSidebarPanel,
      agentsSiteFilter,
      setAgentsSiteFilter,
      openSidebar,
      seedOptimisticWorkflowAgent,
      patchOptimisticWorkflowAgentProgress,
      selectRun: setSelectedRunId,
      refreshRuns,
      patchRunInList,
      startRun,
      startRunFromTask,
      dispatchWorkflowRun,
      cancelRun,
      resumeRun,
      clearHistory,
      cancelActiveRuns,
      hasTerminalHistory,
    }),
    [
      agentsSiteFilter,
      cancelActiveRuns,
      cancelRun,
      clearHistory,
      hasTerminalHistory,
      openSidebar,
      seedOptimisticWorkflowAgent,
      patchOptimisticWorkflowAgentProgress,
      patchRunInList,
      refreshRuns,
      resumeRun,
      runs,
      selectedRun,
      selectedRunId,
      setAgentsSiteFilter,
      sidebarOpen,
      setSidebarOpen,
      sidebarPanel,
      setSidebarPanel,
      setSelectedRunId,
      startRun,
      startRunFromTask,
      dispatchWorkflowRun,
    ],
  );

  return <AgentRunsContext.Provider value={value}>{children}</AgentRunsContext.Provider>;
}
