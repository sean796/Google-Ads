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

function sleep(ms: number): Promise<void> {
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

/** Paces research-team UI: all agents breathe together, then lead, then result. */
export class WorkflowPacer {
  private target: WorkflowState = INITIAL_WORKFLOW;

  private agentIds: string[] = [];

  private agentsFinished = new Set<string>();

  private leadFinished = false;

  private phase: "agents" | "lead" | "complete" = "agents";

  private phaseAt = Date.now();

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private onDisplay: (workflow: WorkflowState) => void) {}

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  ingest(evt: AssistStreamEvent): void {
    this.target = applyStreamEvent(this.target, evt);

    if (evt.status === "agent_plan" && evt.agents?.length) {
      this.agentIds = evt.agents.map((agent, i) => agent.id || `agent-${i}`);
      this.agentsFinished.clear();
      this.leadFinished = false;
      this.phase = "agents";
      this.phaseAt = Date.now();
      this.pushDisplay(this.agentsRunningView());
      this.scheduleTick();
      return;
    }

    if (evt.status === "agent" && evt.id && (evt.state === "done" || evt.state === "error")) {
      this.agentsFinished.add(evt.id);
    }

    if (evt.status === "lead" && evt.state === "done") {
      this.leadFinished = true;
    }

    this.scheduleTick();
  }

  async waitUntilResultReady(): Promise<void> {
    while (this.phase !== "complete") {
      this.tick();
      await sleep(40);
    }
    await sleep(WORKFLOW_DONE_BEAT_MS);
  }

  private scheduleTick(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    const wait = this.msUntilTick();
    if (wait <= 0) {
      this.tick();
      return;
    }
    this.timer = setTimeout(() => this.tick(), wait);
  }

  private msUntilTick(): number {
    const elapsed = Date.now() - this.phaseAt;
    if (this.phase === "agents") {
      const minRemaining = AGENTS_PHASE_MIN_MS - elapsed;
      if (minRemaining > 0) {
        return minRemaining;
      }
      if (!this.allAgentsFinished()) {
        return 80;
      }
      return 0;
    }
    if (this.phase === "lead") {
      const minRemaining = LEAD_PHASE_MIN_MS - elapsed;
      if (minRemaining > 0) {
        return minRemaining;
      }
      if (!this.leadFinished) {
        return 80;
      }
      return 0;
    }
    return 0;
  }

  private tick(): void {
    const elapsed = Date.now() - this.phaseAt;

    if (this.phase === "agents") {
      this.pushDisplay(this.agentsRunningView());
      if (elapsed >= AGENTS_PHASE_MIN_MS && this.allAgentsFinished()) {
        this.phase = "lead";
        this.phaseAt = Date.now();
        this.pushDisplay(this.leadRunningView());
      }
      if (this.phase === "agents") {
        this.scheduleTick();
      } else {
        this.scheduleTick();
      }
      return;
    }

    if (this.phase === "lead") {
      this.pushDisplay(this.leadRunningView());
      if (elapsed >= LEAD_PHASE_MIN_MS && this.leadFinished) {
        this.phase = "complete";
        this.pushDisplay(this.allDoneView());
        return;
      }
      this.scheduleTick();
    }
  }

  private allAgentsFinished(): boolean {
    return this.agentIds.length > 0 && this.agentIds.every((id) => this.agentsFinished.has(id));
  }

  private agentsRunningView(): WorkflowState {
    return {
      title: this.target.title,
      steps: this.target.steps.map((step) => {
        if (step.step_kind === "agent") {
          return { ...step, status: "running" as const };
        }
        if (step.step_kind === "lead") {
          return { ...step, status: "pending" as const };
        }
        return step;
      }),
    };
  }

  private leadRunningView(): WorkflowState {
    return {
      title: this.target.title,
      steps: this.target.steps.map((step) => {
        if (step.step_kind === "agent") {
          const status = step.status === "error" ? ("error" as const) : ("done" as const);
          return { ...step, status };
        }
        if (step.step_kind === "lead") {
          return { ...step, status: "running" as const };
        }
        return step;
      }),
    };
  }

  private allDoneView(): WorkflowState {
    return {
      title: this.target.title,
      steps: this.target.steps.map((step) => {
        if (step.step_kind === "agent" || step.step_kind === "lead") {
          const status = step.status === "error" ? ("error" as const) : ("done" as const);
          return { ...step, status };
        }
        return step;
      }),
    };
  }

  private pushDisplay(view: WorkflowState): void {
    this.onDisplay(view);
  }
}

export { isAgentWorkflowEvent };

