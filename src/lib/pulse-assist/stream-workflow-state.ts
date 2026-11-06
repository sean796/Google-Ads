import type { AssistCardStep, AssistStreamEvent } from "./types";

export const ACK_TO_CARD_MIN_MS = 400;
export const ACK_TO_CARD_INSTANT_MS = 100;
export const AGENTS_PHASE_MIN_MS = 2000;
export const LEAD_PHASE_MIN_MS = 1600;
export const WORKFLOW_DONE_BEAT_MS = 350;

export type StreamHandlers = {
  onEvent?: (evt: AssistStreamEvent) => void;
  onDone?: (card: AssistStreamEvent & { status: "done" }) => void;
  onError?: (message: string) => void;
};

export type WorkflowState = {
  title: string;
  steps: AssistCardStep[];
};

export const INITIAL_WORKFLOW: WorkflowState = {
  title: "Working on it…",
  steps: [{ label: "Starting…", status: "running", step_kind: "phase" }],
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function applyStreamEvent(state: WorkflowState, evt: AssistStreamEvent): WorkflowState {
  if (evt.status === "phase" && evt.label) {
    const hasAgents = state.steps.some((s) => s.step_kind === "agent" || s.step_kind === "lead");
    if (hasAgents) {
      return state;
    }
    const phase = evt.phase || "modules";
    const stepId = `phase-${phase}`;
    const existing = state.steps.find((s) => s.id === stepId);
    if (existing) {
      return {
        title: state.title,
        steps: state.steps.map((s) =>
          s.id === stepId
            ? { ...s, label: evt.label!, status: "running" }
            : s.status === "running"
              ? { ...s, status: "done" }
              : s,
        ),
      };
    }
    const doneSteps = state.steps.map((s) =>
      s.step_kind === "phase" && s.status === "running" ? { ...s, status: "done" as const } : s,
    );
    return {
      title: phase === "compose" ? "Composing answer…" : state.title,
      steps: [
        ...doneSteps,
        { id: stepId, label: evt.label, status: "running", step_kind: "phase" },
      ],
    };
  }

  if (evt.status === "agent_plan" && evt.agents?.length) {
    const agentSteps: AssistCardStep[] = evt.agents.map((agent, i) => ({
      id: agent.id || `agent-${i}`,
      label: agent.role || agent.slice || "Specialist",
      status: "running",
      step_kind: "agent",
    }));
    agentSteps.push({
      id: "lead",
      label: "Lead execution",
      status: "pending",
      step_kind: "lead",
    });
    return {
      title: "Action team",
      steps: agentSteps,
    };
  }

  if (evt.status === "agent" && evt.id) {
    const steps = state.steps.map((s) => {
      if (s.id !== evt.id) {
        return s;
      }
      return {
        ...s,
        label: evt.role || s.label,
        status:
          evt.state === "error" ? ("error" as const) : evt.state === "done" ? ("done" as const) : ("running" as const),
      };
    });
    return { ...state, steps };
  }

  if (evt.status === "action_plan" && evt.tools?.length) {
    const toolSteps: AssistCardStep[] = evt.tools.map((toolCall, i) => ({
      id: `tool-${toolCall.tool || i}`,
      label: toolCall.tool ? `Tool: ${toolCall.tool}` : "Planned tool",
      status: "pending",
      step_kind: "tool",
    }));
    return {
      title: "Execution plan",
      steps: [...state.steps.filter((s) => s.step_kind !== "tool"), ...toolSteps],
    };
  }

  if (evt.status === "tool" && evt.id) {
    const steps = state.steps.map((s) => {
      if (s.id !== evt.id) return s;
      return {
        ...s,
        label: evt.tool ? `Tool: ${evt.tool}` : s.label,
        status:
          evt.state === "error" ? ("error" as const) : evt.state === "done" ? ("done" as const) : ("running" as const),
        step_kind: "tool",
      };
    });
    return { ...state, steps };
  }

  if (evt.status === "lead") {
    const steps = state.steps.map((s) =>
      s.step_kind === "lead"
        ? { ...s, status: evt.state === "running" ? "running" : evt.state === "done" ? "done" : s.status }
        : s.step_kind === "agent" && s.status === "running"
          ? { ...s, status: "done" as const }
          : s,
    );
    return { ...state, steps };
  }

  if (
    (evt.status === "searching" || evt.status === "thinking" || evt.status === "formatting") &&
    evt.label
  ) {
    return applyStreamEvent(state, {
      status: "phase",
      phase: evt.status === "formatting" ? "format" : "modules",
      label: evt.label,
    });
  }

  return state;
}

function isAgentWorkflowEvent(evt: AssistStreamEvent): boolean {
  return (
    evt.status === "agent_plan" ||
    evt.status === "action_plan" ||
    evt.status === "agent" ||
    evt.status === "tool" ||
    evt.status === "lead"
  );
}

export { isAgentWorkflowEvent };
