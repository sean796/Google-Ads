import React from "react";
import { Plus } from "lucide-react";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import { BULK_TOOLBAR_GROUP_DIVIDER } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import type { TasksFilterMode, TasksSortMode, TasksViewMode } from "@/lib/tasks-types";
import { Button, Field, SelectField } from "@/ui";

export type TasksContextHeaderProps = {
  contextTitle: string;
  viewMode: TasksViewMode;
  completedToday: number;
  onViewModeChange: (mode: TasksViewMode) => void;
  searchQuery: string;
  filterMode: TasksFilterMode;
  sortMode: TasksSortMode;
  addTaskDisabled: boolean;
  hideAddTask?: boolean;
  onSearchChange: (q: string) => void;
  onFilterChange: (mode: TasksFilterMode) => void;
  onSortChange: (mode: TasksSortMode) => void;
  onAddTask: () => void;
  onAddSection?: () => void;
  showAddSection: boolean;
};

const VIEW_MODES: { id: TasksViewMode; label: string }[] = [
  { id: "list", label: "List" },
  { id: "board", label: "Board" },
  { id: "calendar", label: "Calendar" },
  { id: "files", label: "Files" },
];

export function TasksContextHeader({
  contextTitle,
  viewMode,
  completedToday,
  onViewModeChange,
  searchQuery,
  filterMode,
  sortMode,
  addTaskDisabled,
  hideAddTask = false,
  onSearchChange,
  onFilterChange,
  onSortChange,
  onAddTask,
  onAddSection,
  showAddSection,
}: TasksContextHeaderProps): React.ReactElement {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 bg-black px-3">
      {contextTitle ? (
        <h2 className="shrink-0 text-base font-semibold text-white">{contextTitle}</h2>
      ) : null}
      {contextTitle ? (
        <>
          {completedToday > 0 ? (
            <span className="hidden shrink-0 text-base text-muted-foreground sm:inline">
              {completedToday === 1 ? "1 done today" : `${completedToday} done today`}
            </span>
          ) : null}
          <span className={BULK_TOOLBAR_GROUP_DIVIDER} aria-hidden />
        </>
      ) : completedToday > 0 ? (
        <>
          <span className="hidden shrink-0 text-base text-muted-foreground sm:inline">
            {completedToday === 1 ? "1 done today" : `${completedToday} done today`}
          </span>
          <span className={BULK_TOOLBAR_GROUP_DIVIDER} aria-hidden />
        </>
      ) : null}
      <Field
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search tasks"
      />
      <SelectField
        placeholder="Task filter"
        value={filterMode}
        onValueChange={(v) => onFilterChange(v as TasksFilterMode)}
        options={[
          { value: "incomplete", label: "Incomplete tasks" },
          { value: "all", label: "All tasks" },
          { value: "completed", label: "Completed" },
        ]}
      />
      <SelectField
        placeholder="Sort tasks"
        value={sortMode}
        onValueChange={(v) => onSortChange(v as TasksSortMode)}
        options={[
          { value: "dueDate", label: "Sort: Due date" },
          { value: "created", label: "Sort: Created" },
          { value: "title", label: "Sort: Title" },
        ]}
      />
      {showAddSection && onAddSection ? (
        <>
          <span className={BULK_TOOLBAR_GROUP_DIVIDER} aria-hidden />
          <Button variant="run" type="button" onClick={onAddSection}>
            Add section
          </Button>
        </>
      ) : null}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {VIEW_MODES.map((v) => (
          <WorkspacePill
            key={v.id}
            label={v.label}
            active={viewMode === v.id}
            square
            className="min-w-[3.25rem] px-2"
            onClick={() => onViewModeChange(v.id)}
          />
        ))}
      </div>
      <Button
        variant="run"
        type="button"
        disabled={addTaskDisabled}
        onClick={onAddTask}
      >
        <Plus className="mr-1.5 h-4 w-4" />
        Add task
      </Button>
    </div>
  );
}
