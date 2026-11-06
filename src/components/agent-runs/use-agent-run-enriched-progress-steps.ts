import { useEffect, useMemo, useState } from "react";
import { useTeam } from "@/contexts/TeamContext";
import { fetchAgentRunArtifacts } from "@/lib/agent-runs-api";
import { agentRunIsServerExecution } from "@/lib/agent-runs/agent-run-display";
import { enrichAgentRunStepsWithServerData } from "@/lib/agent-runs/agent-run-log-format";
import type { AgentRun, AgentRunStep } from "@/lib/agent-runs-types";
import { useAgentRunProgressSteps } from "./use-agent-run-progress-log";

export function useAgentRunEnrichedProgressSteps(
  run: AgentRun,
  progressLabel: string | null,
): AgentRunStep[] {
  const { activeTeam } = useTeam();
  const teamId = activeTeam?.id ?? null;
  const baseSteps = useAgentRunProgressSteps(run, progressLabel);
  const isServerExecution = agentRunIsServerExecution(run);
  const [serverArtifacts, setServerArtifacts] = useState<
    Awaited<ReturnType<typeof fetchAgentRunArtifacts>>
  >([]);

  useEffect(() => {
    if (!teamId || !isServerExecution) {
      setServerArtifacts([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      const artifacts = await fetchAgentRunArtifacts(teamId, run.id);
      if (!cancelled) setServerArtifacts(artifacts);
    };

    void load();
    const isRunning = run.status === "queued" || run.status === "running";
    const intervalMs = isRunning ? 2000 : 15000;
    const id = window.setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isServerExecution, run.id, run.status, run.updatedAt, run.steps, run.result, teamId]);

  return useMemo(
    () => enrichAgentRunStepsWithServerData(run, baseSteps, serverArtifacts),
    [baseSteps, run, serverArtifacts],
  );
}
