import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import {
  fetchAgentRun,
  fetchAgentRuns,
} from "@/lib/agent-runs-api";
import { agentRunSiteId } from "@/lib/agent-runs/agent-run-batch-key";
import {
  applyOptimisticWorkflowAgentProgress,
  createOptimisticWorkflowAgentRun,
} from "@/lib/agent-runs/optimistic-workflow-agent-run";
import {
  resolveDefaultAgentsSiteFilter,
} from "@/lib/agent-runs/agent-runs-site-filter";
import { agentRunHasResumeProgress } from "@/lib/agent-runs/agent-run-resume";
import { agentRunIsServerExecution } from "@/lib/agent-runs/agent-run-display";
import {
  executeAgentRun,
  clearClientRunAttempted,
  hasClientRunAttempted,
  isAgentRunActive,
  isAgentRunInflight,
  isAgentRunCancelledLocally,
} from "@/lib/agent-runs/executor";
import { registerAgentRunListPatcher, type AgentRunListPatch } from "@/lib/agent-runs/agent-runs-local-patch";
import { isAgentRunInterrupted } from "@/lib/agent-runs/agent-run-checkpoint";
import type { AgentRun } from "@/lib/agent-runs-types";
import { isAgentRunTerminal } from "@/lib/agent-runs-types";
import { writeAgentRunsSidebarOpen } from "@/lib/agent-runs/storage";
import { writeSidebarOpen, writeSidebarPanel, type SidebarPanel } from "@/lib/pulse-assist/storage";
import {
  applyCancelledRunState,
  mergeAgentRunListRow,
} from "@/contexts/agent-runs-provider-helpers";

type UseAgentRunsListParams = {
  teamId: number | null;
  activeWordPressSiteId: string | null;
  setSidebarOpen: (open: boolean) => void;
  setSidebarPanel: (panel: SidebarPanel) => void;
};

export function useAgentRunsList({
  teamId,
  activeWordPressSiteId,
  setSidebarOpen,
  setSidebarPanel,
}: UseAgentRunsListParams) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const runsRef = useRef(runs);
  runsRef.current = runs;

  const { sites } = useWordPressSites();
  const agentsSiteIds = useMemo(() => sites.map((site) => site.id), [sites]);

  const kickClientAgentRuns = useCallback(
    (candidates: AgentRun[]) => {
      for (const run of candidates) {
        if (agentRunIsServerExecution(run)) continue;
        if (isAgentRunCancelledLocally(run.id, teamId ?? undefined)) continue;
        const stalledRunning =
          run.status === "running"
          && !isAgentRunInflight(run.id)
          && !isAgentRunActive(run.id)
          && agentRunHasResumeProgress(run);
        if (run.status !== "queued" && !stalledRunning) continue;
        if (hasClientRunAttempted(run.id) && !stalledRunning) continue;
        if (isAgentRunInflight(run.id)) continue;
        if (stalledRunning) {
          clearClientRunAttempted(run.id);
        }
        void executeAgentRun(run, sites);
      }
    },
    [sites, teamId],
  );
  const [agentsSiteFilter, setAgentsSiteFilterState] = useState<string>("");
  const setAgentsSiteFilter = useCallback((siteId: string) => {
    setAgentsSiteFilterState(siteId);
  }, []);

  useEffect(() => {
    setAgentsSiteFilterState(resolveDefaultAgentsSiteFilter(activeWordPressSiteId, agentsSiteIds));
  }, [activeWordPressSiteId, agentsSiteIds]);

  const refreshRuns = useCallback(async () => {
    if (!teamId) {
      setRuns([]);
      return;
    }
    const list = await fetchAgentRuns(teamId);
    const hydrated = await Promise.all(
      list.map(async (run) => {
        if (
          isAgentRunInterrupted(run) ||
          (!isAgentRunTerminal(run.status) && agentRunIsServerExecution(run))
        ) {
          const detail = await fetchAgentRun(teamId, run.id);
          return detail ?? run;
        }
        return run;
      }),
    );
    setRuns((prev) => {
      const prevById = new Map(prev.map((run) => [run.id, run]));
      const mergedById = new Map<number, AgentRun>();

      for (const incoming of hydrated) {
        const normalized = applyCancelledRunState(incoming, teamId);
        const existing = prevById.get(normalized.id);
        mergedById.set(
          normalized.id,
          existing ? mergeAgentRunListRow(existing, normalized) : normalized,
        );
      }

      for (const run of prev) {
        if (mergedById.has(run.id)) continue;
        if (run.id < 0) {
          const site = agentRunSiteId(run);
          const replaced = site
            ? [...mergedById.values()].some((item) => item.id > 0 && agentRunSiteId(item) === site)
            : false;
          if (!replaced) mergedById.set(run.id, run);
          continue;
        }
        const normalized = applyCancelledRunState(run, teamId);
        if (isAgentRunTerminal(normalized.status)) continue;
        mergedById.set(normalized.id, normalized);
      }

      return [...mergedById.values()].sort((a, b) => b.id - a.id);
    });
    kickClientAgentRuns(
      hydrated.filter(
        (run) =>
          !isAgentRunTerminal(run.status)
          && !agentRunIsServerExecution(run),
      ),
    );
  }, [kickClientAgentRuns, teamId]);

  const patchRunInList = useCallback(
    (runId: number, patch: AgentRunListPatch) => {
      setRuns((prev) => {
        const idx = prev.findIndex((r) => r.id === runId);
        if (idx < 0) return prev;
        const current = prev[idx];
        const partial = typeof patch === "function" ? patch(current) : patch;
        const next = [...prev];
        next[idx] = { ...current, ...partial };
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    registerAgentRunListPatcher(patchRunInList);
    return () => registerAgentRunListPatcher(null);
  }, [patchRunInList]);

  const openSidebar = useCallback(
    (runId?: number) => {
      setSidebarPanel("agents");
      writeSidebarPanel("agents");
      setSidebarOpen(true);
      writeSidebarOpen(true);
      writeAgentRunsSidebarOpen(true);
      if (runId) setSelectedRunId(runId);
    },
    [setSidebarOpen, setSidebarPanel],
  );

  const seedOptimisticWorkflowAgent = useCallback(
    (title: string, siteId?: string | readonly string[]) => {
      if (!teamId) {
        openSidebar();
        return;
      }
      const siteIds = Array.isArray(siteId) ? siteId : siteId ? [siteId] : [undefined];
      const now = Date.now();
      const nextRuns = siteIds.map((id, index) =>
        createOptimisticWorkflowAgentRun({
          teamId,
          title,
          siteId: id,
          id: -(now + index + 1),
        }),
      );
      setRuns((prev) => [...nextRuns, ...prev.filter((item) => item.id > 0)]);
      openSidebar(nextRuns[0]?.id);
    },
    [openSidebar, teamId],
  );

  const patchOptimisticWorkflowAgentProgress = useCallback((message: string, siteId?: string) => {
    setRuns((prev) => applyOptimisticWorkflowAgentProgress(prev, message, siteId));
  }, []);

  return {
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
  };
}
