import type { WordPressSite } from "@/components/integrations/types";
import { backendApiUrl } from "@/lib/wordpress-api/connection";
import {
  isDataForSeoPaymentFailure,
  isDfsPaymentLatched,
  markDfsPaymentFailed,
} from "@/lib/llm-audit/dataforseo-llm-responses-live";
import { mcp_DataForSEO_serp_organic_live_advanced } from "@/lib/mcp-tools";
import {
  buildMergedSeoContentBrief,
  type SeoContentBriefV1,
} from "@/lib/overview-seo-content-brief";
import type { LlmAuditBrief, QueryFanout } from "@/lib/overview-seo-content-brief";
import {
  fetchLlmAuditParallel,
} from "@/lib/llm-audit/llm-audit-dataforseo";
import { resolveSiteLocationLabel } from "@/lib/llm-audit/resolve-site-location-label";

/** DataForSEO location_name when site/entity label is missing (keyword geography hints). */
export function resolveSerpLocationName(location: string, keyword: string): string {
  const kw = keyword.toLowerCase();
  if (/\b(canada|canadian)\b/.test(kw)) return "Canada";
  const loc = location.trim();
  if (loc) {
    if (loc.includes(",")) return loc.replace(/\s+/g, " ");
    return loc;
  }
  if (/\bsherwood\s+park\b/.test(kw)) return "Sherwood Park,Alberta,Canada";
  if (/\bstrathcona\b/.test(kw)) return "Sherwood Park,Alberta,Canada";
  if (/\bedmonton\b/.test(kw)) return "Edmonton,Alberta,Canada";
  if (/\bcalgary\b/.test(kw)) return "Calgary,Alberta,Canada";
  if (/\b(alberta|\bab\b)\b/.test(kw)) return "Alberta,Canada";
  if (/\b(manitoba|\bmb\b|winkler|plum coulee|morden|altona)\b/.test(kw)) {
    return "Winkler,Manitoba,Canada";
  }
  if (/\bontario\b/.test(kw)) return "Toronto,Ontario,Canada";
  if (/\bbritish columbia\b|\bbc\b/.test(kw)) return "Vancouver,British Columbia,Canada";
  return "United States";
}

export function serpMcpJsonHasSerpTasks(serpJson: unknown): serpJson is Record<string, unknown> {
  return extractSerpDumpJsonFromMcpResponse(serpJson) != null;
}

/** Resolve SERP dump JSON from MCP response (stored_file path or inline tasks). */
export function extractSerpDumpJsonFromMcpResponse(serpJson: unknown): Record<string, unknown> | null {
  if (!serpJson || typeof serpJson !== "object") return null;
  const rec = serpJson as Record<string, unknown>;
  if (Array.isArray(rec.tasks) && rec.tasks.length > 0) return rec;

  const details = rec.details;
  if (details && typeof details === "object") {
    const nested = details as Record<string, unknown>;
    if (Array.isArray(nested.tasks) && nested.tasks.length > 0) return nested;
  }

  const result = rec.result;
  if (result && typeof result === "object") {
    const nested = result as Record<string, unknown>;
    if (Array.isArray(nested.tasks) && nested.tasks.length > 0) return nested;
  }

  return null;
}

export function serpDumpFilenameUrl(filename: string): string {
  return backendApiUrl(`/dataforseo/serp-dump/${encodeURIComponent(filename)}`);
}

export function storedFileFromSerpMcpResponse(
  serpJson: Record<string, unknown> | null | undefined,
): string | null {
  const stored =
    (serpJson && (serpJson.stored_file || serpJson.storedFile || serpJson.storedFilename)) ||
    null;
  return typeof stored === "string" && stored.trim() ? stored.trim() : null;
}

export type SerpLlmWaveCallbacks = {
  onSerpDone?: (summary: string) => void;
  onLlmDone?: (summary: string) => void;
  onProgress?: (message: string) => void;
};

export type SerpLlmWaveResult = {
  storedFile: string | null;
  llmAudit: LlmAuditBrief;
  serpMcpJson: Awaited<ReturnType<typeof mcp_DataForSEO_serp_organic_live_advanced>> | null;
  serpError: string | null;
};

