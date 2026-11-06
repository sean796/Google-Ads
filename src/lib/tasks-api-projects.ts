import type { TeamContextPulseTask } from "@/lib/pulse-assist/types";
import { api, readJson } from "@/lib/tasks-api-core";
import type {
  TaskNote,
  TaskFile,
  TaskProject,
  TaskSection,
  TaskTag,
  TeamTask,
  TaskStatus,
  TaskRecurrenceRule,
  TaskExecutionKind,
  TaskExecutionPayload,
  TaskScheduleMode,
  TaskTriggerConfig,
  DefaultTaskCreatePayload,
} from "@/lib/tasks-types";

export async function fetchTaskProjects(
  teamId: number,
  includeArchived = false,
): Promise<TaskProject[]> {
  const q = includeArchived ? "?archived=1" : "";
  const res = await api(`/teams/${teamId}/tasks/projects${q}`);
  const data = (await res.json()) as { ok?: boolean; projects?: TaskProject[] };
  return data.projects ?? [];
}

export async function createTaskProject(
  teamId: number,
  payload: {
    keyword?: string;
    title: string;
    description?: string;
    wordpressSiteId?: string | null;
    templateKeyword?: string;
    taskClients?: Array<{ taskKeyword?: string; keyword?: string; clientSiteId?: string }>;
    wordpressSites?: Array<{ id: string; name: string }>;
    defaultTasks?: DefaultTaskCreatePayload[];
    isAutomation?: boolean;
    sourceTemplateKeyword?: string;
    automationVisibility?: "public" | "private";
  },
): Promise<{ ok: boolean; project?: TaskProject; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { ok?: boolean; project?: TaskProject; error?: string };
  return { ok: Boolean(data.ok), project: data.project, error: data.error };
}

export async function updateTaskProject(
  teamId: number,
  projectId: number,
  payload: { keyword?: string; title?: string; description?: string; wordpressSiteId?: string | null; automationVisibility?: "public" | "private" },
): Promise<{ ok: boolean; project?: TaskProject; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { ok?: boolean; project?: TaskProject; error?: string };
  return { ok: Boolean(data.ok), project: data.project, error: data.error };
}

