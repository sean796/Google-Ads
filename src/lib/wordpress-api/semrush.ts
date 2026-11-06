import { backendApiUrl } from './connection';
import { loadSemrushApiKeyForAppRequests } from '@/lib/api';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

function semrushRequestHeaders(): HeadersInit {
  const headers = neoPulseApiHeaders({ 'Content-Type': 'application/json' });
  const key = loadSemrushApiKeyForAppRequests();
  if (key) {
    headers.set('X-Semrush-Api-Key', key);
  }
  return headers;
}

/** Raw MCP payloads: phrase_this (volume/CPC/competition) + phrase_kdi (difficulty). */
export type SemrushKeywordOverviewPayload = {
  phraseThis?: unknown;
  phraseKdi?: unknown;
};

export type SemrushBulkEnrichmentResult = {
  skipped?: boolean;
  reason?: string;
  /** Keywords only (no Semrush metrics) from url_organic report */
  urlOrganicKeywords?: string[];
  /** Keywords only from phrase_related report (ACF seed) */
  phraseRelatedKeywords?: string[];
  /** Ranking / landing URLs from url_organic (for link validation) */
  urlOrganicUrls?: string[];
  /** URLs from phrase_related rows when present */
  phraseRelatedUrls?: string[];
  /** Top organic result URLs for the seed keyword (phrase_organic report) */
  phraseOrganicUrls?: string[];
  /** Deduplicated union of URL lists above (server: own-site strip, competitor/dealer blocklist, topical path; Hunter Douglas whitelisted; no DataForSEO rank gate in async pipeline) */
  externalSemrushUrls?: string[];
  /** phrase_this + phrase_kdi parsed results (volume, CPC, KD, etc.) when seed keyword is non-empty */
  keywordOverview?: SemrushKeywordOverviewPayload | null;
  errors?: Array<{ step: string; message: string }>;
  /** Server-persisted overview JSON filename (Meta Optimizer / bulk) */
  storedFile?: string;
};

/**
 * Proxies to Node: Semrush MCP execute_report (url_organic + phrase_related).
 */
export async function fetchSemrushBulkEnrichment(params: {
  pageUrl: string;
  seedKeyword?: string;
  database?: string;
  /** Other managed client domains - never returned as Semrush-approved externals */
  portfolioBlockedHosts?: string[];
}): Promise<SemrushBulkEnrichmentResult> {
  const url = backendApiUrl("/semrush/bulk-enrichment");
  const body: Record<string, unknown> = {
    pageUrl: params.pageUrl,
    seedKeyword: params.seedKeyword ?? '',
    database: params.database,
  };
  if (params.portfolioBlockedHosts && params.portfolioBlockedHosts.length > 0) {
    body.portfolioBlockedHosts = params.portfolioBlockedHosts;
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as SemrushBulkEnrichmentResult & { error?: string };
    if (!response.ok) {
      return {
        skipped: true,
        reason: 'http_error',
        errors: [{ step: 'fetch', message: data?.error || `HTTP ${response.status}` }],
      };
    }
    return data;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      skipped: true,
      reason: 'network',
      errors: [{ step: 'fetch', message }],
    };
  }
}

export type SemrushSiteAuditUrlResult = {
  skipped?: boolean;
  reason?: string;
  pageid?: string | null;
  pageList?: unknown;
  pageInfo?: unknown;
  projectInfo?: unknown;
  errors?: Array<{ step: string; message: string }>;
  /** Server-persisted Site Audit JSON filename */
  storedFile?: string;
};

/**
 * Semrush Site Audit: page_list + page_info for a URL (MCP). Requires project ID on the WordPress site.
 */
export async function fetchSemrushSiteAuditUrl(params: {
  pageUrl: string;
  projectId: string;
}): Promise<SemrushSiteAuditUrlResult> {
  const url = backendApiUrl("/semrush/site-audit-url");
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        pageUrl: params.pageUrl,
        projectId: params.projectId,
      }),
    });
    const data = (await response.json()) as SemrushSiteAuditUrlResult & { error?: string };
    if (!response.ok) {
      return {
        skipped: true,
        reason: 'http_error',
        errors: [{ step: 'fetch', message: data?.error || `HTTP ${response.status}` }],
      };
    }
    return data;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      skipped: true,
      reason: 'network',
      errors: [{ step: 'fetch', message }],
    };
  }
}

