import React, { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  TASK_PROJECT_DIALOG_CLASS,
  TaskFormFieldGrid,
  TaskFormInfield,
  TaskFormInfieldSelect,
  TaskFormPanel,
} from "@/components/manager/tasks/TaskFormLayout";
import { TaskAssigneePicker } from "@/components/manager/tasks/TaskAssigneePicker";
import { TaskTagPicker } from "@/components/manager/tasks/TaskTagPicker";
import { TaskSubtaskList } from "@/components/manager/tasks/TaskSubtaskList";
import { TaskCommentComposer } from "@/components/manager/tasks/TaskCommentComposer";
import { TaskFileUpload } from "@/components/manager/tasks/TaskFileUpload";
import { TaskTriggerFields } from "@/components/manager/tasks/TaskTriggerFields";
import { GscReportingExecutionFields } from "@/components/manager/tasks/GscReportingExecutionFields";
import { AdsReportingExecutionFields } from "@/components/manager/tasks/AdsReportingExecutionFields";
import { LocalDominatorExportExecutionFields } from "@/components/manager/tasks/LocalDominatorExportExecutionFields";
import { PostCreatorExecutionFields } from "@/components/manager/tasks/PostCreatorExecutionFields";
import { EntityPageCreatorExecutionFields } from "@/components/manager/tasks/EntityPageCreatorExecutionFields";
import { EntityGeneratorExecutionFields } from "@/components/manager/tasks/EntityGeneratorExecutionFields";
import { SapGeneratorExecutionFields } from "@/components/manager/tasks/SapGeneratorExecutionFields";
import { ContentGapCheckExecutionFields, ensureContentGapCheckPayload } from "@/components/manager/tasks/ContentGapCheckExecutionFields";
import { BrowserAutomationExecutionFields } from "@/components/manager/tasks/BrowserAutomationExecutionFields";
import { ensurePostCreatorPayload } from "@/lib/post-creator/post-creator-defaults";
import { ensureEntityPageCreatorPayload } from "@/lib/entity-page-creator/entity-page-creator-defaults";
import { automationUsesTriggerUi, resolveEditorialPostCreatorTask } from "@/lib/task-automation-ui";
import { TASK_EXECUTION_KIND_OPTIONS } from "@/lib/task-execution-kind-options";
import { AutomationTaskExecuteButton } from "@/components/manager/tasks/AutomationTaskExecuteButton";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import type {
  TaskFile,
  TaskNote,
  TaskProject,
  TaskTag,
  TeamTask,
  TaskStatus,
  TaskRecurrenceRule,
  TaskExecutionKind,
  TaskExecutionPayload,
  EntityPageCreatorExecutionPayload,
  TaskScheduleMode,
} from "@/lib/tasks-types";
import { TASK_RECURRENCE_LABELS, TASK_RECURRENCE_RULES, TASK_STATUS_LABELS, TASK_STATUSES } from "@/lib/tasks-types";
import {
  defaultTaskTriggerConfig,
  type TaskTriggerConfig,
} from "@/lib/task-trigger-types";
import type { TeamMember } from "@/lib/teams-types";
import { taskHasPulseAssignee } from "@/lib/tasks-filter";
import type { WordPressSiteOption } from "@/components/manager/tasks/NewTaskDialog";
import { Button, Field, TextareaField } from "@/ui";

export type TaskDetailPaneProps = {
  open: boolean;
  task: TeamTask | null;
  notes: TaskNote[];
  files: TaskFile[];
  subtasks: TeamTask[];
  tags: TaskTag[];
  members: TeamMember[];
  siteOptions: WordPressSiteOption[];
  memberNames: Map<number, string>;
  teamId: number | null;
  saving: boolean;
  uploading: boolean;
  isAutomationContext?: boolean;
  automationProject?: Pick<TaskProject, "keyword" | "sourceTemplateKeyword"> | null;
  onClose: () => void;
  onMarkDone: () => void;
  onUpdate: (patch: {
    keyword?: string;
    title?: string;
    description?: string;
    status?: TaskStatus;
    assigneeIds?: number[];
    dueDate?: string;
    dueTime?: string;
    tagIds?: string[];
    recurrenceRule?: TaskRecurrenceRule;
    scheduleMode?: TaskScheduleMode;
    triggerConfig?: TaskTriggerConfig;
    executionKind?: TaskExecutionKind;
    executionPayload?: TaskExecutionPayload;
  }) => void;
  mentionMembers: TeamMember[];
  onAddNote: (body: string, mentionUserIds: number[]) => void;
  onUploadFile: (file: File) => void;
  onAddSubtask: (title: string) => void;
  onToggleSubtask: (taskId: number, status: TaskStatus) => void;
  onDelete: () => void;
  onExecuteAutomationTask?: () => void;
  onExecuteWithAgent?: () => void;
  executeWithAgentDisabledReason?: string | null;
};

