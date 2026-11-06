import React, { useCallback, useState } from "react";
import { Play } from "lucide-react";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import { cn } from "@/lib/utils";
import {
  TASK_FORM_DIALOG_BUTTON_CLASS,
} from "@/components/manager/tasks/task-form-layout-styles";
import {
  automationExecuteUsesTriggerRun,
  prepareTaskForAutomationExecute,
} from "@/lib/task-automation-ui";
import { executeAutomationTaskTrigger, fetchTaskDetail } from "@/lib/tasks-api";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { resolveTaskExecuteSiteId, isClientAgnosticExecutionKind } from "@/lib/agent-runs-types";
import type { TaskTriggerEvaluateResult } from "@/lib/task-trigger-types";
import type { TaskProject, TeamTask } from "@/lib/tasks-types";
import { Button } from "@/ui";

export type AutomationTaskExecuteButtonProps = {
  teamId: number | null;
  taskId: number;
  task?: Pick<
    TeamTask,
    | "id"
    | "scheduleMode"
    | "executionKind"
    | "executionPayload"
    | "wordpressSiteId"
    | "title"
    | "keyword"
    | "projectId"
    | "recurrenceRule"
    | "dueDate"
    | "dueTime"
  > | null;
  project?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword" | "wordpressSiteId"> | null;
  disabled?: boolean;
  variant?: "button" | "icon";
  className?: string;
  onExecuted?: (result?: TaskTriggerEvaluateResult & { queued?: boolean }) => void;
};

export function AutomationTaskExecuteButton({
  teamId,
  taskId,
  task,
  project = null,
  disabled = false,
  variant = "button",
  className,
  onExecuted,
}: AutomationTaskExecuteButtonProps): React.ReactElement {
  const { startRunFromTask, refreshRuns } = useAgentRunsContext();
  const { activeWordPressSiteId } = useActiveWordPressSite();
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExecute = useCallback(async () => {
    if (!teamId || executing) return;
    setExecuting(true);
    setError(null);
    try {
      const detail = await fetchTaskDetail(teamId, taskId);
      const taskRow = detail.task ?? task ?? ({ id: taskId } as TeamTask);
      const prepared = prepareTaskForAutomationExecute(
        taskRow as TeamTask,
        project,
        activeWordPressSiteId,
      );
      const usesTrigger = automationExecuteUsesTriggerRun(prepared, project);

      if (usesTrigger) {
        const result = await executeAutomationTaskTrigger(teamId, taskId);
        if (!result.ok) {
          setError(result.error ?? "Execute failed.");
          return;
        }
        onExecuted?.(result);
        return;
      }

      if (
        !isClientAgnosticExecutionKind(prepared.executionKind, prepared.executionPayload)
        && !resolveTaskExecuteSiteId(prepared, activeWordPressSiteId)
      ) {
        setError("Set a client on the project.");
        return;
      }

      const result = await startRunFromTask(prepared, { openSidebar: true });
      if (!result.ok) {
        setError(result.error ?? "Execute failed.");
        return;
      }
      onExecuted?.();
      void refreshRuns();
    } finally {
      setExecuting(false);
    }
  }, [
    activeWordPressSiteId,
    executing,
    onExecuted,
    project,
    refreshRuns,
    startRunFromTask,
    task,
    taskId,
    teamId,
  ]);

  if (variant === "icon") {
    return (
      <Button
        size="icon" icon={Play}
        pressed={Boolean(error)}
        variant="quiet"
        aria-label={error ? error : "Execute automation now"}
        disabled={disabled || executing || !teamId}
        onClick={(e) => {
          e.stopPropagation();
          void handleExecute();
        }}
        title={executing ? "Running…" : error ?? "Execute automation now"}
      ></Button>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Button
        type="button"
        disabled={disabled || executing || !teamId}
        onClick={() => void handleExecute()}
      >
        {executing ? "Running…" : "Execute"}
      </Button>
      {error ? <p className="text-base text-ui-danger-hover">{error}</p> : null}
    </div>
  );
}
