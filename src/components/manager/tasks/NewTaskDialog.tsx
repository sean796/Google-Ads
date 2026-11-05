import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActionButton, Button, DialogShell, Field, TextareaField } from "@/ui";
import {
  TaskFormFieldGrid,
  TaskFormInfield,
  TaskFormInfieldSelect,
  TaskFormPanel,
} from "@/components/manager/tasks/TaskFormLayout";
import { TaskAssigneePicker } from "@/components/manager/tasks/TaskAssigneePicker";
import { TaskTagPicker } from "@/components/manager/tasks/TaskTagPicker";
import { TaskTriggerFields } from "@/components/manager/tasks/TaskTriggerFields";
import { GscReportingExecutionFields } from "@/components/manager/tasks/GscReportingExecutionFields";
import { AdsReportingExecutionFields } from "@/components/manager/tasks/AdsReportingExecutionFields";
import { LocalDominatorExportExecutionFields } from "@/components/manager/tasks/LocalDominatorExportExecutionFields";
import { PostCreatorExecutionFields } from "@/components/manager/tasks/PostCreatorExecutionFields";
import { ensurePostCreatorPayload } from "@/lib/post-creator/post-creator-defaults";
import { automationUsesTriggerUi, resolveEditorialPostCreatorTask, resolveEffectiveExecutionKind } from "@/lib/task-automation-ui";
import { TASK_EXECUTION_KIND_OPTIONS } from "@/lib/task-execution-kind-options";
import type { TaskProject, TaskTag, TeamTask, TaskStatus, TaskRecurrenceRule, TaskExecutionKind, TaskExecutionPayload, TaskScheduleMode } from "@/lib/tasks-types";
import { TASK_RECURRENCE_LABELS, TASK_RECURRENCE_RULES, TASK_STATUS_LABELS, TASK_STATUSES } from "@/lib/tasks-types";
import {
  defaultTaskTriggerConfig,
  type TaskTriggerConfig,
} from "@/lib/task-trigger-types";
import type { TeamMember } from "@/lib/teams-types";

const SAVE_STATES = ["Save", "Saving", "Create", "Creating"] as const;
export type WordPressSiteOption = { id: string; name: string };

export type TaskFormPayload = {
  keyword: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  dueDate?: string;
  dueTime?: string;
  recurrenceRule?: TaskRecurrenceRule;
  scheduleMode?: TaskScheduleMode;
  triggerConfig?: TaskTriggerConfig;
  assigneeIds?: number[];
  tagIds?: string[];
  executionKind?: TaskExecutionKind;
  executionPayload?: TaskExecutionPayload;
};

export type NewTaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: TaskProject[];
  defaultProjectId: number | null;
  automationContext?: boolean;
  editTask?: TeamTask | null;
  members: TeamMember[];
  tags?: TaskTag[];
  sites?: WordPressSiteOption[];
  onCreate: (payload: TaskFormPayload & { projectId: number }) => Promise<boolean>;
  onUpdate?: (taskId: number, payload: TaskFormPayload) => Promise<boolean>;
};