type AutomationTab = "details" | "trigger" | "schedule" | "agent" | "activity";
type RegularTab = "details" | "schedule" | "people" | "activity";
type DetailTab = AutomationTab | RegularTab;

const AUTOMATION_TRIGGER_TABS: { id: AutomationTab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "trigger", label: "Trigger" },
  { id: "agent", label: "Agent" },
  { id: "activity", label: "Activity" },
];

const AUTOMATION_CALENDAR_TABS: { id: AutomationTab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "schedule", label: "Schedule" },
  { id: "agent", label: "Agent" },
  { id: "activity", label: "Activity" },
];

const REGULAR_TABS: { id: RegularTab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "schedule", label: "Schedule" },
  { id: "people", label: "People" },
  { id: "activity", label: "Activity" },
];

function NoteBody({ body }: { body: string }) {
  const parts = body.split(/(@\S+(?:\s+\S+)?)/g);
  return (
    <p className="whitespace-pre-wrap text-base text-muted-foreground">
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <span key={i} className="text-primary">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </p>
  );
}

function TaskDetailTabBar({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: { id: DetailTab; label: string }[];
  activeTab: DetailTab;
  onChange: (tab: DetailTab) => void;
}): React.ReactElement {
  return (
    <div className="flex shrink-0 flex-wrap gap-1 border-b border-border pb-3" role="tablist">
      {tabs.map((tab) => (
        <WorkspacePill
          key={tab.id}
          label={tab.label}
          active={activeTab === tab.id}
          square
          onClick={() => onChange(tab.id)}
        />
      ))}
    </div>
  );
}

