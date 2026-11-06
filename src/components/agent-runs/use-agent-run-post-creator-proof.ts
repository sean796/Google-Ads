import { useEffect, useRef, useSyncExternalStore } from "react";
import { useTeam } from "@/contexts/TeamContext";
import { fetchAgentRunArtifacts } from "@/lib/agent-runs-api";
import { agentRunIsServerExecution } from "@/lib/agent-runs/agent-run-display";
import {
  getPostCreatorProofForRun,
  subscribePostCreatorProof,
  syncPostCreatorProofFromServerRun,
  type PostCreatorProofSnapshot,
} from "@/lib/agent-runs/agent-run-post-creator-proof";
import type { AgentRun } from "@/lib/agent-runs-types";

export function useAgentRunPostCreatorProof(run: AgentRun): PostCreatorProofSnapshot | null {
  const { activeTeam } = useTeam();
  const teamId = activeTeam?.id ?? null;
  const runRef = useRef(run);
  runRef.current = run;
  const isServerExecution = agentRunIsServerExecution(run);

  useEffect(() => {
    if (!teamId || !isServerExecution) return;
    syncPostCreatorProofFromServerRun(runRef.current, []);
  }, [isServerExecution, run.id, run.steps, run.updatedAt, teamId]);

  useEffect(() => {
    if (!teamId || !isServerExecution) return;

    let cancelled = false;
    const sync = async () => {
      const artifacts = await fetchAgentRunArtifacts(teamId, run.id);
      if (cancelled) return;
      syncPostCreatorProofFromServerRun(runRef.current, artifacts);
    };

    void sync();
    const isRunning = runRef.current.status === "queued" || runRef.current.status === "running";
    const intervalMs = isRunning ? 2000 : 15000;
    const id = window.setInterval(() => {
      void sync();
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isServerExecution, run.id, run.updatedAt, run.result, run.status, teamId]);

  return useSyncExternalStore(
    (listener) => subscribePostCreatorProof(run.id, listener),
    () => getPostCreatorProofForRun(run),
    () => getPostCreatorProofForRun(run),
  );
}
