import React, { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/ui";

const SECTION_HEADER_GRID =
  "grid w-full grid-cols-[2rem_minmax(12rem,1fr)_minmax(6rem,auto)_minmax(5rem,auto)_minmax(11rem,auto)_minmax(5rem,auto)_4rem_5rem] items-center gap-x-3";

export type TaskSectionHeaderProps = {
  sectionId: number;
  title: string;
  taskCount: number;
  onEdit: (sectionId: number) => void;
  onDelete: (sectionId: number) => void;
};

export function TaskSectionHeader({
  sectionId,
  title,
  taskCount,
  onEdit,
  onDelete,
}: TaskSectionHeaderProps): React.ReactElement {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className={cn(SECTION_HEADER_GRID, "mb-2 px-3")}>
      <span aria-hidden />
      <h3 className="min-w-0 text-base font-semibold text-white">{title}</h3>
      {taskCount > 0 ? (
        <span className="shrink-0 text-base text-muted-foreground">{taskCount}</span>
      ) : (
        <span />
      )}
      <span />
      <span />
      <span />
      <div className="col-span-2 flex shrink-0 items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          size="icon" icon={Pencil}
          variant="quiet"
          aria-label={`Edit ${title}`}
          onClick={() => onEdit(sectionId)}
        ></Button>
        <Button
          size="icon" icon={Trash2}
          variant="danger"
          aria-label={`Delete ${title}`}
          onClick={() => setDeleteOpen(true)}
        ></Button>
      </div>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-none border-0 bg-black text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Delete section</AlertDialogTitle>
            <AlertDialogDescription className="text-base text-muted-foreground">
              Delete this section and all tasks in it?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10 text-base">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn("h-10 text-base bg-ui-danger/20 hover:bg-ui-danger/20")}
              onClick={() => onDelete(sectionId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
