import type { OpenRouterAppMessage } from "@/lib/openrouter-app-api";

export const PROMPT_LOG_FILE_TYPE = "prompt_log";

export type PromptTraceCall = {
  model: string;
  /** Model the provider actually served, read from the response payload. */
  servedModel: string | null;
  system: string;
  user: string;
  schemaName: string | null;
  durationMs: number;
  finishReason: string;
  response: string;
};

export type PromptTrace = {
  /** What the trace covers, e.g. "Bulk run, 3 rows". */
  label: string;
  startedAt: string;
  calls: PromptTraceCall[];
};

let active: PromptTrace | null = null;

export function beginPromptTrace(label: string): void {
  active = { label, startedAt: new Date().toISOString(), calls: [] };
}

export function endPromptTrace(): PromptTrace | null {
  const trace = active;
  active = null;
  return trace;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : ""))
      .join("\n");
  }
  return "";
}

/** Split request messages into system text and user/assistant transcript. */
export function promptTraceInputs(args: {
  messages?: OpenRouterAppMessage[];
  system?: string;
  user?: string;
}): { system: string; user: string } {
  if (args.messages?.length) {
    const system = args.messages.filter((m) => m.role === "system").map((m) => textOf(m.content)).join("\n\n");
    const user = args.messages
      .filter((m) => m.role !== "system")
      .map((m) => (m.role === "user" ? textOf(m.content) : `[${m.role}]\n${textOf(m.content)}`))
      .join("\n\n");
    return { system, user };
  }
  return { system: args.system ?? "", user: args.user ?? "" };
}

export function recordPromptTraceCall(call: PromptTraceCall): void {
  if (!active) return;
  active.calls.push(call);
}

export function buildPromptTraceMarkdown(
  trace: PromptTrace,
  meta: { title: string; path: string },
): string {
  const byModel = new Map<string, PromptTraceCall[]>();
  for (const call of trace.calls) {
    const list = byModel.get(call.model) ?? [];
    list.push(call);
    byModel.set(call.model, list);
  }
  const out: string[] = [
    `# Prompt log: ${meta.title}`,
    `${trace.label} · ${meta.path} · ${trace.calls.length} calls · ${trace.startedAt}`,
    "",
  ];
  for (const [model, calls] of byModel) {
    out.push(`## Model: ${model} (${calls.length} calls)`, "");
    calls.forEach((call, i) => {
      const schema = call.schemaName ? ` · schema: ${call.schemaName}` : "";
      const served = call.servedModel && call.servedModel !== model ? ` · served: ${call.servedModel}` : "";
      out.push(
        `### Call ${i + 1}${schema}${served} · ${(call.durationMs / 1000).toFixed(1)}s · finish: ${call.finishReason}`,
        "**System**",
        call.system,
        "**User**",
        call.user,
        "**Response**",
        call.response,
        "",
      );
    });
  }
  return out.join("\n");
}
