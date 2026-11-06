import type { AgentRun, AgentRunStep } from "@/lib/agent-runs-types";

export type AgentRunListPatch = Partial<AgentRun> | ((run: AgentRun) => Partial<AgentRun>);

type PatchRunInListFn = (runId: number, patch: AgentRunListPatch) => void;

let patchRunInListImpl: PatchRunInListFn | null = null;

export function registerAgentRunListPatcher(fn: PatchRunInListFn | null): void {
  patchRunInListImpl = fn;
}

export function patchAgentRunInList(runId: number, patch: AgentRunListPatch): void {
  patchRunInListImpl?.(runId, patch);
}

export function appendAgentRunStepLocally(
  runId: number,
  label: string,
  status: AgentRunStep["status"] = "running",
  payload?: Record<string, unknown>,
  createdAt?: string,
  stepKey?: string,
): void {
  const trimmed = label.trim();
  if (!trimmed) return;
  const at = createdAt ?? new Date().toISOString();
  patchAgentRunInList(runId, (run) => {
    const steps = run.steps ?? [];
    if (stepKey) {
      const idx = steps.findIndex((s) => s.stepKey === stepKey);
      if (idx >= 0) {
        const next = [...steps];
        next[idx] = {
          ...steps[idx]!,
          label: trimmed,
          status,
          payload: payload ?? steps[idx]!.payload,
          updatedAt: at,
        };
        return { steps: next };
      }
    } else {
      const last = steps[steps.length - 1];
      if (last?.label === trimmed && last.status === status && !payload) {
        return {};
      }
    }

    const nextSteps = steps;
    const nextStep: AgentRunStep = {
      id: Date.now(),
      stepIndex: nextSteps.length,
      stepKey,
      label: trimmed,
      status,
      payload,
      createdAt: at,
      updatedAt: at,
    };
    return { steps: [...nextSteps, nextStep] };
  });
}
