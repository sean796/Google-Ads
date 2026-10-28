import { useEffect, useRef } from "react";
import type { AgentRun } from "@/lib/agent-runs-types";
import type { WorkflowRunCallbacks } from "@/lib/workflow/workflow-runner";
import { tickLdWorkflowContinueWatchdog } from "@/lib/workflow/workflow-ld-continue-watchdog";

const WAKE_MS = 2_000;

type UseWorkflowLdContinueWatchdogArgs = {
  teamId: number | null;
  runs: AgentRun[];
  callbacks: WorkflowRunCallbacks;
  onContinued?: () => void;
};

/**
 * Continues deferred workflow runs after server LD export once grid CSV is present
 * in workflow step outputs or run artifacts (not time-based).
 */
export function useWorkflowLdContinueWatchdog({
  teamId,
  runs,
  callbacks,
  onContinued,
}: UseWorkflowLdContinueWatchdogArgs): void {
  const runningRef = useRef(false);
  const callbacksRef = useRef(callbacks);
  const onContinuedRef = useRef(onContinued);
  const runsRef = useRef(runs);
  callbacksRef.current = callbacks;
  onContinuedRef.current = onContinued;
  runsRef.current = runs;

  useEffect(() => {
    if (!teamId) return;

    const tick = () => {
      if (runningRef.current) return;
      runningRef.current = true;
      void (async () => {
        try {
          const before = runsRef.current;
          await tickLdWorkflowContinueWatchdog(teamId, before, callbacksRef.current);
          onContinuedRef.current?.();
        } finally {
          runningRef.current = false;
        }
      })();
    };

    tick();
    const id = window.setInterval(tick, WAKE_MS);
    return () => window.clearInterval(id);
  }, [teamId]);
}