export type SemrushMatchProjectCandidate = {
  project_id: string;
  url: string;
  project_name: string;
};

export type SemrushMatchProjectResult =
  | {
      ok: true;
      projectId: string;
      matchedHost: string;
      projectName: string;
      ambiguous: boolean;
      matchedCount: number;
    }
  | {
      ok: false;
      error: string;
      status: number;
      candidates?: SemrushMatchProjectCandidate[];
    };

/**
 * List Semrush projects (Management API) and match project_id to site hostname. Server uses SEMRUSH_API_KEY.
 */
export async function matchSemrushProjectForSite(siteUrl: string): Promise<SemrushMatchProjectResult> {
  const url = backendApiUrl("/semrush/match-project-for-site");
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ siteUrl }),
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (response.ok) {
      return {
        ok: true,
        projectId: String(data.projectId ?? ''),
        matchedHost: String(data.matchedHost ?? ''),
        projectName: String(data.projectName ?? ''),
        ambiguous: Boolean(data.ambiguous),
        matchedCount: typeof data.matchedCount === 'number' ? data.matchedCount : 1,
      };
    }
    const candidates = Array.isArray(data.candidates)
      ? (data.candidates as SemrushMatchProjectCandidate[])
      : undefined;
    return {
      ok: false,
      error: typeof data.error === 'string' ? data.error : `HTTP ${response.status}`,
      status: response.status,
      candidates,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      status: 0,
    };
  }
}

export type SemrushAuditAiContextResult =
  | { ok: true; context: string; truncated: boolean }
  | { ok: false; error: string; status: number };

/**
 * Server reads persisted Site Audit JSON and returns a compact string for LLM (capped).
 */
export async function fetchSemrushAuditAiContext(params: {
  filename: string;
  maxChars?: number;
}): Promise<SemrushAuditAiContextResult> {
  const url = backendApiUrl("/semrush/audit-ai-context");
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        filename: params.filename,
        maxChars: params.maxChars,
      }),
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (response.ok) {
      return {
        ok: true,
        context: typeof data.context === "string" ? data.context : "",
        truncated: Boolean(data.truncated),
      };
    }
    return {
      ok: false,
      error: typeof data.error === "string" ? data.error : `HTTP ${response.status}`,
      status: response.status,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      status: 0,
    };
  }
}

export type SemrushPositionTrackingCompareRow = {
  keyword: string;
  primaryPosition: number | null;
  comparePosition: number | null;
  change: number | null;
};

export type SemrushPositionTrackingCompareResult = {
  skipped?: boolean;
  reason?: string;
  message?: string;
  rows?: SemrushPositionTrackingCompareRow[];
};

export async function fetchSemrushPositionTrackingCompare(params: {
  projectId?: string;
  campaignId: string;
  primaryStart: string;
  primaryEnd: string;
  compareStart: string;
  compareEnd: string;
  trackedUrl: string;
  /** Last-N-months progress reports: primary positions only, no prior period fetch. */
  periodOnly?: boolean;
}): Promise<SemrushPositionTrackingCompareResult> {
  const url = backendApiUrl("/semrush/position-tracking-compare");
  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: semrushRequestHeaders(),
      body: JSON.stringify(params),
    });
    const data = (await response.json()) as SemrushPositionTrackingCompareResult & { error?: string };
    if (!response.ok) {
      return {
        skipped: true,
        reason: "http_error",
        message: data?.error || `HTTP ${response.status}`,
        rows: [],
      };
    }
    return data;
  } catch (e) {
    return {
      skipped: true,
      reason: "network",
      message: e instanceof Error ? e.message : String(e),
      rows: [],
    };
  }
}
