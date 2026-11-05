import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  assigneeBadgeIsPulse,
  assigneeBadgeLabel,
  formatDueDateTimeShort,
} from "@/lib/tasks-filter";
import { AutomationTaskExecuteButton } from "@/components/manager/tasks/AutomationTaskExecuteButton";
import type { TeamTask, TaskStatus } from "@/lib/tasks-types";
import type { TeamMember } from "@/lib/teams-types";
import { TASK_RECURRENCE_LABELS } from "@/lib/tasks-types";
import { Button } from "@/ui";

export type MobileTaskCardListProps = {
  tasks: TeamTask[];
  selectedTaskId: number | null;
  members: TeamMember[];
  emptyLabel?: string;
  showExecuteAction?: boolean;
  teamId?: number | null;
  onSelectTask: (taskId: number) => void;
  onStatusChange: (taskId: number, status: TaskStatus) => void;
  onExecuteTask?: (taskId: number) => void;
};

function toggleDoneStatus(current: TaskStatus): TaskStatus {
  return current === "done" ? "todo" : "done";
}

function scheduleLine(task: TeamTask): string {
  if (task.scheduleMode === "trigger") {
    if (task.triggerMeta?.lastMatchedCount != null) {
      return `Trigger · ${task.triggerMeta.lastMatchedCount} matches`;
    }
    return "Trigger";
  }
  if (task.dueDate) {
    return formatDueDateTimeShort(task.dueDate, task.dueTime);
  }
  if (task.recurrenceRule && task.recurrenceRule !== "none") {
    return TASK_RECURRENCE_LABELS[task.recurrenceRule];
  }
  return "";
}

export function MobileTaskCardList({
  tasks,
  selectedTaskId,
  members,
  emptyLabel = "No tasks yet",
  showExecuteAction = false,
  teamId = null,
  onSelectTask,
  onStatusChange,
  onExecuteTask,
}: MobileTaskCardListProps): React.ReactElement {
  if (tasks.length === 0) {
    return (
      <div className="mobile-task-empty px-4 py-8 text-center text-base text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ul className="mobile-task-card-list flex flex-col gap-2">
      {tasks.map((task) => {
        const done = task.status === "done";
        const selected = task.id === selectedTaskId;
        const schedule = scheduleLine(task);
        const primaryAssigneeId = task.assigneeIds[0];
        const assigneeLabel =
          primaryAssigneeId != null ? assigneeBadgeLabel(primaryAssigneeId, members) : "";
        const isPulse =
          primaryAssigneeId != null ? assigneeBadgeIsPulse(primaryAssigneeId, members) : false;

        return (
          <li key={task.id}>
            <div
              className={cn(
                "mobile-task-card flex items-start gap-3",
                selected && "mobile-task-card--selected",
              )}
            >
              <Button
                pressed={Boolean(done)}
                aria-label={`Toggle ${task.title}`}
                onClick={() => onStatusChange(task.id, toggleDoneStatus(task.status))}
              >
                {done ? <Check className="h-4 w-4" /> : null}
              </Button>

              <Button
                variant="quiet"
                onClick={() => onSelectTask(task.id)}
              >
                <span
                  className={cn(
                    "block text-base font-medium",
                    done ? "text-muted-foreground line-through" : "text-white",
                  )}
                >
                  {task.title}
                </span>
                {schedule ? (
                  <span className="mt-1 block text-base text-muted-foreground">{schedule}</span>
                ) : null}
                {assigneeLabel ? (
                  <span
                    className={cn(
                      "mt-2 inline-block rounded-full px-2 py-1 text-base",
                      isPulse ? "bg-primary/20 text-primary" : "bg-ui-field-hover text-muted-foreground",
                    )}
                  >
                    {assigneeLabel}
                  </span>
                ) : null}
              </Button>

              {showExecuteAction ? (
                <AutomationTaskExecuteButton
                  teamId={teamId}
                  taskId={task.id}
                  task={task}
                  variant="icon"
                  onExecuted={onExecuteTask ? () => onExecuteTask(task.id) : undefined}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
