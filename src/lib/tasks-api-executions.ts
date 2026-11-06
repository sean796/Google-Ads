import { api, readJson } from "@/lib/tasks-api-core";
import type {
  TaskExecution,
  TaskExecutionKind,
  TaskExecutionPayload,
} from "@/lib/tasks-types";
import type { TaskTriggerEvaluateResult, TaskTriggerPendingDispatch } from "@/lib/task-trigger-types";

export async function startTaskExecution(
  teamId: number,
  taskId: number,
  payload?: {
    executionKind?: TaskExecutionKind;
    executionPayload?: TaskExecutionPayload;
    wordpressSiteId?: string;
  },
): Promise<{ ok: boolean; execution?: TaskExecution; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/tasks/${taskId}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  const data = (await res.json()) as { ok?: boolean; execution?: TaskExecution; error?: string };
  return { ok: Boolean(data.ok), execution: data.execution, error: data.error };
}

export async function fetchTaskExecution(
  teamId: number,
  executionId: number,
): Promise<{ ok: boolean; execution?: TaskExecution; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/executions/${executionId}`);
  const data = (await res.json()) as { ok?: boolean; execution?: TaskExecution; error?: string };
  return { ok: Boolean(data.ok), execution: data.execution, error: data.error };
}

export async function listTaskExecutions(
  teamId: number,
  taskId: number,
): Promise<{ ok: boolean; executions?: TaskExecution[]; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/tasks/${taskId}/executions`);
  const data = (await res.json()) as { ok?: boolean; executions?: TaskExecution[]; error?: string };
  return { ok: Boolean(data.ok), executions: data.executions, error: data.error };
}

export async function patchTaskExecutionProgress(
  teamId: number,
  executionId: number,
  patch: {
    stepId?: string;
    subProgress?: number;
    progress?: number;
    message?: string;
    error?: string;
  },
): Promise<{ ok: boolean; execution?: TaskExecution; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/executions/${executionId}/progress`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = (await res.json()) as { ok?: boolean; execution?: TaskExecution; error?: string };
  return { ok: Boolean(data.ok), execution: data.execution, error: data.error };
}

export type TaskExecutionCompletePayload = {
  ok: boolean;
  result?: unknown;
  error?: string;
  agentRunId?: number;
  archiveFiles?: Array<{ fileName: string; mime: string; dataBase64: string }>;
};

export async function completeTaskExecution(
  teamId: number,
  executionId: number,
  payload: TaskExecutionCompletePayload,
): Promise<{ ok: boolean; execution?: TaskExecution; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/executions/${executionId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { ok?: boolean; execution?: TaskExecution; error?: string };
  return { ok: Boolean(data.ok), execution: data.execution, error: data.error };
}

export async function cancelTaskExecution(
  teamId: number,
  executionId: number,
): Promise<{ ok: boolean; execution?: TaskExecution; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/executions/${executionId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = (await res.json()) as { ok?: boolean; execution?: TaskExecution; error?: string };
  return { ok: Boolean(data.ok), execution: data.execution, error: data.error };
}

export async function reopenTaskExecutionForResume(
  teamId: number,
  executionId: number,
): Promise<{ ok: boolean; execution?: TaskExecution; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/executions/${executionId}/reopen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = (await res.json()) as { ok?: boolean; execution?: TaskExecution; error?: string };
  return { ok: Boolean(data.ok), execution: data.execution, error: data.error };
}

export async function evaluateTaskTrigger(
  teamId: number,
  taskId: number,
  options?: { simulate?: boolean },
): Promise<TaskTriggerEvaluateResult> {
  const res = await api(`/teams/${teamId}/tasks/tasks/${taskId}/trigger/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ simulate: Boolean(options?.simulate) }),
  });
  return (await res.json()) as TaskTriggerEvaluateResult;
}

export async function testFireTaskTrigger(
  teamId: number,
  taskId: number,
): Promise<TaskTriggerEvaluateResult & { queued?: boolean }> {
  const res = await api(`/teams/${teamId}/tasks/tasks/${taskId}/trigger/test-fire`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return (await res.json()) as TaskTriggerEvaluateResult & { queued?: boolean };
}

/** Manual run for a saved automation task; queues Pulse even when trigger conditions are not met. */
export async function executeAutomationTaskTrigger(
  teamId: number,
  taskId: number,
): Promise<TaskTriggerEvaluateResult & { queued?: boolean }> {
  return testFireTaskTrigger(teamId, taskId);
}

export async function fetchPendingTaskTriggers(
  teamId: number,
): Promise<{ ok: boolean; pending?: TaskTriggerPendingDispatch[]; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/trigger-pending`);
  const data = await readJson<{
    ok?: boolean;
    pending?: TaskTriggerPendingDispatch[];
    error?: string;
  }>(res);
  return { ok: Boolean(data.ok), pending: data.pending ?? [], error: data.error };
}

export async function ackPendingTaskTrigger(
  teamId: number,
  taskId: number,
): Promise<{ ok: boolean; error?: string }> {
  const res = await api(`/teams/${teamId}/tasks/trigger-pending/${taskId}/ack`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  return { ok: Boolean(data.ok), error: data.error };
}