export async function consumeAssistNdjsonStream(
  body: ReadableStream<Uint8Array>,
  handlers: StreamHandlers,
  ackShownAtRef: { value: number },
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let pendingChips: Extract<AssistStreamEvent, { status: "chips" }> | null = null;
  let sawDone = false;

  while (true) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const evt = JSON.parse(trimmed) as AssistStreamEvent;
        await handleStreamEvent(evt, handlers, ackShownAtRef, (c) => {
          pendingChips = c;
        });
        if (evt.status === "done") {
          sawDone = true;
          return;
        }
      } catch {
        /* skip malformed ndjson line */
      }
    }
    if (done) break;
  }

  if (buffer.trim()) {
    try {
      const evt = JSON.parse(buffer.trim()) as AssistStreamEvent;
      await handleStreamEvent(evt, handlers, ackShownAtRef, (c) => {
        pendingChips = c;
      });
      if (evt.status === "done") {
        return;
      }
    } catch {
      /* skip */
    }
  }

  if (!sawDone) {
    handlers.onError?.("Stream ended without a response card");
  }
}

async function handleStreamEvent(
  evt: AssistStreamEvent,
  handlers: StreamHandlers,
  ackShownAtRef: { value: number },
  setPendingChips: (evt: Extract<AssistStreamEvent, { status: "chips" }>) => void,
): Promise<void> {
  if (evt.status === "ack" && evt.text) {
    handlers.onEvent?.(evt);
    ackShownAtRef.value = Date.now();
    return;
  }

  if (evt.status === "chips") {
    setPendingChips(evt);
    handlers.onEvent?.(evt);
    return;
  }

  if (
    evt.status === "phase" ||
    evt.status === "agent_plan" ||
    evt.status === "action_plan" ||
    evt.status === "agent" ||
    evt.status === "tool" ||
    evt.status === "lead" ||
    evt.status === "searching" ||
    evt.status === "thinking" ||
    evt.status === "formatting"
  ) {
    handlers.onEvent?.(evt);
    return;
  }

  if (evt.status === "done" && evt.card) {
    const elapsed = Date.now() - ackShownAtRef.value;
    const minWait = ackShownAtRef.value > 0 ? ACK_TO_CARD_MIN_MS - elapsed : 0;
    if (minWait > 0) await sleep(minWait);

    handlers.onDone?.(evt as AssistStreamEvent & { status: "done" });
  }
}

export async function processNdjsonEvents(
  lines: unknown[],
  handlers: StreamHandlers,
  ackShownAtRef: { value: number },
): Promise<void> {
  let pendingChips: Extract<AssistStreamEvent, { status: "chips" }> | null = null;
  let workflow = INITIAL_WORKFLOW;

  for (const raw of lines) {
    if (!raw || typeof raw !== "object") continue;
    const evt = raw as AssistStreamEvent;

    if (evt.status === "ack" && "text" in evt && evt.text) {
      handlers.onEvent?.(evt);
      ackShownAtRef.value = Date.now();
      continue;
    }

    if (evt.status === "chips") {
      pendingChips = evt;
      handlers.onEvent?.(evt);
      continue;
    }

    if (
      evt.status === "phase" ||
      evt.status === "agent_plan" ||
      evt.status === "agent" ||
      evt.status === "lead" ||
      evt.status === "searching" ||
      evt.status === "thinking" ||
      evt.status === "formatting"
    ) {
      workflow = applyStreamEvent(workflow, evt);
      handlers.onEvent?.(evt);
      continue;
    }

    if (evt.status === "done" && evt.card) {
      const elapsed = Date.now() - ackShownAtRef.value;
      const minWait = ackShownAtRef.value > 0 ? ACK_TO_CARD_MIN_MS - elapsed : 0;
      if (minWait > 0) await sleep(minWait);

      const merged = pendingChips?.relatedTopics?.length
        ? { ...evt, relatedTopics: pendingChips.relatedTopics }
        : evt;
      handlers.onDone?.(merged as AssistStreamEvent & { status: "done" });
      return;
    }
  }

  handlers.onError?.("Stream ended without a response card");
}

/** @deprecated Legacy batch stream label mapping */
export function streamLabelToStepIndex(label: string): number {
  const l = label.toLowerCase();
  if (l.includes("search") || l.includes("fetch") || l.includes("analytics") || l.includes("querying")) return 0;
  if (l.includes("think") || l.includes("analyz")) return 1;
  if (l.includes("format")) return 2;
  return -1;
}

/** @deprecated Use dynamic workflow from stream events */
export const STREAM_STEPS = [
  { label: "Searching content…", status: "running" as const },
  { label: "Thinking…", status: "pending" as const },
  { label: "Formatting response…", status: "pending" as const },
];

export const BUILD_STEPS = [
  { label: "Build checklist", status: "pending" as const },
  { label: "Build blueprint", status: "pending" as const },
  { label: "Deliverable", status: "pending" as const },
];