export function NewTaskDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectId,
  automationContext = false,
  editTask = null,
  members,
  tags = [],
  sites = [],
  onCreate,
  onUpdate,
}: NewTaskDialogProps): React.ReactElement {
  const [keyword, setKeyword] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [recurrenceRule, setRecurrenceRule] = useState<TaskRecurrenceRule>("none");
  const [scheduleMode, setScheduleMode] = useState<TaskScheduleMode>("calendar");
  const [triggerConfig, setTriggerConfig] = useState<TaskTriggerConfig>(defaultTaskTriggerConfig());
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [executionKind, setExecutionKind] = useState<TaskExecutionKind>("content_optimizer");
  const [executionPayload, setExecutionPayload] = useState<TaskExecutionPayload>({ updateMode: "update" });
  const [projectId, setProjectId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = editTask != null;
  const agentMode = automationContext;

  const activeProject = useMemo(() => {
    if (isEdit && editTask) {
      return projects.find((p) => p.id === editTask.projectId) ?? null;
    }
    if (projectId != null) {
      return projects.find((p) => p.id === projectId) ?? null;
    }
    return null;
  }, [editTask, isEdit, projectId, projects]);

  const uiExecutionKind = isEdit && editTask
    ? resolveEffectiveExecutionKind(editTask, activeProject)
    : executionKind;
  const showTriggerFields =
    agentMode &&
    automationUsesTriggerUi(uiExecutionKind, scheduleMode, {
      task: editTask,
      project: activeProject,
    });
  const showCalendarFields = agentMode && !showTriggerFields;

  const clientSiteId = isEdit ? editTask?.wordpressSiteId : activeProject?.wordpressSiteId;
  const clientLabel = clientSiteId
    ? sites.find((s) => s.id === clientSiteId)?.name ?? clientSiteId
    : "None";

  const reset = useCallback(() => {
    setKeyword("");
    setTitle("");
    setDescription("");
    setStatus("todo");
    setDueDate("");
    setDueTime("");
    setRecurrenceRule("none");
    setScheduleMode(agentMode ? "trigger" : "calendar");
    setTriggerConfig(defaultTaskTriggerConfig());
    setAssigneeIds([]);
    setTagIds([]);
    setExecutionKind("content_optimizer");
    setExecutionPayload({ updateMode: "update" });
    setProjectId(defaultProjectId ?? projects[0]?.id ?? null);
    setError(null);
  }, [agentMode, defaultProjectId, projects]);

  useEffect(() => {
    if (!open) return;
    if (editTask) {
      const project = projects.find((p) => p.id === editTask.projectId) ?? null;
      const resolved = resolveEditorialPostCreatorTask(editTask, project);
      setKeyword(editTask.keyword);
      setTitle(editTask.title);
      setDescription(editTask.description ?? "");
      setStatus(editTask.status);
      setDueDate(editTask.dueDate ? editTask.dueDate.slice(0, 10) : "");
      setDueTime(editTask.dueTime ?? "");
      setRecurrenceRule(resolved?.recurrenceRule ?? editTask.recurrenceRule ?? "none");
      setScheduleMode(resolved?.scheduleMode ?? editTask.scheduleMode ?? "calendar");
      setTriggerConfig(editTask.triggerConfig ?? defaultTaskTriggerConfig());
      setAssigneeIds(editTask.assigneeIds ?? []);
      setTagIds(editTask.tagIds ?? []);
      setExecutionKind(
        (resolved?.executionKind ??
          (editTask.executionKind?.trim() || "content_optimizer")) as TaskExecutionKind,
      );
      setExecutionPayload(
        resolved?.executionPayload ??
          (editTask.executionKind === "post_creator"
            ? ensurePostCreatorPayload(editTask.executionPayload)
            : (editTask.executionPayload ?? { updateMode: "update" })),
      );
      setProjectId(editTask.projectId);
      setError(null);
    } else {
      reset();
    }
  }, [editTask, open, projects, reset]);

  const handleSubmit = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }
    if (!isEdit && (projectId == null || projectId <= 0)) {
      setError("Select a project.");
      return;
    }
    if (!isEdit && projects.length === 0) {
      setError(agentMode ? "Create an automation first." : "Create a project first.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload: TaskFormPayload = agentMode
      ? {
          keyword: keyword.trim() || trimmedTitle.toLowerCase().replace(/\s+/g, "-"),
          title: trimmedTitle,
          description: description.trim(),
          status,
          scheduleMode: showTriggerFields ? "trigger" : "calendar",
          recurrenceRule: showTriggerFields ? "none" : recurrenceRule,
          dueDate: showCalendarFields ? dueDate.trim() : undefined,
          dueTime: showCalendarFields
            ? dueTime.trim().includes(":")
              ? dueTime.trim().slice(0, 5)
              : dueTime.trim()
            : undefined,
          triggerConfig: showTriggerFields ? triggerConfig : undefined,
          executionKind,
          executionPayload:
            executionKind === "post_creator"
              ? ensurePostCreatorPayload(executionPayload)
              : executionPayload,
        }
      : {
          keyword: keyword.trim() || trimmedTitle.toLowerCase().replace(/\s+/g, "-"),
          title: trimmedTitle,
          description: description.trim(),
          status,
          dueDate: dueDate.trim(),
          dueTime: dueTime.trim().includes(":") ? dueTime.trim().slice(0, 5) : dueTime.trim(),
          recurrenceRule,
          scheduleMode: "calendar",
          assigneeIds,
          tagIds,
        };
    let ok = false;
    if (isEdit && editTask && onUpdate) {
      ok = await onUpdate(editTask.id, payload);
      if (!ok) setError("Could not update task.");
    } else if (projectId != null) {
      ok = await onCreate({ ...payload, projectId });
      if (!ok) setError("Could not create task.");
    }
    setSaving(false);
    if (!ok) return;
    reset();
    onOpenChange(false);
  }, [
    assigneeIds,
    agentMode,
    showTriggerFields,
    showCalendarFields,
    description,
    dueDate,
    dueTime,
    editTask,
    executionKind,
    executionPayload,
    isEdit,
    keyword,
    onCreate,
    onOpenChange,
    onUpdate,
    projectId,
    projects.length,
    recurrenceRule,
    reset,
    status,
    tagIds,
    title,
    triggerConfig,
  ]);

  const saveState = saving ? (isEdit ? "Saving" : "Creating") : isEdit ? "Save" : "Create";

  return (
    <DialogShell
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      size="xl"
      title={isEdit ? "Edit task" : agentMode ? "New trigger task" : "New task"}
      actions={
        <>
          <Button variant="tool" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <ActionButton
            states={SAVE_STATES}
            state={saveState}
            disabled={saving}
            onClick={() => void handleSubmit()}
          />
        </>
      }
    >
      <TaskFormPanel title="Task">
        {!isEdit && projects.length > 0 ? (
          <TaskFormInfieldSelect
            label="Project"
            value={projectId != null ? String(projectId) : ""}
            onChange={(v) => setProjectId(Number(v))}
            disabled={saving}
            options={projects.map((project) => ({
              value: String(project.id),
              label: project.title,
            }))}
          />
        ) : null}
        {isEdit && activeProject ? (
          <TaskFormInfield label="Project">
            <span className="text-base text-foreground">{activeProject.title}</span>
          </TaskFormInfield>
        ) : null}
        <TaskFormFieldGrid>
          <Field placeholder="Keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} disabled={saving} />
          <Field placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} />
        </TaskFormFieldGrid>
        <TextareaField
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          disabled={saving}
        />
      </TaskFormPanel>

      <TaskFormPanel title="Schedule">
        <TaskFormFieldGrid>
          <TaskFormInfieldSelect
            label="Status"
            value={status}
            onChange={(v) => setStatus(v as TaskStatus)}
            disabled={saving}
            options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABELS[s] }))}
          />
          {!agentMode || showCalendarFields ? (
            <TaskFormInfieldSelect
              label="Recurrence"
              value={recurrenceRule}
              onChange={(v) => setRecurrenceRule(v as TaskRecurrenceRule)}
              disabled={saving}
              options={TASK_RECURRENCE_RULES.filter((r) => !agentMode || r !== "none").map((rule) => ({
                value: rule,
                label: TASK_RECURRENCE_LABELS[rule],
              }))}
            />
          ) : null}
        </TaskFormFieldGrid>
        {showTriggerFields ? (
          <TaskTriggerFields
            layout="inline"
            triggerConfig={triggerConfig}
            executionPayload={executionPayload}
            disabled={saving}
            onChange={setTriggerConfig}
            onExecutionPayloadChange={setExecutionPayload}
          />
        ) : showCalendarFields || !agentMode ? (
          <>
            <TaskFormFieldGrid>
              <Field
                type="date"
                placeholder="Due date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={saving}
              />
              <Field
                type="time"
                placeholder="Due time"
                aria-label="Due time Edmonton"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                disabled={saving}
              />
            </TaskFormFieldGrid>
            {showCalendarFields && (uiExecutionKind === "post_creator" || executionKind === "post_creator") ? (
              <PostCreatorExecutionFields
                layout="stack"
                executionPayload={executionPayload}
                disabled={saving}
                onChange={setExecutionPayload}
              />
            ) : null}
            {showCalendarFields && (uiExecutionKind === "gsc_reporting" || executionKind === "gsc_reporting") ? (
              <GscReportingExecutionFields
                layout="stack"
                executionPayload={executionPayload}
                disabled={saving}
                onChange={setExecutionPayload}
              />
            ) : null}
            {showCalendarFields && (uiExecutionKind === "ads_reporting" || executionKind === "ads_reporting") ? (
              <AdsReportingExecutionFields
                layout="stack"
                executionPayload={executionPayload}
                disabled={saving}
                onChange={setExecutionPayload}
              />
            ) : null}
            {showCalendarFields &&
            (uiExecutionKind === "local_dominator_export" || executionKind === "local_dominator_export") ? (
              <LocalDominatorExportExecutionFields
                layout="stack"
                executionPayload={executionPayload}
                disabled={saving}
                onChange={setExecutionPayload}
              />
            ) : null}
          </>
        ) : null}
      </TaskFormPanel>

      {agentMode ? (
        <TaskFormPanel title="Agent">
          <TaskFormInfield label="Assignee">
            <span className="text-base text-primary">NEO Pulse</span>
          </TaskFormInfield>
          <TaskFormInfield label="Client">
            <span className="text-base text-foreground">{clientLabel}</span>
          </TaskFormInfield>
          <TaskFormInfieldSelect
            label="Execution"
            value={uiExecutionKind}
            onChange={(v) => {
              const kind = v as TaskExecutionKind;
              setExecutionKind(kind);
              if (kind === "post_creator") {
                setScheduleMode("calendar");
                setRecurrenceRule((prev) => (prev === "none" ? "monthly" : prev));
                setExecutionPayload(ensurePostCreatorPayload(executionPayload));
              } else if (kind === "gsc_reporting" || kind === "ads_reporting") {
                setScheduleMode("calendar");
                setRecurrenceRule((prev) => (prev === "none" ? "monthly" : prev));
                setExecutionPayload({
                  comparePreset: executionPayload.comparePreset ?? "mom",
                  saveToDisk: executionPayload.saveToDisk !== false,
                });
              } else {
                setScheduleMode("trigger");
                setRecurrenceRule("none");
              }
            }}
            disabled={saving}
            options={TASK_EXECUTION_KIND_OPTIONS}
          />
        </TaskFormPanel>
      ) : (
        <TaskFormPanel title="People">
          <TaskAssigneePicker members={members} assigneeIds={assigneeIds} onChange={setAssigneeIds} humansOnly />
          {tags.length > 0 ? <TaskTagPicker tags={tags} selectedTagIds={tagIds} onChange={setTagIds} /> : null}
        </TaskFormPanel>
      )}
      <p className="h-6 text-base text-ui-danger">{error}</p>
    </DialogShell>
  );
}