export function TaskDetailPane({
  open,
  task,
  notes,
  files,
  subtasks,
  tags,
  members,
  siteOptions,
  memberNames,
  mentionMembers,
  teamId,
  saving,
  uploading,
  isAutomationContext = false,
  automationProject = null,
  onClose,
  onMarkDone,
  onUpdate,
  onAddNote,
  onUploadFile,
  onAddSubtask,
  onToggleSubtask,
  onDelete,
  onExecuteAutomationTask,
  onExecuteWithAgent,
  executeWithAgentDisabledReason,
}: TaskDetailPaneProps): React.ReactElement {
  const [localTitle, setLocalTitle] = useState("");
  const [localKeyword, setLocalKeyword] = useState("");
  const [localDescription, setLocalDescription] = useState("");
  const [activeTab, setActiveTab] = useState<DetailTab>("details");

  useEffect(() => {
    if (!task) return;
    setLocalTitle(task.title);
    setLocalKeyword(task.keyword);
    setLocalDescription(task.description);
    setActiveTab("details");
  }, [task?.id, task?.title, task?.keyword, task?.description]);

  const flushFields = useCallback(() => {
    if (!task) return;
    onUpdate({
      title: localTitle,
      keyword: localKeyword,
      description: localDescription,
    });
  }, [localDescription, localKeyword, localTitle, onUpdate, task]);

  const pulseAssigned = task ? taskHasPulseAssignee(task, members) : false;
  const editorialResolved = task ? resolveEditorialPostCreatorTask(task, automationProject) : null;
  const scheduleMode = editorialResolved?.scheduleMode ?? task?.scheduleMode ?? "calendar";
  const executionKind =
    editorialResolved?.executionKind ??
    (task?.executionKind?.trim() || "content_optimizer");
  const executionPayload =
    editorialResolved?.executionPayload ?? task?.executionPayload ?? { updateMode: "update" };
  const clientLabel = task?.wordpressSiteId
    ? siteOptions.find((s) => s.id === task.wordpressSiteId)?.name ?? task.wordpressSiteId
    : "None";

  const usesTriggerUi = automationUsesTriggerUi(executionKind, scheduleMode, {
    task,
    project: automationProject,
  });
  const tabs = isAutomationContext
    ? usesTriggerUi
      ? AUTOMATION_TRIGGER_TABS
      : AUTOMATION_CALENDAR_TABS
    : REGULAR_TABS;

  const detailsPanel = task ? (
    <TaskFormPanel title="Task details">
      <TaskFormFieldGrid>
        <TaskFormInfield label="Keyword">
          <Field
            placeholder="Task keyword"
            value={localKeyword}
            onChange={(e) => setLocalKeyword(e.target.value)}
            onBlur={flushFields}
            aria-label="Task keyword"
            disabled={saving}
          />
        </TaskFormInfield>
        <TaskFormInfield label="Title">
          <Field
            placeholder="Task title"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={flushFields}
            aria-label="Task title"
            disabled={saving}
          />
        </TaskFormInfield>
      </TaskFormFieldGrid>
      <TaskFormInfield label="Description">
        <TextareaField
          placeholder="Task description"
          value={localDescription}
          onChange={(e) => setLocalDescription(e.target.value)}
          onBlur={flushFields}
          aria-label="Task description"
          rows={4}
          disabled={saving}
        />
      </TaskFormInfield>
      <TaskFormInfieldSelect
        label="Status"
        value={task.status}
        onChange={(v) => onUpdate({ status: v as TaskStatus })}
        disabled={saving}
        options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABELS[s] }))}
      />
      {!isAutomationContext ? (
        <TaskSubtaskList subtasks={subtasks} onToggle={onToggleSubtask} onAdd={onAddSubtask} />
      ) : null}
    </TaskFormPanel>
  ) : null;

  const triggerPanel = task ? (
    <TaskFormPanel title="GSC trigger">
      <TaskTriggerFields
        layout="stack"
        triggerConfig={task.triggerConfig ?? defaultTaskTriggerConfig()}
        executionPayload={task.executionPayload}
        disabled={saving}
        onChange={(triggerConfig) => onUpdate({ triggerConfig })}
        onExecutionPayloadChange={(executionPayload) => onUpdate({ executionPayload })}
      />
      {task.triggerMeta?.lastEvaluatedAt ? (
        <p className="text-base text-muted-foreground">
          Last eval {task.triggerMeta.lastEvaluatedAt.slice(0, 16)} ·{" "}
          {task.triggerMeta.lastMatchedCount ?? 0} matches
          {task.triggerMeta.lastFiredAt ? ` · last run ${task.triggerMeta.lastFiredAt.slice(0, 16)}` : ""}
        </p>
      ) : null}
    </TaskFormPanel>
  ) : null;

  const agentPanel = task ? (
    <TaskFormPanel title="Agent execution">
      <TaskFormInfield label="Assignee">
        <span className="text-base text-primary">NEO Pulse</span>
      </TaskFormInfield>
      <TaskFormInfield label="Client">
        <span className="text-base text-white">{clientLabel}</span>
      </TaskFormInfield>
      <TaskFormInfieldSelect
        label="Execution"
        value={executionKind}
        onChange={(v) => {
          const kind = v as TaskExecutionKind;
          if (kind === "post_creator") {
            onUpdate({
              executionKind: kind,
              scheduleMode: "calendar",
              executionPayload: ensurePostCreatorPayload(task.executionPayload),
            });
            return;
          }
          if (kind === "gsc_reporting" || kind === "ads_reporting") {
            onUpdate({
              executionKind: kind,
              scheduleMode: "calendar",
              executionPayload: {
                comparePreset: task.executionPayload?.comparePreset ?? "mom",
                saveToDisk: task.executionPayload?.saveToDisk !== false,
              },
            });
            return;
          }
          if (kind === "content_gap_check") {
            onUpdate({
              executionKind: kind,
              scheduleMode: "calendar",
              executionPayload: ensureContentGapCheckPayload(task.executionPayload),
            });
            return;
          }
          onUpdate({ executionKind: kind, scheduleMode: "trigger" });
        }}
        disabled={saving}
        options={TASK_EXECUTION_KIND_OPTIONS}
      />
    </TaskFormPanel>
  ) : null;

  const automationSchedulePanel = task ? (
    <TaskFormPanel title="Calendar schedule">
      <TaskFormInfieldSelect
        label="Recurrence"
        value={task.recurrenceRule ?? "none"}
        onChange={(v) => onUpdate({ recurrenceRule: v as TaskRecurrenceRule })}
        disabled={saving}
        options={TASK_RECURRENCE_RULES.filter((r) => r !== "none").map((rule) => ({
          value: rule,
          label: TASK_RECURRENCE_LABELS[rule],
        }))}
      />
      <TaskFormFieldGrid>
        <TaskFormInfield label="Due date">
          <Field
            placeholder="Due date"
            type="date"
            value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
            onChange={(e) => onUpdate({ dueDate: e.target.value })}
            disabled={saving}
          />
        </TaskFormInfield>
        <TaskFormInfield label="Due time">
          <Field
            placeholder="Due time"
            type="time"
            value={task.dueTime ?? ""}
            onChange={(e) => onUpdate({ dueTime: e.target.value })}
            disabled={saving}
            aria-label="Due time"
          />
        </TaskFormInfield>
      </TaskFormFieldGrid>
      {executionKind === "entity_page_creator" ? (
        <EntityPageCreatorExecutionFields
          layout="stack"
          executionPayload={ensureEntityPageCreatorPayload(executionPayload as EntityPageCreatorExecutionPayload)}
          disabled={saving}
          onChange={(nextPayload) =>
            onUpdate({
              executionPayload: ensureEntityPageCreatorPayload(nextPayload as EntityPageCreatorExecutionPayload),
              executionKind: "entity_page_creator",
              scheduleMode: "calendar",
            })
          }
        />
      ) : null}
      {executionKind === "entity_generator" ? (
        <EntityGeneratorExecutionFields
          executionPayload={ensureEntityPageCreatorPayload(executionPayload as EntityPageCreatorExecutionPayload)}
          disabled={saving}
          onChange={(nextPayload) =>
            onUpdate({
              executionPayload: ensureEntityPageCreatorPayload(nextPayload as EntityPageCreatorExecutionPayload),
              executionKind: "entity_generator",
              scheduleMode: "calendar",
            })
          }
        />
      ) : null}
      {executionKind === "sap_generator" ? (
        <SapGeneratorExecutionFields
          executionPayload={ensureEntityPageCreatorPayload(executionPayload as EntityPageCreatorExecutionPayload)}
          disabled={saving}
          onChange={(nextPayload) =>
            onUpdate({
              executionPayload: ensureEntityPageCreatorPayload(nextPayload as EntityPageCreatorExecutionPayload),
              executionKind: "sap_generator",
              scheduleMode: "calendar",
            })
          }
        />
      ) : null}
      {executionKind === "post_creator" ? (
        <PostCreatorExecutionFields
          layout="stack"
          executionPayload={ensurePostCreatorPayload(executionPayload)}
          disabled={saving}
          onChange={(nextPayload) =>
            onUpdate({ executionPayload: ensurePostCreatorPayload(nextPayload), executionKind: "post_creator", scheduleMode: "calendar" })
          }
        />
      ) : null}
      {executionKind === "gsc_reporting" ? (
        <GscReportingExecutionFields
          layout="stack"
          executionPayload={executionPayload}
          disabled={saving}
          onChange={(nextPayload) => onUpdate({ executionPayload: nextPayload })}
        />
      ) : null}
      {executionKind === "ads_reporting" ? (
        <AdsReportingExecutionFields
          layout="stack"
          executionPayload={executionPayload}
          disabled={saving}
          onChange={(nextPayload) => onUpdate({ executionPayload: nextPayload })}
        />
      ) : null}
      {executionKind === "local_dominator_export" ? (
        <LocalDominatorExportExecutionFields
          layout="stack"
          executionPayload={executionPayload}
          disabled={saving}
          onChange={(nextPayload) => onUpdate({ executionPayload: nextPayload })}
        />
      ) : null}
      {executionKind === "content_gap_check" ? (
        <ContentGapCheckExecutionFields
          layout="stack"
          clientSiteId={task.wordpressSiteId ?? ""}
          executionPayload={executionPayload}
          disabled={saving}
          onChange={(nextPayload) =>
            onUpdate({
              executionPayload: ensureContentGapCheckPayload(nextPayload),
              executionKind: "content_gap_check",
              scheduleMode: "calendar",
            })
          }
        />
      ) : null}
      {executionKind === "browser_automation" ? (
        <BrowserAutomationExecutionFields
          layout="stack"
          clientSiteId={task.wordpressSiteId ?? ""}
          executionPayload={executionPayload}
          disabled={saving}
          onChange={(nextPayload) =>
            onUpdate({
              executionPayload: nextPayload,
              executionKind: "browser_automation",
              scheduleMode: "calendar",
            })
          }
        />
      ) : null}
    </TaskFormPanel>
  ) : null;

  const schedulePanel = task ? (
    <TaskFormPanel title="Schedule">
      <TaskFormInfieldSelect
        label="Recurrence"
        value={task.recurrenceRule ?? "none"}
        onChange={(v) => onUpdate({ recurrenceRule: v as TaskRecurrenceRule })}
        disabled={saving}
        options={TASK_RECURRENCE_RULES.map((rule) => ({
          value: rule,
          label: TASK_RECURRENCE_LABELS[rule],
        }))}
      />
      <TaskFormFieldGrid>
        <TaskFormInfield label="Due date">
          <Field
            placeholder="Due date"
            type="date"
            value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
            onChange={(e) => onUpdate({ dueDate: e.target.value })}
            disabled={saving}
          />
        </TaskFormInfield>
        <TaskFormInfield label="Due time">
          <Field
            placeholder="Due time"
            type="time"
            value={task.dueTime ?? ""}
            onChange={(e) => onUpdate({ dueTime: e.target.value })}
            disabled={saving}
            aria-label="Due time"
          />
        </TaskFormInfield>
      </TaskFormFieldGrid>
    </TaskFormPanel>
  ) : null;

  const peoplePanel = task ? (
    <TaskFormPanel title="People">
      <TaskAssigneePicker
        members={members}
        assigneeIds={task.assigneeIds}
        onChange={(assigneeIds) => onUpdate({ assigneeIds })}
        humansOnly
      />
      <TaskTagPicker tags={tags} selectedTagIds={task.tagIds} onChange={(tagIds) => onUpdate({ tagIds })} />
    </TaskFormPanel>
  ) : null;

  const activityPanel = task ? (
    <div className="flex flex-col gap-4">
      {isAutomationContext ? (
        <TaskSubtaskList subtasks={subtasks} onToggle={onToggleSubtask} onAdd={onAddSubtask} />
      ) : null}
      <div className="flex flex-col gap-2">
        <p className="text-base font-semibold text-white">Comments</p>
        {notes.length === 0 ? (
          <p className="text-base text-muted-foreground">No comments yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((note) => (
              <li key={note.id} className="flex flex-col gap-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-medium text-white">
                    {memberNames.get(note.authorId) ?? `User ${note.authorId}`}
                  </span>
                  <span className="text-base text-muted-foreground">{note.createdAt.slice(0, 10)}</span>
                </div>
                <NoteBody body={note.body} />
              </li>
            ))}
          </ul>
        )}
        <TaskCommentComposer members={mentionMembers} disabled={saving} onSubmit={onAddNote} />
      </div>
      {teamId ? (
        <TaskFileUpload
          teamId={teamId}
          taskId={task.id}
          files={files}
          uploading={uploading}
          onUpload={onUploadFile}
        />
      ) : null}
    </div>
  ) : null;

  const tabPanel = (() => {
    if (!task) return null;
    if (isAutomationContext) {
      switch (activeTab as AutomationTab) {
        case "trigger":
          return triggerPanel;
        case "schedule":
          return automationSchedulePanel;
        case "agent":
          return agentPanel;
        case "activity":
          return activityPanel;
        default:
          return detailsPanel;
      }
    }
    switch (activeTab as RegularTab) {
      case "schedule":
        return schedulePanel;
      case "people":
        return peoplePanel;
      case "activity":
        return activityPanel;
      default:
        return detailsPanel;
    }
  })();

  return (
    <Dialog
      open={open && task != null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className={cn(TASK_PROJECT_DIALOG_CLASS, "max-w-3xl")}>
        {task ? (
          <>
            <DialogHeader className="shrink-0 space-y-1 pr-8 text-left">
              <DialogTitle className="text-base font-semibold text-white">{task.title}</DialogTitle>
              {task.projectTitle ? (
                <p className="text-base text-muted-foreground">{task.projectTitle}</p>
              ) : null}
            </DialogHeader>

            {pulseAssigned && executeWithAgentDisabledReason ? (
              <p className="shrink-0 text-base text-primary">{executeWithAgentDisabledReason}</p>
            ) : null}

            <TaskDetailTabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

            <div className="min-h-0 flex-1 overflow-y-auto py-1">{tabPanel}</div>

            <DialogFooter className="shrink-0 flex-row flex-wrap justify-between gap-2 border-t border-border pt-3 sm:justify-between">
              <Button variant="danger" type="button" disabled={saving} onClick={onDelete}>
                Delete
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="run"
                  type="button"
                  disabled={saving || task.status === "done"}
                  onClick={onMarkDone}
                >
                  Mark done
                </Button>
                {isAutomationContext ? (
                  <AutomationTaskExecuteButton
                    teamId={teamId}
                    taskId={task.id}
                    task={task}
                    project={automationProject}
                    disabled={saving}
                    onExecuted={() => onExecuteAutomationTask?.()}
                  />
                ) : null}
                {pulseAssigned && !isAutomationContext && scheduleMode === "calendar" ? (
                  <Button
                    type="button"
                    disabled={saving || Boolean(executeWithAgentDisabledReason)}
                    onClick={() => onExecuteWithAgent?.()}
                  >
                    Execute task
                  </Button>
                ) : null}
              </div>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
