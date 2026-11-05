import React, { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TeamTask, TaskStatus } from "@/lib/tasks-types";
import { Button, Field } from "@/ui";

export type TaskSubtaskListProps = {
  subtasks: TeamTask[];
  onToggle: (taskId: number, status: TaskStatus) => void;
  onAdd: (title: string) => void;
};

export function TaskSubtaskList({ subtasks, onToggle, onAdd }: TaskSubtaskListProps): React.ReactElement {
  const [draft, setDraft] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <p className="text-base font-semibold text-white">Subtasks</p>
      <ul className="flex flex-col gap-1">
        {subtasks.map((sub) => {
          const done = sub.status === "done";
          return (
            <li key={sub.id} className="flex items-center gap-2">
              <Button
                pressed={Boolean(done)}
                onClick={() => onToggle(sub.id, done ? "todo" : "done")}
              >
                {done ? <Check className="h-4 w-4" /> : null}
              </Button>
              <span className={cn("text-base", done ? "text-muted-foreground line-through" : "text-white")}>
                {sub.title}
              </span>
            </li>
          );
        })}
      </ul>
      <Field
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            onAdd(draft.trim());
            setDraft("");
          }
        }}
        placeholder="Add subtask"
      />
    </div>
  );
}
