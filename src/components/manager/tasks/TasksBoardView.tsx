import React, { useCallback, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { assigneeBadgeLabel, assigneeBadgeIsPulse } from "@/lib/tasks-filter";
import type { TeamTask, TaskStatus } from "@/lib/tasks-types";
import { TASK_STATUS_LABELS, TASK_STATUSES } from "@/lib/tasks-types";
import type { TeamMember } from "@/lib/teams-types";
import { Button } from "@/ui";

export type TasksBoardViewProps = {
  tasks: TeamTask[];
  selectedTaskId: number | null;
  memberNames: Map<number, string>;
  members: TeamMember[];
  onSelectTask: (taskId: number) => void;
  onStatusChange: (taskId: number, status: TaskStatus) => void;
};

export function TasksBoardView({
  tasks,
  selectedTaskId,
  members,
  onSelectTask,
  onStatusChange,
}: TasksBoardViewProps): React.ReactElement {
  const [dragTaskId, setDragTaskId] = useState<number | null>(null);

  const handleDrop = useCallback(
    (status: TaskStatus) => {
      if (dragTaskId == null) return;
      onStatusChange(dragTaskId, status);
      setDragTaskId(null);
    },
    [dragTaskId, onStatusChange],
  );

  return (
    <div className="grid h-full min-h-0 flex-1 grid-cols-3 gap-2 overflow-hidden bg-black p-3">
      {TASK_STATUSES.map((status) => {
        const columnTasks = tasks.filter((t) => t.status === status);
        return (
          <div
            key={status}
            className="flex min-h-0 flex-col bg-black"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(status)}
          >
            <div className="shrink-0 px-3 py-2">
              <h3 className="text-base font-semibold text-white">{TASK_STATUS_LABELS[status]}</h3>
              <p className="text-base text-muted-foreground">{columnTasks.length}</p>
            </div>
            <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
              {columnTasks.map((task) => {
                const done = task.status === "done";
                return (
                  <li key={task.id}>
                    <div
                      draggable
                      onDragStart={() => setDragTaskId(task.id)}
                      onDragEnd={() => setDragTaskId(null)}
                      className={cn(
                        "cursor-grab px-2 py-2 active:cursor-grabbing",
                        task.id === selectedTaskId ? "bg-ui-field-hover" : "bg-ui-field hover:bg-ui-field-hover",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <Button
                          pressed={Boolean(done)}
                          aria-label={`Toggle ${task.title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onStatusChange(task.id, done ? "todo" : "done");
                          }}
                        >
                          {done ? <Check className="h-4 w-4" /> : null}
                        </Button>
                        <Button
                          variant="quiet"
                          onClick={() => onSelectTask(task.id)}
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "text-base font-medium",
                                done ? "text-muted-foreground line-through" : "text-white",
                              )}
                            >
                              {task.title}
                            </span>
                            {done ? (
                              <span className="bg-ui-field-hover px-2 py-0.5 text-base text-muted-foreground">Done</span>
                            ) : null}
                          </span>
                          {task.projectTitle ? (
                            <span className="text-base text-muted-foreground">{task.projectTitle}</span>
                          ) : null}
                          {task.assigneeIds.length > 0 ? (
                            <div className="flex gap-1">
                              {task.assigneeIds.map((uid) => {
                                const pulse = assigneeBadgeIsPulse(uid, members);
                                if (pulse) {
                                  return (
                                    <span
                                      key={uid}
                                      className="flex h-8 w-8 items-center justify-center bg-black text-primary"
                                      aria-label="Pulse"
                                    >
                                      <Sparkles className="h-4 w-4" />
                                    </span>
                                  );
                                }
                                const label = assigneeBadgeLabel(uid, members);
                                if (!label) return null;
                                return (
                                  <span
                                    key={uid}
                                    className="flex h-8 w-8 items-center justify-center bg-black text-base text-white"
                                  >
                                    {label}
                                  </span>
                                );
                              })}
                            </div>
                          ) : null}
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
