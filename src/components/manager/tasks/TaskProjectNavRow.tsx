import React, { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskProject } from "@/lib/tasks-types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/ui";

export type TaskProjectNavRowProps = {
  project: TaskProject;
  selected: boolean;
  onSelect: () => void;
  onEdit: (project: TaskProject) => void;
  onDelete: (projectId: number) => void;
  deleteLabel?: string;
};

export function TaskProjectNavRow({
  project,
  selected,
  onSelect,
  onEdit,
  onDelete,
  deleteLabel = "Delete project",
}: TaskProjectNavRowProps): React.ReactElement {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div
      className={cn(
        "group flex items-center gap-0.5",
        selected ? "bg-ui-field-hover" : "hover:bg-ui-field",
      )}
    >
      <Button
        pressed={Boolean(selected)}
        variant="quiet"
        onClick={onSelect}
      >
        {project.title}
      </Button>
      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          size="icon" icon={Pencil}
          variant="quiet"
          aria-label={`Edit ${project.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onEdit(project);
          }}
        ></Button>
        <Button
          size="icon" icon={Trash2}
          variant="quiet"
          aria-label={`Delete ${project.title}`}
          onClick={(e) => {
            e.stopPropagation();
            setDeleteOpen(true);
          }}
        ></Button>
      </div>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-none border-0 bg-black text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">{deleteLabel}</AlertDialogTitle>
            <AlertDialogDescription className="text-base text-muted-foreground">
              Delete &quot;{project.title}&quot;? It will be removed from Pulse Forge and My Tasks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10 text-base">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-10 bg-ui-danger/20 text-base hover:bg-ui-danger/20"
              onClick={() => onDelete(project.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
