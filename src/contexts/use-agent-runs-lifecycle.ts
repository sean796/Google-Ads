import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { flushAllAgentRunCheckpointPatches } from "@/lib/agent-runs/agent-run-checkpoint";
import { agentRunIsServerExecution } from "@/lib/agent-runs/agent-run-display";
import {
  hasTerminalRuns,
  hydrateAgentRunCancellationsForTeam,
} from "@/lib/agent-runs/executor";
import type { AgentRun } from "@/lib/agent-runs-types";
import type { AgentRunListPatch } from "@/lib/agent-runs/agent-runs-local-patch";
import {
  advanceServerAgentRun,
  warmInventoryForServerPostCreatorRun,
} from "@/lib/agent-runs/run-server-post-creator-upload";
import type { useWordPressSites } from "@/hooks/use-wordpress-sites";

type UseAgentRunsLifecycleParams = {
  teamId: number | null;
  runs: AgentRun[];
  runsRef: { current: AgentRun[] };
  selectedRunId: number | null;
  setSelectedRunId: Dispatch<SetStateAction<number | null>>;
  setRuns: Dispatch<SetStateAction<AgentRun[]>>;
  sites: ReturnType<typeof useWordPressSites>["sites"];
  patchRunInList: (runId: number, patch: AgentRunListPatch) => void;
  refreshRuns: () => Promise<void>;
};

export function useAgentRunsLifecycle({
  teamId,
  runs,
  runsRef,
  selectedRunId,
  setSelectedRunId,
  setRuns,
  sites,
  patchRunInList,
  refreshRuns,
}: UseAgentRunsLifecycleParams) {
  useEffect(() => {
    if (!teamId) {
      setRuns([]);
      return;
    }
    hydrateAgentRunCancellationsForTeam(teamId);
    void refreshRuns();
    // Fetch once per team; local patches handle run updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return;
    const flush = () => {
      void flushAllAgentRunCheckpointPatches(teamId);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [teamId]);

  const serverProcessInFlight = useRef(new Set<number>());

  useEffect(() => {
    if (!teamId) return;
    for (const run of runs) {
      if (
        (run.status === "queued" || run.status === "running") &&
        agentRunIsServerExecution(run) &&
        !serverProcessInFlight.current.has(run.id)
      ) {
        serverProcessInFlight.current.add(run.id);
        void warmInventoryForServerPostCreatorRun(run, sites);
        void advanceServerAgentRun(teamId, run, sites)
          .then((latest) => {
            patchRunInList(run.id, latest);
          })
          .catch((err) => {
            console.error("[Agent runs] Server run advance failed:", err);
          })
          .finally(() => {
            serverProcessInFlight.current.delete(run.id);
          });
      }
    }
  }, [patchRunInList, runs, sites, teamId]);

  useEffect(() => {
    if (!teamId) return;
    const tick = async () => {
      const active = runsRef.current.filter(
        (run) =>
          agentRunIsServerExecution(run) &&
          (run.status === "queued" || run.status === "running"),
      );
      if (active.length === 0) return;
      await Promise.all(
        active.map(async (run) => {
          const latest = await advanceServerAgentRun(teamId, run, sites);
          patchRunInList(run.id, latest);
        }),
      );
    };
    void tick();
    const id = window.setInterval(tick, 3000);
    return () => window.clearInterval(id);
  }, [patchRunInList, runsRef, sites, teamId]);

  const selectedRun = useMemo(
    () => runs.find((r) => r.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  );

  useEffect(() => {
    if (selectedRunId != null && !runs.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(null);
    }
  }, [runs, selectedRunId, setSelectedRunId]);

  const hasTerminalHistory = useMemo(() => hasTerminalRuns(runs), [runs]);

  return {
    selectedRun,
    hasTerminalHistory,
  };
}
