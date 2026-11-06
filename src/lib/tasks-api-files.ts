import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { api } from "@/lib/tasks-api-core";
import { createTaskProject } from "@/lib/tasks-api-projects";
import type {
  TaskFile,
  TaskProject,
  TaskTemplate,
} from "@/lib/tasks-types";

export async function uploadTaskFile(
  teamId: number,
  taskId: number,
  file: File,
): Promise<{ ok: boolean; file?: TaskFile; error?: string }> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const dataBase64 = btoa(binary);
  const res = await api(`/teams/${teamId}/tasks/tasks/${taskId}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      mime: file.type || "application/octet-stream",
      dataBase64,
    }),
  });
  const data = (await res.json()) as { ok?: boolean; file?: TaskFile; error?: string };
  return { ok: Boolean(data.ok), file: data.file, error: data.error };
}

export async function uploadTaskFileContent(
  teamId: number,
  taskId: number,
  input: { fileName: string; mime: string; content: string },
): Promise<{ ok: boolean; file?: TaskFile; error?: string }> {
  const bytes = new TextEncoder().encode(input.content);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const res = await api(`/teams/${teamId}/tasks/tasks/${taskId}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: input.fileName,
      mime: input.mime || "application/octet-stream",
      dataBase64: btoa(binary),
      source: "execution_archive",
    }),
  });
  const data = (await res.json()) as { ok?: boolean; file?: TaskFile; error?: string };
  return { ok: Boolean(data.ok), file: data.file, error: data.error };
}

export function taskFileDownloadUrl(teamId: number, taskId: number, assetId: number, inline = false): string {
  const base = backendApiUrl(`/teams/${teamId}/tasks/tasks/${taskId}/files/${assetId}`);
  return inline ? `${base}?inline=1` : base;
}

export async function fetchTaskFileText(
  teamId: number,
  taskId: number,
  assetId: number,
): Promise<{ ok: boolean; text?: string; error?: string }> {
  try {
    const res = await api(`/teams/${teamId}/tasks/tasks/${taskId}/files/${assetId}?inline=1`);
    if (!res.ok) {
      return { ok: false, error: "Could not load archive file." };
    }
    return { ok: true, text: await res.text() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Request failed" };
  }
}

export async function deleteTaskFile(
  teamId: number,
  taskId: number,
  assetId: number,
): Promise<{ ok: boolean; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/tasks/${taskId}/files/${assetId}`, {
    method: "DELETE",
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  return { ok: Boolean(data.ok), error: data.error };
}

export async function fetchProjectFiles(teamId: number, projectId: number): Promise<TaskFile[]> {
  const res = await api(`/teams/${teamId}/tasks/projects/${projectId}/files`);
  const data = (await res.json()) as { ok?: boolean; files?: TaskFile[] };
  return data.files ?? [];
}

export async function fetchTaskTemplates(teamId: number): Promise<TaskTemplate[]> {
  const res = await api(`/teams/${teamId}/tasks/templates`);
  const data = (await res.json()) as { ok?: boolean; templates?: TaskTemplate[] };
  return data.templates ?? [];
}

export async function saveTaskTemplate(
  teamId: number,
  template: TaskTemplate,
): Promise<{ ok: boolean; template?: TaskTemplate; templates?: TaskTemplate[]; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/templates/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    template?: TaskTemplate;
    templates?: TaskTemplate[];
    error?: string;
  };
  return { ok: Boolean(data.ok), template: data.template, templates: data.templates, error: data.error };
}

export async function deleteTaskTemplate(
  teamId: number,
  keyword: string,
): Promise<{ ok: boolean; templates?: TaskTemplate[]; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/templates/${encodeURIComponent(keyword)}`, {
    method: "DELETE",
  });
  const data = (await res.json()) as { ok?: boolean; templates?: TaskTemplate[]; error?: string };
  return { ok: Boolean(data.ok), templates: data.templates, error: data.error };
}

export async function saveTemplateFromProject(
  teamId: number,
  payload: { projectId: number; name: string; keyword?: string },
): Promise<{ ok: boolean; template?: TaskTemplate; templates?: TaskTemplate[]; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/templates/from-project`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    template?: TaskTemplate;
    templates?: TaskTemplate[];
    error?: string;
  };
  return { ok: Boolean(data.ok), template: data.template, templates: data.templates, error: data.error };
}

export async function createTaskProjectFromTemplate(
  teamId: number,
  payload: Parameters<typeof createTaskProject>[1],
): Promise<{ ok: boolean; project?: TaskProject; error?: string }> {
  return createTaskProject(teamId, payload);
}
