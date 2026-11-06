import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import type { PromptTrace } from "@/lib/openrouter-prompt-trace";

/**
 * Persist one bulk run prompt trace on the hub (neo_pulse_prompt_traces).
 * Throws on failure so the caller can surface a visible run warning.
 */
export async function savePromptTraceToHub(args: {
  siteUrl: string;
  runLabel: string;
  trace: PromptTrace;
}): Promise<{ id: number; callCount: number }> {
  const res = await fetch(backendApiUrl("/prompt-traces"), {
    method: "POST",
    credentials: "include",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      siteUrl: args.siteUrl,
      runLabel: args.runLabel,
      trace: args.trace,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    id?: number;
    callCount?: number;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Prompt trace save failed (HTTP ${res.status})`);
  }
  return { id: data.id ?? 0, callCount: data.callCount ?? args.trace.calls.length };
}
