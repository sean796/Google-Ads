import React, { useCallback, useMemo, useState } from "react";
import { Check, Pencil, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDueDateTimeShort, assigneeBadgeLabel, assigneeBadgeIsPulse } from "@/lib/tasks-filter";
import type { TaskProject, TaskSection, TaskTag, TeamTask, TaskStatus, TasksFilterMode } from "@/lib/tasks-types";
import { TASK_RECURRENCE_LABELS } from "@/lib/tasks-types";
import type { TeamMember } from "@/lib/teams-types";
import { TaskSectionHeader } from "@/components/manager/tasks/TaskSectionHeader";
import { AutomationTaskExecuteButton } from "@/components/manager/tasks/AutomationTaskExecuteButton";
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
import { Button, Field } from "@/ui";

export type TasksListViewProps = {
  sections: TaskSection[];
  tasks: TeamTask[];
  tags: TaskTag[];
  filterMode: TasksFilterMode;
  selectedTaskId: number | null;
  memberNames: Map<number, string>;
  members: TeamMember[];
  siteOptions?: Array<{ id: string; name: string }>;
  myTasksMode: boolean;
  automationMode?: boolean;
  scheduleColumnLabel?: string;
  showExecuteAction?: boolean;
  canExecuteTask?: (task: TeamTask) => boolean;
  automationProjectForTask?: (task: TeamTask) => TaskProject | null;
  teamId?: number | null;
  onSelectTask: (taskId: number) => void;
  onStatusChange: (taskId: number, status: TaskStatus) => void;
  onAddTask: (sectionId: number, title: string) => void;
  onMoveTask: (taskId: number, sectionId: number) => void;
  onEditSection?: (sectionId: number) => void;
  onDeleteSection?: (sectionId: number) => void;
  onEditTask: (taskId: number) => void;
  onDeleteTask: (taskId: number) => void;
  onExecuteTask?: (taskId: number) => void;
};

const LIST_GRID =
  "grid w-full grid-cols-[2rem_minmax(12rem,1fr)_minmax(6rem,auto)_minmax(5rem,auto)_minmax(11rem,auto)_minmax(5rem,auto)_4rem_5rem] items-center gap-x-3";

function toggleDoneStatus(current: TaskStatus): TaskStatus {
  return current === "done" ? "todo" : "done";
}

function tagLabel(tags: TaskTag[], keyword: string): string {
  return tags.find((t) => t.keyword === keyword)?.name ?? keyword;
}

function tagColor(tags: TaskTag[], keyword: string): string {
  return tags.find((t) => t.keyword === keyword)?.color ?? "#52525b";
}

function sortMyTasks(list: TeamTask[]): TeamTask[] {
  return [...list].sort((a, b) => {
    const aDone = a.status === "done" ? 1 : 0;
    const bDone = b.status === "done" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const ad = a.dueDate || "9999-12-31";
    const bd = b.dueDate || "9999-12-31";
    if (ad !== bd) return ad.localeCompare(bd);
    return a.title.localeCompare(b.title);
  });
}

function TasksListHeader({ scheduleColumnLabel }: { scheduleColumnLabel: string }): React.ReactElement {
  return (
    <div className={cn(LIST_GRID, "sticky top-0 z-10 bg-ui-field px-3 py-2")}>
      <span />
      <span className="text-base font-semibold text-muted-foreground">Task</span>
      <span className="text-base font-semibold text-muted-foreground">Client</span>
      <span className="text-base font-semibold text-muted-foreground">Tags</span>
      <span className="text-base font-semibold text-muted-foreground">Due</span>
      <span className="text-base font-semibold text-muted-foreground">{scheduleColumnLabel}</span>
      <span className="text-base font-semibold text-muted-foreground">Assignee</span>
      <span className="sr-only">Actions</span>
    </div>
  );
}