async function fetchDataForSeoSerpMcpSafe(input: {
  keyword: string;
  location_name: string;
}): Promise<{
  serpMcpJson: Awaited<ReturnType<typeof mcp_DataForSEO_serp_organic_live_advanced>> | null;
  serpError: string | null;
}> {
  if (isDfsPaymentLatched()) {
    return { serpMcpJson: null, serpError: null };
  }
  try {
    const serpMcpJson = await mcp_DataForSEO_serp_organic_live_advanced({
      keyword: input.keyword,
      location_name: input.location_name,
      language_code: "en",
      depth: 10,
      people_also_ask_click_depth: 4,
    });
    if (
      isDataForSeoPaymentFailure({ json: serpMcpJson }) ||
      (serpMcpJson &&
        typeof serpMcpJson === "object" &&
        (serpMcpJson as { skipped?: boolean }).skipped === true)
    ) {
      markDfsPaymentFailed();
      return { serpMcpJson: null, serpError: null };
    }
    return { serpMcpJson, serpError: null };
  } catch (err) {
    const serpError = err instanceof Error ? err.message : String(err);
    const httpStatus = (err as Error & { status?: number })?.status;
    if (isDataForSeoPaymentFailure({ httpStatus, message: serpError })) {
      markDfsPaymentFailed();
      return { serpMcpJson: null, serpError: null };
    }
    return { serpMcpJson: null, serpError };
  }
}

export type OptionalDataForSeoSerpResult = {
  storedFile: string | null;
  serpMcpJson: Awaited<ReturnType<typeof mcp_DataForSEO_serp_organic_live_advanced>> | null;
  serpError: string | null;
};

/** Optional DataForSEO SERP try for overview research step 0 (never throws). */
function serpGeoKeywordText(keyword: string, geoHint?: string): string {
  return [geoHint, keyword].map((s) => s?.trim()).filter(Boolean).join(" ");
}

export async function fetchOptionalDataForSeoSerp(input: {
  keyword: string;
  site?: WordPressSite | null;
  location?: string;
  geoHint?: string;
}): Promise<OptionalDataForSeoSerpResult> {
  const keyword = input.keyword.trim();
  const location = (input.location ?? resolveSiteLocationLabel(input.site, keyword)).trim();
  const serpLocation = resolveSerpLocationName(location, serpGeoKeywordText(keyword, input.geoHint));
  const { serpMcpJson, serpError } = await fetchDataForSeoSerpMcpSafe({
    keyword,
    location_name: serpLocation,
  });
  const storedFile = storedFileFromSerpMcpResponse(
    serpMcpJson as Record<string, unknown> | null | undefined,
  );
  return { storedFile, serpMcpJson, serpError };
}

