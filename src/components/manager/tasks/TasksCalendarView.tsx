import React, { useMemo } from "react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { TeamTask } from "@/lib/tasks-types";
import { RowButton } from "@/ui";

export type TasksCalendarViewProps = {
  tasks: TeamTask[];
  selectedTaskId: number | null;
  onSelectTask: (taskId: number) => void;
};

export function TasksCalendarView({
  tasks,
  selectedTaskId,
  onSelectTask,
}: TasksCalendarViewProps): React.ReactElement {
  const tasksByDate = useMemo(() => {
    const map = new Map<string, TeamTask[]>();
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const key = task.dueDate.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(task);
      map.set(key, list);
    }
    return map;
  }, [tasks]);

  const datedTasks = useMemo(
    () => tasks.filter((t) => t.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [tasks],
  );

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-black">
      <div className="shrink-0 p-3">
        <Calendar mode="single" className="bg-black text-base" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="mb-3 text-base font-semibold text-white">Tasks with due dates</p>
        {datedTasks.length === 0 ? (
          <p className="text-base text-muted-foreground">No due dates set.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {datedTasks.map((task) => {
              const key = task.dueDate.slice(0, 10);
              const sameDay = tasksByDate.get(key) ?? [];
              return (
                <li key={task.id}>
                  <RowButton
                    selected={task.id === selectedTaskId}
                    type="button"
                    onClick={() => onSelectTask(task.id)}
                  >
                    <span className="text-base text-muted-foreground">{key}</span>
                    <span className="text-base text-white">{task.title}</span>
                    {sameDay.length > 1 ? (
                      <span className="text-base text-muted-foreground">{sameDay.length} tasks this day</span>
                    ) : null}
                  </RowButton>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
