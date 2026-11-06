import {
  ACK_TO_CARD_MIN_MS,
  INITIAL_WORKFLOW,
  applyStreamEvent,
  sleep,
  type StreamHandlers,
} from "./stream-workflow-state";
import type { AssistStreamEvent } from "./types";
export {
  ACK_TO_CARD_INSTANT_MS,
  ACK_TO_CARD_MIN_MS,
  AGENTS_PHASE_MIN_MS,
  INITIAL_WORKFLOW,
  LEAD_PHASE_MIN_MS,
  WORKFLOW_DONE_BEAT_MS,
  applyStreamEvent,
  isAgentWorkflowEvent,
  type StreamHandlers,
  type WorkflowState,
} from "./stream-workflow-state";
export { WorkflowPacer } from "./stream-workflow-pacer";
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
