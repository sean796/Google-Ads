import { backendApiUrl } from "@/lib/wordpress-api/connection";
import type { WordPressSite } from "@/components/integrations/types";

export interface EmcpSiteCredentials {
  siteUrl: string;
  username: string;
  appPassword: string;
}

export interface EmcpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: {
    readonly?: boolean;
    destructive?: boolean;
    idempotent?: boolean;
  };
}

export interface EmcpDispatcherOperationDescriptor {
  description: string;
  arguments: Record<string, string>;
}

export interface EmcpDispatcherCatalog {
  dispatcher: string;
  version?: string;
  locked?: boolean;
  plan?: string;
  operations: Record<string, EmcpDispatcherOperationDescriptor>;
}

export interface EmcpSiteCatalog {
  mcpUrl: string;
  toolCount: number;
  tools: EmcpToolDescriptor[];
  neoPulseRead: EmcpDispatcherCatalog | null;
  neoPulseWrite: EmcpDispatcherCatalog | null;
  neoToolsRead: EmcpDispatcherCatalog | null;
  neoToolsWrite: EmcpDispatcherCatalog | null;
}

export interface EmcpAuditFinding {
  check: number;
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  post_id?: number;
  url?: string;
  meta_key?: string;
  foreign_name?: string;
  fix_tool?: string;
  fix_op?: string;
  [key: string]: unknown;
}

export interface EmcpAuditReport {
  ok: boolean;
  site_url: string;
  finding_count: number;
  findings: EmcpAuditFinding[];
}

export interface EmcpHistoryEntry {
  id: string;
  timestamp: number;
  date: string;
  user_id: number;
  user_login: string;
  operation: string;
  summary: string;
  undone: boolean;
}

export interface EmcpBatchStepInput {
  id: string;
  tool: string;
  operation?: string;
  arguments?: Record<string, unknown>;
}

export interface EmcpBatchStepResult {
  id: string;
  tool: string;
  operation: string;
  ok: boolean;
  durationMs: number;
  data?: unknown;
  error?: string;
}

export function credentialsFromWordPressSite(site: WordPressSite): EmcpSiteCredentials {
  return {
    siteUrl: site.siteUrl,
    username: site.username,
    appPassword: site.appPassword,
  };
}

export async function fetchEmcpSiteCatalog(
  creds: EmcpSiteCredentials,
  signal?: AbortSignal,
): Promise<EmcpSiteCatalog> {
  const response = await fetch(backendApiUrl("/api/emcp/catalog"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(creds),
    signal,
  });
  const json = (await response.json()) as {
    ok?: boolean;
    error?: string;
    catalog?: EmcpSiteCatalog;
  };
  if (!response.ok || !json.ok || !json.catalog) {
    throw new Error(json.error || `Failed to load Neo EMCP catalog (HTTP ${response.status})`);
  }
  return json.catalog;
}

export async function executeEmcpTool<T = unknown>(
  params: EmcpSiteCredentials & {
    tool: string;
    operation?: string;
    arguments?: Record<string, unknown>;
  },
  signal?: AbortSignal,
): Promise<{ tool: string; operation: string; durationMs: number; data: T }> {
  const response = await fetch(backendApiUrl("/api/emcp/execute"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal,
  });
  const json = (await response.json()) as {
    ok?: boolean;
    error?: string;
    tool?: string;
    operation?: string;
    durationMs?: number;
    data?: T;
  };
  if (!response.ok || !json.ok) {
    throw new Error(json.error || `Neo EMCP tool execution failed (HTTP ${response.status})`);
  }
  return {
    tool: json.tool ?? params.tool,
    operation: json.operation ?? params.operation ?? "",
    durationMs: json.durationMs ?? 0,
    data: json.data as T,
  };
}

export async function executeEmcpBatch(
  params: EmcpSiteCredentials & {
    steps: EmcpBatchStepInput[];
    stopOnError?: boolean;
  },
  signal?: AbortSignal,
): Promise<{ ok: boolean; siteUrl: string; results: EmcpBatchStepResult[] }> {
  const response = await fetch(backendApiUrl("/api/emcp/batch"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal,
  });
  const json = (await response.json()) as {
    ok?: boolean;
    error?: string;
    siteUrl?: string;
    results?: EmcpBatchStepResult[];
  };
  if (!response.ok || !Array.isArray(json.results)) {
    throw new Error(json.error || `Neo EMCP batch failed (HTTP ${response.status})`);
  }
  return {
    ok: Boolean(json.ok),
    siteUrl: json.siteUrl ?? params.siteUrl,
    results: json.results,
  };
}