function TaskRow({
  task,
  tags,
  selected,
  rowIndex,
  members,
  siteOptions = [],
  onSelect,
  onStatusChange,
  onEdit,
  onDelete,
  showExecuteAction = false,
  canExecuteTask,
  automationProjectForTask,
  teamId = null,
  onExecute,
}: {
  task: TeamTask;
  tags: TaskTag[];
  selected: boolean;
  rowIndex: number;
  members: TeamMember[];
  siteOptions?: Array<{ id: string; name: string }>;
  teamId?: number | null;
  onSelect: () => void;
  onStatusChange: () => void;
  onEdit: () => void;
  onDelete: () => void;
  showExecuteAction?: boolean;
  canExecuteTask?: (task: TeamTask) => boolean;
  automationProjectForTask?: (task: TeamTask) => TaskProject | null;
  onExecute?: () => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const showPlay = (showExecuteAction || (canExecuteTask?.(task) ?? false)) && Boolean(onExecute);
  const automationProject = automationProjectForTask?.(task) ?? null;
  const done = task.status === "done";
  const clientName = task.wordpressSiteId
    ? siteOptions.find((s) => s.id === task.wordpressSiteId)?.name
    : "";
  const recurrence =
    task.scheduleMode === "trigger"
      ? task.triggerMeta?.lastMatchedCount != null
        ? `Trigger · ${task.triggerMeta.lastMatchedCount} matches`
        : "Trigger"
      : task.recurrenceRule && task.recurrenceRule !== "none"
        ? TASK_RECURRENCE_LABELS[task.recurrenceRule]
        : "";

  return (
    <div
      className={cn(
        "group px-3 py-2",
        selected ? "bg-ui-field-hover" : rowIndex % 2 === 0 ? "bg-black" : "bg-black",
        !selected && "hover:bg-ui-field",
      )}
    >
      <div className={LIST_GRID}>
        <Button
          pressed={Boolean(done)}
          aria-label={`Toggle ${task.title}`}
          onClick={onStatusChange}
        >
          {done ? <Check className="h-4 w-4" /> : null}
        </Button>
        <Button variant="quiet" onClick={onSelect}>
          <span
            className={cn(
              "block break-words text-base",
              done ? "text-muted-foreground line-through" : "text-white",
            )}
          >
            {task.title}
          </span>
        </Button>
        <span className="whitespace-nowrap text-base text-muted-foreground">{clientName}</span>
        <div className="flex min-w-0 gap-1">
          {task.tagIds.slice(0, 2).map((tagId) => (
            <span
              key={tagId}
              className="whitespace-nowrap px-1.5 py-0.5 text-base text-white"
              style={{ backgroundColor: tagColor(tags, tagId) }}
            >
              {tagLabel(tags, tagId)}
            </span>
          ))}
        </div>
        <span className="whitespace-nowrap text-base text-muted-foreground">
          {task.scheduleMode === "trigger"
            ? task.triggerMeta?.lastEvaluatedAt
              ? task.triggerMeta.lastEvaluatedAt.slice(0, 10)
              : null
            : task.dueDate
              ? formatDueDateTimeShort(task.dueDate, task.dueTime)
              : null}
        </span>
        <span className="whitespace-nowrap text-base text-muted-foreground">{recurrence || null}</span>
        <div className="flex min-w-0 gap-1">
          {task.assigneeIds.slice(0, 2).map((uid) => {
            const pulse = assigneeBadgeIsPulse(uid, members);
            if (pulse) {
              return (
                <span
                  key={uid}
                  className="flex h-8 w-8 shrink-0 items-center justify-center bg-ui-field text-primary"
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
                className="flex h-8 w-8 shrink-0 items-center justify-center bg-ui-field text-base text-white"
              >
                {label}
              </span>
            );
          })}
        </div>
        <div
          className={cn(
            "flex items-center justify-end gap-1",
            showPlay ? "opacity-100" : "opacity-0 transition-opacity group-hover:opacity-100",
          )}
        >
          {showPlay ? (
            <AutomationTaskExecuteButton
              teamId={teamId}
              taskId={task.id}
              task={task}
              project={automationProject}
              variant="icon"
              onExecuted={onExecute}
            />
          ) : null}
          <Button
            size="icon" icon={Pencil}
            variant="quiet"
            aria-label={`Edit ${task.title}`}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          ></Button>
          <Button
            size="icon" icon={Trash2}
            variant="quiet"
            aria-label={`Delete ${task.title}`}
            onClick={(e) => {
              e.stopPropagation();
              setDeleteOpen(true);
            }}
          ></Button>
        </div>
      </div>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-none border-0 bg-black text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Delete task</AlertDialogTitle>
            <AlertDialogDescription className="text-base text-muted-foreground">
              Delete &quot;{task.title}&quot;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10 text-base">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-10 bg-ui-danger/20 text-base hover:bg-ui-danger/20"
              onClick={() => onDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function renderTaskRow(
  task: TeamTask,
  rowIndex: number,
  props: Pick<
    TasksListViewProps,
    "tags" | "selectedTaskId" | "members" | "siteOptions" | "teamId" | "showExecuteAction" | "canExecuteTask" | "automationProjectForTask" | "onSelectTask" | "onStatusChange" | "onEditTask" | "onDeleteTask" | "onExecuteTask"
  >,
): React.ReactElement {
  return (
    <TaskRow
      key={task.id}
      task={task}
      tags={props.tags}
      selected={task.id === props.selectedTaskId}
      rowIndex={rowIndex}
      members={props.members}
      siteOptions={props.siteOptions}
      teamId={props.teamId}
      showExecuteAction={props.showExecuteAction}
      canExecuteTask={props.canExecuteTask}
      automationProjectForTask={props.automationProjectForTask}
      onSelect={() => props.onSelectTask(task.id)}
      onStatusChange={() => props.onStatusChange(task.id, toggleDoneStatus(task.status))}
      onEdit={() => props.onEditTask(task.id)}
      onDelete={() => props.onDeleteTask(task.id)}
      onExecute={props.onExecuteTask ? () => props.onExecuteTask?.(task.id) : undefined}
    />
  );
}

export function TasksListView({
  sections,
  tasks,
  tags,
  filterMode,
  selectedTaskId,
  memberNames: _memberNames,
  members,
  siteOptions = [],
  myTasksMode,
  automationMode = false,
  scheduleColumnLabel = "Repeat",
  showExecuteAction = false,
  canExecuteTask,
  automationProjectForTask,
  teamId = null,
  onSelectTask,
  onStatusChange,
  onAddTask,
  onMoveTask,
  onEditSection,
  onDeleteSection,
  onEditTask,
  onDeleteTask,
  onExecuteTask,
}: TasksListViewProps): React.ReactElement {
  const [draftBySection, setDraftBySection] = useState<Record<number, string>>({});
  const [dragTaskId, setDragTaskId] = useState<number | null>(null);

  const rowProps = {
    tags,
    selectedTaskId,
    members,
    siteOptions,
    teamId,
    showExecuteAction,
    canExecuteTask,
    automationProjectForTask,
    onSelectTask,
    onStatusChange,
    onEditTask,
    onDeleteTask,
    onExecuteTask,
  };

  const handleDrop = useCallback(
    (sectionId: number) => {
      if (dragTaskId == null) return;
      onMoveTask(dragTaskId, sectionId);
      setDragTaskId(null);
    },
    [dragTaskId, onMoveTask],
  );

  const myTasksSorted = useMemo(() => (myTasksMode ? sortMyTasks(tasks) : tasks), [myTasksMode, tasks]);

  if (myTasksMode) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-black">
        {myTasksSorted.length > 0 ? (
          <>
            <TasksListHeader scheduleColumnLabel={scheduleColumnLabel} />
            <ul>
              {myTasksSorted.map((task, index) => (
                <li key={task.id}>{renderTaskRow(task, index, rowProps)}</li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    );
  }

  const sectionList =
    sections.length > 0
      ? sections
      : [{ id: 0, teamId: 0, projectId: 0, sortOrder: 0, createdAt: "", payload: {}, keyword: "default", title: "Tasks" }];

  const doneTasks = tasks.filter((t) => t.status === "done");
  const showActiveSections = filterMode !== "completed";
  const showDoneSection = filterMode === "all" || filterMode === "completed";

  let rowIndex = 0;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-black">
      {tasks.length > 0 ? <TasksListHeader scheduleColumnLabel={scheduleColumnLabel} /> : null}
      {showActiveSections
        ? sectionList.map((section) => {
            const sectionTasks = tasks.filter(
              (t) =>
                t.status !== "done" && (section.id === 0 ? true : t.sectionId === section.id),
            );
            const draft = draftBySection[section.id] ?? "";
            if (filterMode === "completed" && sectionTasks.length === 0) {
              return null;
            }
            return (
              <section
                key={section.id}
                className="group"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => section.id > 0 && handleDrop(section.id)}
              >
                {section.id > 0 && !automationMode && onEditSection && onDeleteSection ? (
                  <TaskSectionHeader
                    sectionId={section.id}
                    title={section.title}
                    taskCount={sectionTasks.length}
                    onEdit={onEditSection}
                    onDelete={onDeleteSection}
                  />
                ) : section.id > 0 && !automationMode ? (
                  <h3 className="px-3 py-2 text-base font-semibold text-white">{section.title}</h3>
                ) : null}
                <ul>
                  {sectionTasks.map((task) => {
                    const row = renderTaskRow(task, rowIndex, rowProps);
                    rowIndex += 1;
                    return (
                      <li
                        key={task.id}
                        draggable
                        onDragStart={() => setDragTaskId(task.id)}
                        onDragEnd={() => setDragTaskId(null)}
                      >
                        {row}
                      </li>
                    );
                  })}
                </ul>
                {section.id > 0 ? (
                  automationMode ? (
                    <div className="px-3 pb-2">
                      <Field
                        value={draft}
                        onChange={(e) =>
                          setDraftBySection((prev) => ({ ...prev, [section.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && draft.trim()) {
                            onAddTask(section.id, draft.trim());
                            setDraftBySection((prev) => ({ ...prev, [section.id]: "" }));
                          }
                        }}
                        placeholder="Add action"
                      />
                    </div>
                  ) : (
                    <div className={cn(LIST_GRID, "mt-1 px-3")}>
                      <span />
                      <Field
                        value={draft}
                        onChange={(e) =>
                          setDraftBySection((prev) => ({ ...prev, [section.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && draft.trim()) {
                            onAddTask(section.id, draft.trim());
                            setDraftBySection((prev) => ({ ...prev, [section.id]: "" }));
                          }
                        }}
                        placeholder="Add task"
                      />
                    </div>
                  )
                ) : null}
              </section>
            );
          })
        : null}
      {showDoneSection && doneTasks.length > 0 ? (
        <section>
          <h3 className="bg-ui-field px-3 py-2 text-base font-semibold text-white">
            Done
            <span className="ml-2 text-muted-foreground">{doneTasks.length}</span>
          </h3>
          <ul>
            {doneTasks.map((task) => {
              const row = renderTaskRow(task, rowIndex, rowProps);
              rowIndex += 1;
              return <li key={task.id}>{row}</li>;
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