/** Resolve SERP JSON for brief merge: stored dump, inline MCP payload, or empty tasks. */
export async function resolveSerpDumpJsonForBrief(input: {
  storedFile: string | null;
  serpMcpJson: unknown;
  serpDumpUrl?: (filename: string) => string;
}): Promise<{ serpDumpJson: Record<string, unknown>; loadSummary: string }> {
  if (input.storedFile?.trim()) {
    try {
      const serpDumpJson = await loadSerpDumpJson(input.storedFile.trim(), input.serpDumpUrl);
      return {
        serpDumpJson,
        loadSummary: `SERP dump loaded: ${input.storedFile.trim()}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "SERP dump load failed";
      const inline = extractSerpDumpJsonFromMcpResponse(input.serpMcpJson);
      if (inline) {
        return { serpDumpJson: inline, loadSummary: `${message}; using inline SERP payload` };
      }
      return {
        serpDumpJson: { tasks: [] },
        loadSummary: `${message}; OpenRouter LLM audit used for SERP research`,
      };
    }
  }

  const inline = extractSerpDumpJsonFromMcpResponse(input.serpMcpJson);
  if (inline) {
    return { serpDumpJson: inline, loadSummary: "SERP dump loaded from MCP inline payload" };
  }

  return {
    serpDumpJson: { tasks: [] },
    loadSummary: "No DataForSEO SERP dump; OpenRouter LLM audit used for SERP research",
  };
}

/** Live DataForSEO SERP + ChatGPT / Gemini / Perplexity audit. */
export async function runSerpAndLlmAuditParallel(input: {
  keyword: string;
  pageUrl: string;
  site?: WordPressSite | null;
  location?: string;
  geoHint?: string;
  requireSerpDump?: boolean;
  callbacks?: SerpLlmWaveCallbacks;
}): Promise<SerpLlmWaveResult> {
  const keyword = input.keyword.trim();
  const pageUrl = input.pageUrl.trim();
  if (!keyword) throw new Error("fetchSerpAndLlmAuditWave: keyword is required");
  if (!pageUrl) throw new Error("fetchSerpAndLlmAuditWave: pageUrl is required");

  const location = (input.location ?? resolveSiteLocationLabel(input.site, keyword)).trim();
  const serpLocation = resolveSerpLocationName(location, serpGeoKeywordText(keyword, input.geoHint));
  const report = (message: string) => input.callbacks?.onProgress?.(message);

  const runSerp = () => fetchDataForSeoSerpMcpSafe({ keyword, location_name: serpLocation });
  const runAudit = () =>
    fetchLlmAuditParallel({
      keyword,
      siteUrl: pageUrl,
      site: input.site ?? undefined,
      location: location || undefined,
      onProgress: report,
    });

  report(`Live DataForSEO SERP (${serpLocation})`);
  let serpMcpJson: Awaited<ReturnType<typeof fetchDataForSeoSerpMcpSafe>>["serpMcpJson"];
  let serpError: string | null;
  let llmAudit: Awaited<ReturnType<typeof fetchLlmAuditParallel>>;

  if (input.requireSerpDump) {
    ({ serpMcpJson, serpError } = await runSerp());
  } else {
    [{ serpMcpJson, serpError }, llmAudit] = await Promise.all([runSerp(), runAudit()]);
  }

  const storedFile = storedFileFromSerpMcpResponse(
    serpMcpJson as Record<string, unknown> | null | undefined,
  );
  const hasInlineSerp = Boolean(extractSerpDumpJsonFromMcpResponse(serpMcpJson));
  const serpSummary = storedFile
    ? "Live SERP ready"
    : serpError && isDataForSeoPaymentFailure({ message: serpError })
      ? ""
      : serpError
        ? `Live SERP failed: ${serpError}`
      : hasInlineSerp
        ? "Live SERP ready"
        : "Live SERP returned no results";
  if (serpSummary) {
    input.callbacks?.onSerpDone?.(serpSummary);
    report(serpSummary);
  }

  if (input.requireSerpDump) {
    llmAudit = await runAudit();
  }

  const llmOkCount = llmAudit.platforms.filter((p) => p.status === "ok").length;
  const llmTotal = llmAudit.platforms.length;
  if (llmOkCount > 0) {
    const auditSummary = `Live audit: ${llmOkCount}/${llmTotal} ok`;
    input.callbacks?.onLlmDone?.(auditSummary);
    report(auditSummary);
  }

  return { storedFile, llmAudit, serpMcpJson, serpError };
}

/** Extra-query SERP only (no Gemini/Perplexity). Used by topic fan-out. */
export async function fetchSerpOrganicForQuery(input: {
  keyword: string;
  site?: WordPressSite | null;
  location?: string;
}): Promise<{ storedFile: string | null; serpDumpJson: Record<string, unknown> }> {
  const keyword = input.keyword.trim();
  if (!keyword) throw new Error("fetchSerpOrganicForQuery: keyword is required");
  if (isDfsPaymentLatched()) {
    return { storedFile: null, serpDumpJson: { tasks: [] } };
  }
  const location = (input.location ?? resolveSiteLocationLabel(input.site, keyword)).trim();
  const serpLocation = resolveSerpLocationName(location, keyword);
  const { serpMcpJson } = await fetchDataForSeoSerpMcpSafe({
    keyword,
    location_name: serpLocation,
  });
  if (!serpMcpJson || isDfsPaymentLatched()) {
    return { storedFile: null, serpDumpJson: { tasks: [] } };
  }
  const storedFile = storedFileFromSerpMcpResponse(
    serpMcpJson as Record<string, unknown> | null | undefined,
  );
  if (storedFile) {
    try {
      return { storedFile, serpDumpJson: await loadSerpDumpJson(storedFile) };
    } catch {
      const inlineFallback = extractSerpDumpJsonFromMcpResponse(serpMcpJson);
      return { storedFile: null, serpDumpJson: inlineFallback ?? { tasks: [] } };
    }
  }
  const inline = extractSerpDumpJsonFromMcpResponse(serpMcpJson);
  return { storedFile: null, serpDumpJson: inline ?? { tasks: [] } };
}

export const SERP_DUMP_LOAD_TIMEOUT_MS = 30_000;

export async function loadSerpDumpJson(
  storedFile: string,
  serpDumpUrl?: (filename: string) => string,
): Promise<Record<string, unknown>> {
  const url = serpDumpUrl ? serpDumpUrl(storedFile) : serpDumpFilenameUrl(storedFile);
  const serpRes = await fetch(url, { signal: AbortSignal.timeout(SERP_DUMP_LOAD_TIMEOUT_MS) });
  if (!serpRes.ok) {
    throw new Error(`SERP dump load failed (HTTP ${serpRes.status})`);
  }
  const serpDumpJson = await serpRes.json().catch(() => null);
  if (!serpDumpJson || typeof serpDumpJson !== "object") {
    throw new Error("SERP dump JSON invalid");
  }
  return serpDumpJson as Record<string, unknown>;
}

export function mergeSeoContentBriefFromParts(input: {
  serpDumpJson: unknown;
  pageUrl: string;
  focusKeyword: string;
  llmAudit: LlmAuditBrief;
  gscPageUrl?: string;
  gscQueries?: string[];
  semrushOverviewJson?: unknown | null;
  queryFanout?: QueryFanout | null;
}): SeoContentBriefV1 {
  return buildMergedSeoContentBrief({
    serpDumpJson: input.serpDumpJson,
    pageUrl: input.pageUrl.trim(),
    focusKeyword: input.focusKeyword.trim(),
    gscPageUrl: input.gscPageUrl ?? input.pageUrl.trim(),
    gscQueries: input.gscQueries ?? [],
    semrushOverviewJson: input.semrushOverviewJson ?? null,
    llmAudit: input.llmAudit,
    queryFanout: input.queryFanout ?? input.llmAudit.queryFanout ?? null,
  });
}

export type FetchSeoContentBriefWaveInput = {
  keyword: string;
  pageUrl: string;
  site?: WordPressSite | null;
  location?: string;
  /** Title or other copy used only to infer SERP country (e.g. Canada in headline). */
  geoHint?: string;
  gscQueries?: string[];
  gscPageUrl?: string;
  semrushOverviewJson?: unknown | null;
  serpDumpUrl?: (filename: string) => string;
  requireSerpDump?: boolean;
  callbacks?: SerpLlmWaveCallbacks;
};

/** Overview-style SERP + LLM wave → merged SeoContentBriefV1. */
export async function fetchSeoContentBriefWave(
  input: FetchSeoContentBriefWaveInput,
): Promise<{ brief: SeoContentBriefV1; storedFile: string | null }> {
  const { storedFile, llmAudit, serpMcpJson } = await runSerpAndLlmAuditParallel({
    keyword: input.keyword,
    pageUrl: input.pageUrl,
    site: input.site,
    location: input.location,
    geoHint: input.geoHint,
    requireSerpDump: input.requireSerpDump,
    callbacks: input.callbacks,
  });

  const { serpDumpJson, loadSummary } = await resolveSerpDumpJsonForBrief({
    storedFile,
    serpMcpJson,
    serpDumpUrl: input.serpDumpUrl,
  });
  const serpTasks = Array.isArray(serpDumpJson.tasks) ? serpDumpJson.tasks : [];
  input.callbacks?.onProgress?.(serpTasks.length > 0 ? "Live SERP ready" : loadSummary);

  input.callbacks?.onProgress?.("New research brief merged");
  const brief = mergeSeoContentBriefFromParts({
    serpDumpJson,
    pageUrl: input.pageUrl,
    focusKeyword: input.keyword,
    llmAudit,
    gscPageUrl: input.gscPageUrl,
    gscQueries: input.gscQueries,
    semrushOverviewJson: input.semrushOverviewJson,
  });

  return { brief, storedFile };
}
