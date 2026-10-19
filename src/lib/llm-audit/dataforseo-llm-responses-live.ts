import type { LlmAuditPlatform } from "@/lib/llm-audit/llm-audit-dataforseo";
import { mcp_DataForSEO_llm_responses_live } from "@/lib/mcp-tools";

export type DataForSeoLlmResponsesLiveParams = {
  platform: LlmAuditPlatform;
  model_name: string;
  user_prompt: string;
  system_message?: string;
  message_chain?: Array<{ role: "user"; message: string }>;
  web_search?: boolean;
  force_web_search?: boolean;
  web_search_country_iso_code?: string;
  web_search_city?: string;
};

export const DFS_LLM_PAYMENT_SKIP = { skipped: true as const, reason: "dfs_payment" as const };

export const DFS_LLM_UNAVAILABLE_SKIP = { skipped: true as const, reason: "dfs_unavailable" as const };

let dfsPaymentLatched = false;

type GlobalWithDfsLatch = typeof globalThis & {
  __neoPulseDfsPaymentLatched?: boolean;
};

export function isDfsPaymentLatched(): boolean {
  return (
    dfsPaymentLatched ||
    Boolean((globalThis as GlobalWithDfsLatch).__neoPulseDfsPaymentLatched)
  );
}

export function markDfsPaymentFailed(): void {
  dfsPaymentLatched = true;
  (globalThis as GlobalWithDfsLatch).__neoPulseDfsPaymentLatched = true;
}

export function resetDfsPaymentLatch(): void {
  dfsPaymentLatched = false;
  (globalThis as GlobalWithDfsLatch).__neoPulseDfsPaymentLatched = false;
}

export function isDfsLlmPaymentSkip(json: unknown): json is typeof DFS_LLM_PAYMENT_SKIP {
  return Boolean(
    json
    && typeof json === "object"
    && (json as { skipped?: boolean; reason?: string }).skipped === true
    && (json as { reason?: string }).reason === "dfs_payment",
  );
}

export function isDfsLlmUnavailableSkip(json: unknown): json is typeof DFS_LLM_UNAVAILABLE_SKIP {
  return Boolean(
    json
    && typeof json === "object"
    && (json as { skipped?: boolean; reason?: string }).skipped === true
    && (json as { reason?: string }).reason === "dfs_unavailable",
  );
}

export function isDfsLlmSkipped(json: unknown): boolean {
  return isDfsLlmPaymentSkip(json) || isDfsLlmUnavailableSkip(json);
}

function isGatewayHttpStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504 || status === 524;
}

export function isDataForSeoPaymentFailure(input: {
  httpStatus?: number;
  json?: unknown;
  message?: string;
}): boolean {
  if (input.httpStatus === 401 || input.httpStatus === 402 || input.httpStatus === 403) return true;
  const json = input.json && typeof input.json === "object" ? (input.json as Record<string, unknown>) : null;
  const code = typeof json?.status_code === "number" ? json.status_code : 0;
  if (code === 40100 || code === 40200 || code === 40210) return true;
  const task = Array.isArray(json?.tasks) ? (json.tasks[0] as Record<string, unknown> | undefined) : undefined;
  const taskCode = typeof task?.status_code === "number" ? task.status_code : 0;
  if (taskCode === 40100 || taskCode === 40200 || taskCode === 40210) return true;
  const msg = [
    input.message,
    typeof json?.status_message === "string" ? json.status_message : "",
    typeof json?.error === "string" ? json.error : "",
    typeof task?.status_message === "string" ? task.status_message : "",
  ]
    .join(" ")
    .toLowerCase();
  return (
    msg.includes("http 401")
    || msg.includes("401 (unauthorized)")
    || msg.includes("mcp api error (401)")
    || msg.includes("mcp api error (402)")
    || msg.includes("unauthorized")
    || msg.includes("invalid login or password")
    || msg.includes("credentials are not configured")
    || msg.includes("http 402")
    || msg.includes("payment required")
    || msg.includes("insufficient funds")
  );
}

/** DataForSEO LLM Responses Live — same MCP route as keyword/SERP (Settings key on every call). */
export async function dataforseoLlmResponsesLive(
  params: DataForSeoLlmResponsesLiveParams,
): Promise<unknown> {
  if (dfsPaymentLatched) return DFS_LLM_PAYMENT_SKIP;

  try {
    const json = await mcp_DataForSEO_llm_responses_live({
      platform: params.platform,
      model_name: params.model_name,
      user_prompt: params.user_prompt,
      system_message: params.system_message,
      message_chain: params.message_chain,
      web_search: params.web_search,
      force_web_search: params.force_web_search,
      web_search_country_iso_code: params.web_search_country_iso_code,
      web_search_city: params.web_search_city,
    });

    if (isDataForSeoPaymentFailure({ json })) {
      markDfsPaymentFailed();
      return DFS_LLM_PAYMENT_SKIP;
    }

    if (json && typeof json === "object") {
      const obj = json as Record<string, unknown>;
      if (typeof obj.error === "string" && obj.error.trim() && !Array.isArray(obj.tasks)) {
        throw new Error(obj.error.trim());
      }
    }

    return json;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof Error ? (err as Error & { status?: number }).status : undefined;
    if (isDataForSeoPaymentFailure({ httpStatus: status, message })) {
      markDfsPaymentFailed();
      return DFS_LLM_PAYMENT_SKIP;
    }
    if (status && isGatewayHttpStatus(status)) {
      console.warn(`[DFS LLM] MCP llm_responses_live HTTP ${status}; continuing without ChatGPT facts`);
      return DFS_LLM_UNAVAILABLE_SKIP;
    }
    const lower = message.toLowerCase();
    if (
      lower.includes("502 bad gateway")
      || lower.includes("503 service")
      || lower.includes("504 gateway")
    ) {
      return DFS_LLM_UNAVAILABLE_SKIP;
    }
    throw err;
  }
}
