import { loadSemrushApiKeyForAppRequests } from "@/lib/api";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { getOpenRouterApiKeyForApp } from "@/lib/openrouter-api-key-resolve";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { normalizeOrganicReportingHighlights } from "./organic-reporting-highlights-normalize";
import type { OrganicReportingHighlights, OrganicReportingHighlightsSnapshot } from "./organic-reporting-highlights-types";

export type {
  OrganicDeckOpportunity,
  OrganicReportingHighlights,
  OrganicReportingHighlightsSnapshot,
  OrganicReportingHighlightsSnapshotCompareQuery,
  OrganicReportingHighlightsSnapshotMonthlyTable,
  OrganicReportingHighlightsSnapshotPeriodQuery,
} from "./organic-reporting-highlights-types";
export {
  normalizeOrganicReportingHighlights,
  parseOrganicReportingHighlightsPayload,
} from "./organic-reporting-highlights-normalize";
export {
  buildOrganicReportingHighlightsSnapshot,
  buildPlaceholderOrganicReportingHighlights,
  resolveClientReportHighlights,
} from "./organic-reporting-highlights-snapshot";

function organicReportingHighlightsRequestHeaders(): Headers {
  // Session Bearer must accompany the cookie: hub routes 401 without it.
  const headers = neoPulseApiHeaders({ "Content-Type": "application/json" });
  const key = loadSemrushApiKeyForAppRequests();
  if (key) {
    headers.set("X-Semrush-Api-Key", key);
  }
  const openRouterKey = getOpenRouterApiKeyForApp().trim();
  if (openRouterKey) {
    headers.set("X-OpenRouter-Api-Key", openRouterKey);
  }
  return headers;
}

function mergeHighlightsAbortSignal(signal?: AbortSignal): AbortSignal | undefined {
  if (typeof AbortSignal.timeout !== "function") {
    return signal;
  }
  const timeoutSignal = AbortSignal.timeout(120_000);
  if (!signal) return timeoutSignal;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([signal, timeoutSignal]);
  }
  return timeoutSignal;
}

export type FetchOrganicReportingHighlightsOptions = {
  bypassCache?: boolean;
};

export async function fetchOrganicReportingHighlights(
  snapshot: OrganicReportingHighlightsSnapshot,
  siteId: string,
  signal?: AbortSignal,
  options?: FetchOrganicReportingHighlightsOptions,
): Promise<OrganicReportingHighlights> {
  const headers = organicReportingHighlightsRequestHeaders();
  if (options?.bypassCache) {
    headers.set("X-Neo-Pulse-Reporting-Highlights-Bypass-Cache", "1");
  }

  const response = await fetch(`${BACKEND_API_BASE}/api/organic-dashboard/reporting-highlights`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({
      siteId,
      bypassCache: options?.bypassCache === true,
      snapshot: { ...snapshot, periods: undefined },
    }),
    signal: mergeHighlightsAbortSignal(signal),
  });

  const data = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    highlights?: unknown;
  };

  if (!response.ok || data.success === false) {
    const message =
      typeof data.error === "string" && data.error.trim()
        ? data.error.trim()
        : `Reporting highlights HTTP ${response.status}`;
    throw new Error(message);
  }

  if (!data.highlights || typeof data.highlights !== "object") {
    throw new Error("Highlights model returned empty content.");
  }

  const normalized = normalizeOrganicReportingHighlights(data.highlights);
  if (!normalized) {
    throw new Error("Highlights model returned empty content.");
  }
  return normalized;
}

function snapshotExpectsLocalGridNarrative(
  snapshot: OrganicReportingHighlightsSnapshot,
): boolean {
  const grid = snapshot.localGrid;
  return Boolean(grid && typeof grid.scanId === "string" && grid.scanId.trim());
}

export async function fetchLocalGridReportingNarrative(
  snapshot: OrganicReportingHighlightsSnapshot,
  siteId: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const localGrid = snapshot.localGrid;
  if (!localGrid?.scanId?.trim()) {
    return [];
  }

  const { fetchLocalGridReportNarrativeViaOpenRouter } = await import(
    "@/lib/organic-dashboard/local-grid-report-narrative"
  );

  return fetchLocalGridReportNarrativeViaOpenRouter(
    snapshot.siteName,
    snapshot.siteUrl,
    localGrid,
    siteId,
    signal,
  );
}

export async function fetchOrganicReportingHighlightsForSnapshot(
  snapshot: OrganicReportingHighlightsSnapshot,
  siteId: string,
  signal?: AbortSignal,
): Promise<OrganicReportingHighlights> {
  const highlights = await fetchOrganicReportingHighlights(snapshot, siteId, signal);
  if (!snapshotExpectsLocalGridNarrative(snapshot) || highlights.localGridNarrative.length > 0) {
    return highlights;
  }

  try {
    const localGridNarrative = await fetchLocalGridReportingNarrative(snapshot, siteId, signal);
    if (localGridNarrative.length > 0) {
      return { ...highlights, localGridNarrative };
    }
  } catch {
    /* keep main highlights; Local Map section handles empty narrative */
  }

  return highlights;
}
