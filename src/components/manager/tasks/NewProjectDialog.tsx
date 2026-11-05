import React, { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { ActionButton, Button, DialogShell, Field } from "@/ui";
import {
  TaskFormFlatGrid,
  TaskFormFlatSelectPlaceholder,
  TaskFormDatePicker,
  TaskFormTimePicker,
  TaskFormPlaceholderCell,
  TaskFormSideSection,
} from "@/components/manager/tasks/TaskFormLayout";
import { TaskAssigneeMultiSelect } from "@/components/manager/tasks/TaskAssigneeMultiSelect";
import { TaskTagMultiSelect } from "@/components/manager/tasks/TaskTagMultiSelect";
import { saveTemplateFromProject } from "@/lib/tasks-api";
import type {
  DefaultTaskCreatePayload,
  TaskProject,
  TaskRecurrenceRule,
  TaskTag,
  TaskTemplate,
  TaskStatus,
  TeamTask,
} from "@/lib/tasks-types";
import {
  TASK_RECURRENCE_LABELS,
  TASK_RECURRENCE_RULES,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
} from "@/lib/tasks-types";
import { filterRegularProjectTemplates } from "@/lib/task-automation-templates";
import type { TeamMember } from "@/lib/teams-types";

const SAVE_STATES = ["Save", "Saving", "Create", "Creating"] as const;
export type WordPressSiteOption = { id: string; name: string };

type ProjectTaskDraft = {
  title: string;
  status: TaskStatus;
  dueDate: string;
  dueTime: string;
  recurrenceRule: TaskRecurrenceRule;
  assigneeIds: number[];
  tagIds: string[];
};

function emptyProjectTaskDraft(): ProjectTaskDraft {
  return {
    title: "",
    status: "todo",
    dueDate: "",
    dueTime: "",
    recurrenceRule: "none",
    assigneeIds: [],
    tagIds: [],
  };
}

function draftToPayload(draft: ProjectTaskDraft, index: number): DefaultTaskCreatePayload {
  const trimmedTitle = draft.title.trim();
  return {
    keyword: trimmedTitle.toLowerCase().replace(/\s+/g, "-") || `task-${index + 1}`,
    title: trimmedTitle,
    status: draft.status,
    dueDate: draft.dueDate.trim(),
    dueTime: draft.dueTime.trim().includes(":")
      ? draft.dueTime.trim().slice(0, 5)
      : draft.dueTime.trim(),
    scheduleMode: "calendar",
    recurrenceRule: draft.recurrenceRule,
    assigneeIds: draft.assigneeIds.length > 0 ? draft.assigneeIds : undefined,
    tagIds: draft.tagIds.length > 0 ? draft.tagIds : undefined,
  };
}

type ProjectTaskFlatRowProps = {
  index: number;
  draft: ProjectTaskDraft;
  members: TeamMember[];
  tags: TaskTag[];
  saving: boolean;
  onChange: (patch: Partial<ProjectTaskDraft>) => void;
  onRemove: () => void;
};

function ProjectTaskFlatRow({
  index,
  draft,
  members,
  tags,
  saving,
  onChange,
  onRemove,
}: ProjectTaskFlatRowProps): React.ReactElement {
  return (
    <div className="relative flex flex-col gap-0.5 pr-9">
      <span className="absolute right-0 top-0">
        <Button
          size="icon"
          icon={X}
          aria-label={`Remove task ${index + 1}`}
          disabled={saving}
          onClick={onRemove}
        />
      </span>
      <TaskFormFlatGrid>
        <TaskFormPlaceholderCell className="col-span-2 md:col-span-2 xl:col-span-2">
          <Field value={draft.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Task title" aria-label={`Task ${index + 1} title`} disabled={saving} />
        </TaskFormPlaceholderCell>
        <TaskFormFlatSelectPlaceholder
          placeholder="Status"
          value={draft.status}
          onChange={(v) => onChange({ status: v as TaskStatus })}
          disabled={saving}
          options={TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABELS[s] }))}
        />
        <TaskFormFlatSelectPlaceholder
          placeholder="Frequency"
          value={draft.recurrenceRule === "none" ? "" : draft.recurrenceRule}
          onChange={(v) => onChange({ recurrenceRule: (v || "none") as TaskRecurrenceRule })}
          disabled={saving}
          options={TASK_RECURRENCE_RULES.map((rule) => ({
            value: rule,
            label: rule === "none" ? "Does not repeat" : TASK_RECURRENCE_LABELS[rule],
          }))}
        />
        <TaskFormDatePicker
          placeholder="Due date"
          value={draft.dueDate}
          onChange={(dueDate) => onChange({ dueDate })}
          disabled={saving}
        />
        <TaskFormTimePicker
          placeholder="Due time"
          value={draft.dueTime}
          onChange={(dueTime) => onChange({ dueTime })}
          disabled={saving}
        />
      </TaskFormFlatGrid>

      <TaskFormFlatGrid className="md:grid-cols-2 xl:grid-cols-2">
        <TaskAssigneeMultiSelect
          members={members}
          assigneeIds={draft.assigneeIds}
          onChange={(assigneeIds) => onChange({ assigneeIds })}
          disabled={saving}
          humansOnly
        />
        {tags.length > 0 ? (
          <TaskTagMultiSelect
            tags={tags}
            selectedTagIds={draft.tagIds}
            onChange={(tagIds) => onChange({ tagIds })}
            disabled={saving}
          />
        ) : null}
      </TaskFormFlatGrid>
    </div>
  );
}

