import React from "react";
import { Plus } from "lucide-react";
import { Button, Field, FilterRowDivider, SelectField } from "@/ui";
import type { TasksFilterMode, TasksSortMode } from "@/lib/tasks-types";

export type TasksFilterToolbarProps = {
  searchQuery: string;
  filterMode: TasksFilterMode;
  sortMode: TasksSortMode;
  addTaskDisabled: boolean;
  onSearchChange: (q: string) => void;
  onFilterChange: (mode: TasksFilterMode) => void;
  onSortChange: (mode: TasksSortMode) => void;
  onAddTask: () => void;
  onAddSection?: () => void;
  showAddSection: boolean;
};

const FILTER_OPTIONS = [
  { value: "incomplete", label: "Incomplete tasks" },
  { value: "all", label: "All tasks" },
  { value: "completed", label: "Completed" },
] as const;

const SORT_OPTIONS = [
  { value: "dueDate", label: "Sort: Due date" },
  { value: "created", label: "Sort: Created" },
  { value: "title", label: "Sort: Title" },
] as const;

export function TasksFilterToolbar({
  searchQuery,
  filterMode,
  sortMode,
  addTaskDisabled,
  onSearchChange,
  onFilterChange,
  onSortChange,
  onAddTask,
  onAddSection,
  showAddSection,
}: TasksFilterToolbarProps): React.ReactElement {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 bg-black px-3">
      <Field
        size="keyword"
        placeholder="Search tasks"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <SelectField
        placeholder="Filter tasks"
        value={filterMode}
        options={FILTER_OPTIONS}
        onValueChange={(v) => onFilterChange(v as TasksFilterMode)}
      />
      <SelectField
        placeholder="Sort tasks"
        value={sortMode}
        options={SORT_OPTIONS}
        onValueChange={(v) => onSortChange(v as TasksSortMode)}
      />
      {showAddSection && onAddSection ? (
        <>
          <FilterRowDivider />
          <Button variant="run" onClick={onAddSection}>
            Add section
          </Button>
        </>
      ) : null}
      <FilterRowDivider />
      <Button variant="run" icon={Plus} disabled={addTaskDisabled} onClick={onAddTask}>
        Add task
      </Button>
    </div>
  );
}
