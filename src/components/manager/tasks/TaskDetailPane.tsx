import React, { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  TaskFormFieldGrid,
  TaskFormInfield,
  TaskFormInfieldSelect,
  TaskFormPanel,
} from "@/components/manager/tasks/TaskFormLayout";
import {
  TASK_PROJECT_DIALOG_CLASS,
} from "@/components/manager/tasks/task-form-layout-styles";
import { TaskAssigneePicker } from "@/components/manager/tasks/TaskAssigneePicker";
import { TaskTagPicker } from "@/components/manager/tasks/TaskTagPicker";
import { TaskSubtaskList } from "@/components/manager/tasks/TaskSubtaskList";
import { TaskTriggerFields } from "@/components/manager/tasks/TaskTriggerFields";
import { ensurePostCreatorPayload } from "@/lib/post-creator/post-creator-defaults";
import { automationUsesTriggerUi, resolveEditorialPostCreatorTask } from "@/lib/task-automation-ui";
import { TASK_EXECUTION_KIND_OPTIONS } from "@/lib/task-execution-kind-options";
import { AutomationTaskExecuteButton } from "@/components/manager/tasks/AutomationTaskExecuteButton";
import type { TaskExecutionKind, TaskRecurrenceRule, TaskStatus } from "@/lib/tasks-types";
import { ensureContentGapCheckPayload } from "@/lib/content-gap/resolve-content-gap-count";
import { TASK_RECURRENCE_LABELS, TASK_RECURRENCE_RULES, TASK_STATUS_LABELS, TASK_STATUSES } from "@/lib/tasks-types";
import {
  defaultTaskTriggerConfig,
} from "@/lib/task-trigger-types";
import { taskHasPulseAssignee } from "@/lib/tasks-filter";
import { Button, Field, TextareaField, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/ui";
import {
  AUTOMATION_CALENDAR_TABS,
  AUTOMATION_TRIGGER_TABS,
  REGULAR_TABS,
  type AutomationTab,
  type DetailTab,
  type RegularTab,
  type TaskDetailPaneProps,
} from "@/components/manager/tasks/task-detail-pane-types";
import { TaskDetailTabBar } from "@/components/manager/tasks/TaskDetailTabBar";
import { TaskDetailAutomationSchedulePanel } from "@/components/manager/tasks/TaskDetailAutomationSchedulePanel";
import { TaskDetailActivityPanel } from "@/components/manager/tasks/TaskDetailActivityPanel";

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

  const taskId = task?.id;
  const taskTitle = task?.title;
  const taskKeyword = task?.keyword;
  const taskDescription = task?.description;
  useEffect(() => {
    if (taskId == null) return;
    setLocalTitle(taskTitle ?? "");
    setLocalKeyword(taskKeyword ?? "");
    setLocalDescription(taskDescription ?? "");
    setActiveTab("details");
  }, [taskId, taskTitle, taskKeyword, taskDescription]);

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
    <TaskDetailAutomationSchedulePanel
      task={task}
      executionKind={executionKind}
      executionPayload={executionPayload}
      saving={saving}
      onUpdate={onUpdate}
    />
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
    <TaskDetailActivityPanel
      task={task}
      isAutomationContext={isAutomationContext}
      subtasks={subtasks}
      onToggleSubtask={onToggleSubtask}
      onAddSubtask={onAddSubtask}
      notes={notes}
      memberNames={memberNames}
      mentionMembers={mentionMembers}
      saving={saving}
      onAddNote={onAddNote}
      teamId={teamId}
      files={files}
      uploading={uploading}
      onUploadFile={onUploadFile}
    />
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