export type NewProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: number | null;
  templates: TaskTemplate[];
  sites: WordPressSiteOption[];
  members: TeamMember[];
  tags?: TaskTag[];
  defaultSiteId?: string | null;
  editProject?: TaskProject | null;
  editProjectTasks?: TeamTask[];
  onTemplatesChange?: (templates: TaskTemplate[]) => void;
  onCreate: (payload: {
    keyword: string;
    title: string;
    description?: string;
    wordpressSiteId?: string | null;
    wordpressSites?: WordPressSiteOption[];
    defaultTasks?: DefaultTaskCreatePayload[];
  }) => Promise<boolean>;
  onUpdate?: (
    projectId: number,
    payload: { keyword: string; title: string; description?: string; wordpressSiteId?: string | null },
  ) => Promise<boolean>;
};

export function NewProjectDialog({
  open,
  onOpenChange,
  teamId,
  templates,
  sites,
  members,
  tags = [],
  defaultSiteId = null,
  editProject = null,
  editProjectTasks = [],
  onTemplatesChange,
  onCreate,
  onUpdate,
}: NewProjectDialogProps): React.ReactElement {
  const [keyword, setKeyword] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [templateKeyword, setTemplateKeyword] = useState("");
  const [clientId, setClientId] = useState("");
  const [projectTasks, setProjectTasks] = useState<ProjectTaskDraft[]>([]);
  const [saveFromName, setSaveFromName] = useState("");
  const [saveFromKeyword, setSaveFromKeyword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = editProject != null;
  const projectTemplates = useMemo(() => filterRegularProjectTemplates(templates), [templates]);

  const reset = useCallback(() => {
    setKeyword("");
    setTitle("");
    setDescription("");
    setTemplateKeyword("");
    setClientId(defaultSiteId ?? "");
    setProjectTasks([]);
    setSaveFromName("");
    setSaveFromKeyword("");
    setError(null);
  }, [defaultSiteId]);

  useEffect(() => {
    if (!open) return;
    if (editProject) {
      setKeyword(editProject.keyword);
      setTitle(editProject.title);
      setDescription(editProject.description ?? "");
      setTemplateKeyword("");
      setClientId(editProject.wordpressSiteId ?? "");
      setSaveFromName(editProject.title);
      setSaveFromKeyword("");
      setError(null);
    } else {
      reset();
    }
  }, [defaultSiteId, editProject, open, reset]);

  const updateTaskDraft = useCallback((index: number, patch: Partial<ProjectTaskDraft>) => {
    setProjectTasks((prev) => prev.map((task, i) => (i === index ? { ...task, ...patch } : task)));
  }, []);

  const handleTemplatePick = useCallback(
    (kw: string) => {
      setTemplateKeyword(kw);
      const tpl = templates.find((t) => t.keyword === kw);
      if (!tpl) {
        setProjectTasks([]);
        return;
      }
      setKeyword(tpl.keyword);
      setTitle(tpl.name);
      setProjectTasks(
        tpl.defaultTasks.map((t) => ({
          ...emptyProjectTaskDraft(),
          title: t.title,
          status: t.status ?? "todo",
          dueDate: t.dueDate ?? "",
          dueTime: t.dueTime ?? "",
          recurrenceRule: t.recurrenceRule ?? "none",
          assigneeIds: t.assigneeIds ?? [],
          tagIds: t.tagIds ?? [],
        })),
      );
    },
    [templates],
  );

  const handleSaveFromProject = useCallback(async () => {
    if (!teamId || !editProject) return;
    const trimmedName = saveFromName.trim();
    if (!trimmedName) {
      setError("Template name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await saveTemplateFromProject(teamId, {
      projectId: editProject.id,
      name: trimmedName,
      keyword: saveFromKeyword.trim() || undefined,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save template from project.");
      return;
    }
    if (result.templates) onTemplatesChange?.(result.templates);
    setSaveFromKeyword("");
  }, [editProject, onTemplatesChange, saveFromKeyword, saveFromName, teamId]);

  const handleSubmit = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      keyword: keyword.trim() || trimmedTitle.toLowerCase().replace(/\s+/g, "-"),
      title: trimmedTitle,
      description: description.trim() || undefined,
      wordpressSiteId: clientId.trim() || null,
    };
    let ok = false;
    if (isEdit && editProject && onUpdate) {
      ok = await onUpdate(editProject.id, payload);
      if (!ok) setError("Could not update project.");
    } else {
      const defaultTasks = projectTasks
        .filter((draft) => draft.title.trim() !== "")
        .map((draft, i) => draftToPayload(draft, i));
      ok = await onCreate({
        ...payload,
        wordpressSites: sites,
        defaultTasks,
      });
      if (!ok) setError("Could not create project.");
    }
    setSaving(false);
    if (!ok) return;
    reset();
    onOpenChange(false);
  }, [
    clientId,
    description,
    editProject,
    isEdit,
    keyword,
    onCreate,
    onOpenChange,
    onUpdate,
    projectTasks,
    reset,
    sites,
    title,
  ]);

  const topLevelTasks = editProjectTasks;

  return (
    <DialogShell
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      size="xl"
      title={isEdit ? "Edit project" : "New project"}
      actions={
        <>
          {!isEdit ? (
            <span className="mr-auto">
              <Button
                variant="tool"
                disabled={saving}
                onClick={() => setProjectTasks((prev) => [...prev, emptyProjectTaskDraft()])}
              >
                Add task
              </Button>
            </span>
          ) : null}
          <Button variant="tool" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <ActionButton
            states={SAVE_STATES}
            state={saving ? (isEdit ? "Saving" : "Creating") : isEdit ? "Save" : "Create"}
            disabled={saving}
            onClick={() => void handleSubmit()}
          />
        </>
      }
    >
      <TaskFormSideSection title="Project">
        <TaskFormFlatGrid
          className={
            !isEdit
              ? sites.length > 0
                ? "grid-cols-5"
                : "grid-cols-4"
              : sites.length > 0
                ? "grid-cols-4"
                : "grid-cols-3"
          }
        >
          {!isEdit ? (
            <TaskFormFlatSelectPlaceholder
              placeholder="Template"
              value={templateKeyword}
              onChange={handleTemplatePick}
              disabled={saving}
              options={[
                { value: "", label: "Blank project" },
                ...projectTemplates.map((tpl) => ({ value: tpl.keyword, label: tpl.name })),
              ]}
            />
          ) : null}
          {sites.length > 0 ? (
            <TaskFormFlatSelectPlaceholder
              placeholder="Client"
              value={clientId}
              onChange={setClientId}
              disabled={saving}
              options={[
                { value: "", label: "No client" },
                ...sites.map((site) => ({ value: site.id, label: site.name })),
              ]}
            />
          ) : null}
          <TaskFormPlaceholderCell>
            <Field value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Keyword" aria-label="Project keyword" disabled={saving} />
          </TaskFormPlaceholderCell>
          <TaskFormPlaceholderCell>
            <Field value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Project title" disabled={saving} />
          </TaskFormPlaceholderCell>
          <TaskFormPlaceholderCell>
            <Field value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" aria-label="Project description" disabled={saving} />
          </TaskFormPlaceholderCell>
        </TaskFormFlatGrid>
      </TaskFormSideSection>

      <TaskFormSideSection title="Tasks">
        <div className="max-h-[40vh] min-h-0 overflow-y-auto">
          {isEdit ? (
            topLevelTasks.length === 0 ? (
              <p className="py-1 text-base text-muted-foreground">No tasks in this project yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {topLevelTasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-center justify-between gap-3 bg-ui-field px-2 py-1.5"
                  >
                    <span className="min-w-0 flex-1 text-base text-foreground">{task.title}</span>
                    <span className="shrink-0 text-base text-muted-foreground">
                      {TASK_STATUS_LABELS[task.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : projectTasks.length === 0 ? (
            <p className="py-1 text-base text-muted-foreground">Add tasks to create with this project.</p>
          ) : (
            <div>
              {projectTasks.map((draft, i) => (
                <ProjectTaskFlatRow
                  key={`task-${i}`}
                  index={i}
                  draft={draft}
                  members={members}
                  tags={tags}
                  saving={saving}
                  onChange={(patch) => updateTaskDraft(i, patch)}
                  onRemove={() => setProjectTasks((prev) => prev.filter((_, j) => j !== i))}
                />
              ))}
            </div>
          )}
        </div>
      </TaskFormSideSection>

      {isEdit ? (
        <TaskFormSideSection title="Template">
          <TaskFormFlatGrid className="grid-cols-3">
            <TaskFormPlaceholderCell>
              <Field value={saveFromName} onChange={(e) => setSaveFromName(e.target.value)} placeholder="Name" aria-label="Template name" disabled={saving} />
            </TaskFormPlaceholderCell>
            <TaskFormPlaceholderCell>
              <Field value={saveFromKeyword} onChange={(e) => setSaveFromKeyword(e.target.value)} placeholder="Keyword" aria-label="Template keyword" disabled={saving} />
            </TaskFormPlaceholderCell>
            <TaskFormPlaceholderCell className="flex items-center">
              <Button variant="tool" disabled={saving} onClick={() => void handleSaveFromProject()}>
                Save as template
              </Button>
            </TaskFormPlaceholderCell>
          </TaskFormFlatGrid>
        </TaskFormSideSection>
      ) : null}
      <p className="h-6 text-base text-ui-danger">{error}</p>
    </DialogShell>
  );
}