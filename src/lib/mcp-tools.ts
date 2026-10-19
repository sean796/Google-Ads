/**
 * MCP Tools Wrapper
 * This file provides access to MCP tools for DataForSEO
 * MCP tools are called through a backend API endpoint that interfaces with the MCP server
 */

import {
  dataForSeoRequestHeaders,
  withDataForSeoRequestAuth,
} from "@/lib/dataforseo-request-auth";
import { BACKEND_CONNECTION_ERROR, resolveBackendApiBase } from "@/lib/wordpress-api/connection";
import { NEO_PULSE_CA_DEPLOY } from "@/lib/neo-pulse-deploy";
import { isViteDev, readViteEnv } from "@/lib/vite-env";

// Backend API endpoint for MCP calls
// In development, this should point to your backend server (e.g., http://localhost:3001/api/mcp)
// In production, use your deployed backend URL
// Default to localhost:3001 in development if VITE_MCP_API_BASE is not set
export function resolveMcpApiBase(): string {
  const backend = resolveBackendApiBase().replace(/\/+$/, "");
  if (backend) return `${backend}/api/mcp`;
  const configured = readViteEnv("VITE_MCP_API_BASE");
  if (configured) return configured;
  return isViteDev() ? "http://localhost:3001/api/mcp" : "/api/mcp";
}

const MAX_MCP_ATTEMPTS = 5;
const MCP_RETRY_DELAY_MS = 2000;

export function resolveMcpToolUrl(toolName: string): string {
  return `${resolveMcpApiBase().replace(/\/$/, "")}/${toolName}`;
}

/** True when production build has no absolute API URL (Render static will hit wrong host). */
export function isProductionBackendMisconfigured(): boolean {
  if (import.meta.env.DEV || NEO_PULSE_CA_DEPLOY) return false;
  if (import.meta.env.VITE_MCP_API_BASE) return false;
  const mcp = resolveMcpApiBase();
  if (mcp.startsWith("/")) return false;
  return !mcp.startsWith("http");
}

export function isTransientMcpError(message: string, status?: number): boolean {
  if (status === 502 || status === 503 || status === 504) return true;
  const m = message.toLowerCase();
  return (
    m.includes("gateway time-out") ||
    m.includes("gateway timeout") ||
    m.includes("504 gateway") ||
    m.includes("502 bad gateway") ||
    m.includes("503 service") ||
    m.includes("timeout") ||
    m.includes("temporarily unavailable") ||
    m.includes("econnreset") ||
    m.includes("network error")
  );
}

function mcpRetryDelayMs(message: string, attempt: number): number {
  const base = isTransientMcpError(message) ? 4000 : MCP_RETRY_DELAY_MS;
  return base * attempt;
}

function isNetworkFetchError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    (error.message.includes("fetch") ||
      error.message.includes("Failed to fetch") ||
      error.message.includes("NetworkError") ||
      error.message.includes("Network request failed"))
  );
}

type GlobalWithDfsLatch = typeof globalThis & {
  __neoPulseDfsPaymentLatched?: boolean;
};

function isDfsMcpLatched(): boolean {
  return Boolean((globalThis as GlobalWithDfsLatch).__neoPulseDfsPaymentLatched);
}

function latchDfsMcpSkip(): void {
  (globalThis as GlobalWithDfsLatch).__neoPulseDfsPaymentLatched = true;
}

function isDfsAuthOrPaymentSkip(status: number, message: string, json?: unknown): boolean {
  if (status === 401 || status === 402 || status === 403) return true;
  const rec = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const code = typeof rec?.status_code === "number" ? rec.status_code : 0;
  if (code === 40100 || code === 40200 || code === 40210) return true;
  const task = Array.isArray(rec?.tasks) ? (rec.tasks[0] as Record<string, unknown> | undefined) : undefined;
  const taskCode = typeof task?.status_code === "number" ? task.status_code : 0;
  if (taskCode === 40100 || taskCode === 40200 || taskCode === 40210) return true;
  const m = [
    message,
    typeof rec?.status_message === "string" ? rec.status_message : "",
    typeof rec?.error === "string" ? rec.error : "",
    typeof task?.status_message === "string" ? task.status_message : "",
  ]
    .join(" ")
    .toLowerCase();
  return (
    m.includes("payment required") ||
    m.includes("insufficient funds") ||
    m.includes("unauthorized") ||
    m.includes("invalid login or password") ||
    m.includes("credentials are not configured")
  );
}

