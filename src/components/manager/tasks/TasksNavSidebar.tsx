import React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskProject, TasksNavMode } from "@/lib/tasks-types";
import { TaskProjectNavRow } from "@/components/manager/tasks/TaskProjectNavRow";
import { Button, RowButton } from "@/ui";

export type TasksNavSidebarProps = {
  navMode: TasksNavMode;
  activeProjectId: number | null;
  regularProjects: TaskProject[];
  onSelectMyTasks: () => void;
  onSelectProject: (projectId: number) => void;
  onNewProject: () => void;
  onEditProject: (project: TaskProject) => void;
  onDeleteProject: (projectId: number) => void;
  onOpenPulseForge?: () => void;
};

export function TasksNavSidebar({
  navMode,
  activeProjectId,
  regularProjects,
  onSelectMyTasks,
  onSelectProject,
  onNewProject,
  onEditProject,
  onDeleteProject,
  onOpenPulseForge,
}: TasksNavSidebarProps): React.ReactElement {
  return (
    <aside className="flex h-full min-h-0 w-52 shrink-0 flex-col bg-black">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-3">
        <RowButton
          selected={navMode === "my"}
          type="button"
          onClick={onSelectMyTasks}
        >
          My Tasks
        </RowButton>
        {onOpenPulseForge ? (
          <RowButton
            type="button"
            onClick={onOpenPulseForge}
          >
            Pulse Forge
          </RowButton>
        ) : null}
        <div className="mt-4 flex items-center justify-between gap-2 px-2">
          <p className="text-base font-semibold text-white">Projects</p>
          <Button
            size="icon" icon={Plus}
            variant="quiet"
            onClick={onNewProject}
            aria-label="New project"
          ></Button>
        </div>
        <ul className="mt-2 flex flex-col gap-0.5">
          {regularProjects.map((project) => (
            <li key={project.id}>
              <TaskProjectNavRow
                project={project}
                selected={navMode === "project" && activeProjectId === project.id}
                onSelect={() => onSelectProject(project.id)}
                onEdit={onEditProject}
                onDelete={onDeleteProject}
              />
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