export async function deleteTaskProject(
  teamId: number,
  projectId: number,
): Promise<{ ok: boolean; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/projects/${projectId}`, { method: "DELETE" });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  return { ok: Boolean(data.ok), error: data.error };
}

export async function fetchProjectSections(teamId: number, projectId: number): Promise<TaskSection[]> {
  const res = await api(`/teams/${teamId}/tasks/projects/${projectId}/sections`);
  const data = (await res.json()) as { ok?: boolean; sections?: TaskSection[] };
  return data.sections ?? [];
}

export async function createProjectSection(
  teamId: number,
  projectId: number,
  payload: { keyword?: string; title: string; sortOrder?: number },
): Promise<{ ok: boolean; section?: TaskSection; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/projects/${projectId}/sections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { ok?: boolean; section?: TaskSection; error?: string };
  return { ok: Boolean(data.ok), section: data.section, error: data.error };
}

export async function updateProjectSection(
  teamId: number,
  projectId: number,
  sectionId: number,
  payload: { keyword?: string; title?: string; sortOrder?: number },
): Promise<{ ok: boolean; section?: TaskSection; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/projects/${projectId}/sections/${sectionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { ok?: boolean; section?: TaskSection; error?: string };
  return { ok: Boolean(data.ok), section: data.section, error: data.error };
}

export async function deleteProjectSection(
  teamId: number,
  projectId: number,
  sectionId: number,
): Promise<{ ok: boolean; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/projects/${projectId}/sections/${sectionId}`, {
    method: "DELETE",
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  return { ok: Boolean(data.ok), error: data.error };
}

export async function fetchProjectTasks(teamId: number, projectId: number): Promise<TeamTask[]> {
  const res = await api(`/teams/${teamId}/tasks/projects/${projectId}/tasks`);
  const data = (await res.json()) as { ok?: boolean; tasks?: TeamTask[] };
  return data.tasks ?? [];
}

export async function fetchMyTasks(
  teamId: number,
): Promise<{ tasks: TeamTask[]; completedToday: number }> {
  const res = await api(`/teams/${teamId}/tasks/my`);
  const data = (await res.json()) as { ok?: boolean; tasks?: TeamTask[]; completedToday?: number };
  return { tasks: data.tasks ?? [], completedToday: data.completedToday ?? 0 };
}

export async function fetchPulseAssignedTasks(teamId: number): Promise<TeamContextPulseTask[]> {
  const res = await api(`/teams/${teamId}/tasks/pulse-assigned`);
  const data = await readJson<{ ok?: boolean; tasks?: TeamContextPulseTask[] }>(res);
  return data.tasks ?? [];
}

export async function fetchCalendarAutomationTasks(teamId: number): Promise<TeamContextPulseTask[]> {
  const res = await api(`/teams/${teamId}/tasks/calendar-automations`);
  const data = await readJson<{ ok?: boolean; tasks?: TeamContextPulseTask[] }>(res);
  return data.tasks ?? [];
}

export async function searchTasks(teamId: number, query: string): Promise<TeamTask[]> {
  const params = new URLSearchParams({ q: query });
  const res = await api(`/teams/${teamId}/tasks/search?${params.toString()}`);
  const data = (await res.json()) as { ok?: boolean; tasks?: TeamTask[] };
  return data.tasks ?? [];
}

export async function fetchTaskTags(teamId: number): Promise<TaskTag[]> {
  const res = await api(`/teams/${teamId}/tasks/tags`);
  const data = (await res.json()) as { ok?: boolean; tags?: TaskTag[] };
  return data.tags ?? [];
}

export async function createProjectTask(
  teamId: number,
  projectId: number,
  payload: {
    keyword?: string;
    title: string;
    description?: string;
    status?: TaskStatus;
    assigneeIds?: number[];
    dueDate?: string;
    dueTime?: string;
    sectionId?: number;
    tagIds?: string[];
    parentTaskId?: number;
    wordpressSiteId?: string | null;
    recurrenceRule?: TaskRecurrenceRule;
    scheduleMode?: TaskScheduleMode;
    triggerConfig?: TaskTriggerConfig;
    executionKind?: TaskExecutionKind;
    executionPayload?: TaskExecutionPayload;
  },
): Promise<{ ok: boolean; task?: TeamTask; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/projects/${projectId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { ok?: boolean; task?: TeamTask; error?: string };
  return { ok: Boolean(data.ok), task: data.task, error: data.error };
}

export async function fetchTaskDetail(
  teamId: number,
  taskId: number,
): Promise<{ task: TeamTask | null; notes: TaskNote[]; files: TaskFile[]; subtasks: TeamTask[] }> {
  const res = await api(`/teams/${teamId}/tasks/tasks/${taskId}`);
  const data = (await res.json()) as {
    ok?: boolean;
    task?: TeamTask;
    notes?: TaskNote[];
    files?: TaskFile[];
    subtasks?: TeamTask[];
  };
  return {
    task: data.task ?? null,
    notes: data.notes ?? [],
    files: data.files ?? [],
    subtasks: data.subtasks ?? [],
  };
}

export async function updateTask(
  teamId: number,
  taskId: number,
  payload: {
    keyword?: string;
    title?: string;
    description?: string;
    status?: TaskStatus;
    assigneeIds?: number[];
    dueDate?: string;
    dueTime?: string;
    sectionId?: number;
    sortOrder?: number;
    tagIds?: string[];
    wordpressSiteId?: string | null;
    recurrenceRule?: TaskRecurrenceRule;
    scheduleMode?: TaskScheduleMode;
    triggerConfig?: TaskTriggerConfig;
    executionKind?: TaskExecutionKind;
    executionPayload?: TaskExecutionPayload;
  },
): Promise<{ ok: boolean; task?: TeamTask; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { ok?: boolean; task?: TeamTask; error?: string };
  return { ok: Boolean(data.ok), task: data.task, error: data.error };
}

export async function deleteTask(teamId: number, taskId: number): Promise<{ ok: boolean; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/tasks/${taskId}`, { method: "DELETE" });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  return { ok: Boolean(data.ok), error: data.error };
}

export async function addTaskNote(
  teamId: number,
  taskId: number,
  body: string,
  mentionUserIds: number[] = [],
  keyword = "note",
): Promise<{ ok: boolean; note?: TaskNote; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/tasks/${taskId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, keyword, mentionUserIds }),
  });
  const data = (await res.json()) as { ok?: boolean; note?: TaskNote; error?: string };
  return { ok: Boolean(data.ok), note: data.note, error: data.error };
}

export async function createSubtask(
  teamId: number,
  taskId: number,
  payload: { keyword?: string; title: string; status?: TaskStatus },
): Promise<{ ok: boolean; task?: TeamTask; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/tasks/${taskId}/subtasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { ok?: boolean; task?: TeamTask; error?: string };
  return { ok: Boolean(data.ok), task: data.task, error: data.error };
}