async function callMCPToolOnce(toolName: string, params: unknown): Promise<unknown> {
  if (toolName.startsWith("DataForSEO_") && isDfsMcpLatched()) {
    return { skipped: true, reason: "dfs_payment", tasks: [] };
  }

  const url = resolveMcpToolUrl(toolName);

  const response = await fetch(url, {
    method: "POST",
    headers: dataForSeoRequestHeaders(),
    body: JSON.stringify(withDataForSeoRequestAuth(params)),
  });

  if (!response.ok) {
    let errorText = "";
    let errorData: { error?: string; message?: string; details?: unknown } | null = null;

    try {
      errorText = await response.text();
      try {
        errorData = JSON.parse(errorText) as { error?: string; message?: string; details?: unknown };
      } catch {
        // Not JSON, use as text
      }
    } catch {
      errorText = `HTTP ${response.status} ${response.statusText}`;
    }

    const errorMessage = errorData?.error || errorData?.message || errorText;
    if (
      toolName.startsWith("DataForSEO_") &&
      isDfsAuthOrPaymentSkip(response.status, errorMessage, errorData?.details ?? errorData)
    ) {
      latchDfsMcpSkip();
      return { skipped: true, reason: "dfs_payment", tasks: [] };
    }

    const errorDetails = errorData?.details
      ? `\nDetails: ${JSON.stringify(errorData.details, null, 2)}`
      : "";
    const err = new Error(`MCP API error (${response.status}): ${errorMessage}${errorDetails}`);
    (err as Error & { status?: number }).status = response.status;
    throw err;
  }

  const responseData = await response.json();
  if (
    toolName.startsWith("DataForSEO_") &&
    isDfsAuthOrPaymentSkip(response.status, "", responseData)
  ) {
    latchDfsMcpSkip();
    return { skipped: true, reason: "dfs_payment", tasks: [] };
  }

  return responseData;
}

async function callMCPTool(toolName: string, params: unknown): Promise<unknown> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_MCP_ATTEMPTS; attempt += 1) {
    try {
      return await callMCPToolOnce(toolName, params);
    } catch (error) {
      if (isNetworkFetchError(error)) {
        throw new Error(BACKEND_CONNECTION_ERROR);
      }

      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;

      if (err.message.includes("404") || err.message.includes("501")) {
        throw new Error(
          "MCP API endpoint not configured. Please:\n\n" +
            "1. Start the backend server (see server/ or START_BACKEND_SERVER.md)\n" +
            "2. Set DATAFORSEO_API_LOGIN and DATAFORSEO_API_PASSWORD in the backend environment\n" +
            "3. Ensure the backend is running on the correct port",
        );
      }

      const status = (err as Error & { status?: number }).status;
      if (attempt < MAX_MCP_ATTEMPTS && isTransientMcpError(err.message, status)) {
        const delayMs = mcpRetryDelayMs(err.message, attempt);
        console.warn(
          `[MCP] ${toolName} attempt ${attempt}/${MAX_MCP_ATTEMPTS} failed (${err.message}); retrying in ${delayMs}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      throw err;
    }
  }

  throw lastError ?? new Error(`MCP tool ${toolName} failed`);
}

// Wrapper functions for MCP tools
export const mcp_DataForSEO_dataforseo_labs_google_keyword_overview = async (params: {
  keywords: string[];
  location_name: string;
  language_code: string;
}) => {
  return callMCPTool("DataForSEO_dataforseo_labs_google_keyword_overview", params);
};

export const mcp_DataForSEO_dataforseo_labs_google_keyword_ideas = async (params: {
  keywords: string[];
  location_name: string;
  language_code: string;
  limit?: number;
}) => {
  return callMCPTool("DataForSEO_dataforseo_labs_google_keyword_ideas", params);
};

export const mcp_DataForSEO_dataforseo_labs_google_related_keywords = async (params: {
  keyword: string;
  location_name: string;
  language_code: string;
  limit?: number;
}) => {
  return callMCPTool("DataForSEO_dataforseo_labs_google_related_keywords", params);
};

export const mcp_DataForSEO_serp_organic_live_advanced = async (params: {
  keyword: string;
  location_name: string;
  language_code: string;
  depth?: number;
  people_also_ask_click_depth?: number;
}) => {
  return callMCPTool("DataForSEO_serp_organic_live_advanced", params);
};

export const mcp_DataForSEO_serp_google_maps_live_advanced = async (params: {
  keyword: string;
  location_coordinate: string;
  language_code?: string;
  depth?: number;
  search_places?: boolean;
}) => {
  return callMCPTool("DataForSEO_serp_google_maps_live_advanced", params);
};

export const mcp_DataForSEO_serp_google_ai_overview = async (params: {
  keyword: string;
  location_name: string;
  language_code: string;
}) => {
  return callMCPTool("DataForSEO_serp_google_ai_overview", params);
};

/** Google AI Mode SERP (task-based) - posts task, polls for completion, returns result + domain ranks */
export const mcp_DataForSEO_serp_google_ai_mode = async (params: {
  keyword: string;
  location_name: string;
  language_code: string;
  min_dr?: number;
}) => {
  return callMCPTool("DataForSEO_serp_google_ai_mode", params);
};

export const mcp_DataForSEO_on_page_content_parsing = async (params: {
  url: string;
  enable_javascript?: boolean;
  accept_language?: string;
}) => {
  return callMCPTool("DataForSEO_on_page_content_parsing", params);
};

export type LlmResponsesLivePlatform = "chat_gpt" | "gemini" | "perplexity";

export const mcp_DataForSEO_llm_responses_live = async (params: {
  platform: LlmResponsesLivePlatform;
  model_name: string;
  user_prompt: string;
  system_message?: string;
  message_chain?: Array<{ role: "user"; message: string }>;
  web_search?: boolean;
  force_web_search?: boolean;
  web_search_country_iso_code?: string;
  web_search_city?: string;
  max_output_tokens?: number;
}) => {
  return callMCPTool("DataForSEO_llm_responses_live", params);
};

// Search intent MCP tool removed - using heuristics instead
// SERP/Competitor analysis removed - keeping it simple, just keyword data
