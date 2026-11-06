import { patchTaskExecutionProgress } from "@/lib/tasks-api";
import type { TaskExecution } from "@/lib/tasks-types";
import type { ContentOptimizerStepId, RunProgressPatch } from "@/lib/content-optimization/content-optimizer-run-progress";

export function createExecutionProgressReporter(
  teamId: number,
  executionId: number,
): (patch: RunProgressPatch & { progress?: number }) => void {
  return (patch: RunProgressPatch & { progress?: number }) => {
    void patchTaskExecutionProgress(teamId, executionId, {
      stepId: patch.stepId,
      subProgress: patch.subProgress,
      progress: patch.progress,
      message: patch.message,
      error: patch.error,
    });
  };
}

export type { TaskExecution, ContentOptimizerStepId };
