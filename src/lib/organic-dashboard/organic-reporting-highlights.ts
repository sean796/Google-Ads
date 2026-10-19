import type { OrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import { loadSemrushApiKeyForAppRequests } from "@/lib/api";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import {
  deriveKeyTakeawaysFromSummary,
  ORGANIC_GA4_DECK_LABELS,
  plainDeckText,
  sanitizeDeckOpportunity,
  sanitizeDeckOpportunityComparisonRows,
  type SanitizedDeckOpportunity,
} from "@/lib/organic-dashboard/organic-client-report-deck-helpers";

export type OrganicDeckOpportunity = SanitizedDeckOpportunity;

export type OrganicReportingHighlights = {
  executiveSummary: string;
  keyTakeaways: string[];
  /** Client-facing GA4 + GSC narrative for the performance summary section (DeepSeek / report model). */
  performanceNarrative: string[];
  /** Keyword / query story for the keyword performance section (report model). */
  keywordNarrative: string[];
  topOpportunities: OrganicDeckOpportunity[];
};

function sanitizeOpportunityList(raw: unknown): OrganicDeckOpportunity[] {
  if (!Array.isArray(raw)) return [];
  const out: OrganicDeckOpportunity[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const rank = typeof r.rank === "number" ? r.rank : Number(r.rank);
    if (!Number.isFinite(rank)) continue;
    if (typeof r.label !== "string" || typeof r.why !== "string") continue;
    const comparisonRows = sanitizeDeckOpportunityComparisonRows(r.comparisonRows);
    if (comparisonRows.length === 0 && typeof r.metrics !== "string") continue;
    let evidence: string[] | undefined;
    if (Array.isArray(r.evidence)) {
      evidence = r.evidence.filter((e) => typeof e === "string" && e.trim()).map(String);
    }
    out.push(
      sanitizeDeckOpportunity({
        rank,
        label: r.label,
        why: r.why,
        comparisonRows,
        metrics: typeof r.metrics === "string" ? r.metrics : "",
        action: typeof r.action === "string" ? r.action : "",
        evidence,
      }),
    );
  }
  return out;
}

/** Ensures deck render always has headline + bullets (e.g. payloads saved before keyTakeaways existed). */
export function normalizeOrganicReportingHighlights(raw: unknown): OrganicReportingHighlights | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.executiveSummary)) return null;
  const topOpportunities = sanitizeOpportunityList(o.topOpportunities);
  const fromApi = Array.isArray(o.keyTakeaways)
    ? o.keyTakeaways.filter((t) => isNonEmptyString(t)).map((t) => plainDeckText(String(t)))
    : [];
  const performanceNarrative = sanitizeNarrativeParagraphs(o.performanceNarrative, 3);
  const keywordNarrative = sanitizeNarrativeParagraphs(o.keywordNarrative, 2);

  if (fromApi.length >= 2) {
    return {
      executiveSummary: plainDeckText(o.executiveSummary),
      keyTakeaways: fromApi.slice(0, 4),
      performanceNarrative,
      keywordNarrative,
      topOpportunities,
    };
  }
  const derived = deriveKeyTakeawaysFromSummary(o.executiveSummary);
  const takeaways =
    fromApi.length === 1 ? [fromApi[0]!, ...derived.takeaways].slice(0, 4) : derived.takeaways;
  while (takeaways.length < 2) {
    takeaways.push("See performance summary and highlights below for detail.");
  }
  return {
    executiveSummary: derived.headline,
    keyTakeaways: takeaways.slice(0, 4).map(plainDeckText),
    performanceNarrative,
    keywordNarrative,
    topOpportunities,
  };
}

function sanitizeNarrativeParagraphs(raw: unknown, maxItems: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => isNonEmptyString(p))
    .map((p) => plainDeckText(String(p)))
    .slice(0, maxItems);
}

export type OrganicReportingHighlightsSnapshot = {
  siteName: string;
  siteUrl: string;
  showCompare: boolean;
  periods: {
    earlier: string;
    later: string;
  };
  ga4Rows: Array<{
    label: string;
    earlier: string;
    later: string;
    changePercent: number | null;
  }>;
  gscTotals: Array<{
    label: string;
    earlier: string;
    later: string;
    changePercent: number | null;
  }> | null;
  topQueries: Array<{
    query: string;
    earlierClicks: string;
    laterClicks: string;
    earlierImpressions: string;
    laterImpressions: string;
    avgPosition: string;
    clicksChangePercent: number | null;
    impressionsChangePercent: number | null;
  }>;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function buildOrganicReportingHighlightsSnapshot(
  viewModel: OrganicDashboardViewModel,
  siteName: string,
  siteUrl: string,
  showCompare: boolean,
): OrganicReportingHighlightsSnapshot {
  const ga4Rows = viewModel.ga4Table
    .filter((row) => ORGANIC_GA4_DECK_LABELS.has(row.label))
    .map((row) => ({
      label: row.label,
      earlier: row.previous,
      later: row.current,
      changePercent: row.delta.deltaPercent,
    }));

  const gsc = viewModel.gscSummary;
  const gscTotals = gsc
    ? [
        {
          label: "Total clicks (GSC)",
          earlier: gsc.compareClicks,
          later: gsc.clicks,
          changePercent: gsc.clicksDelta.deltaPercent,
        },
        {
          label: "Total impressions (GSC)",
          earlier: gsc.compareImpressions,
          later: gsc.impressions,
          changePercent: gsc.impressionsDelta.deltaPercent,
        },
        {
          label: "Average CTR (GSC)",
          earlier: gsc.compareCtr,
          later: gsc.ctr,
          changePercent: gsc.ctrDelta.deltaPercent,
        },
        {
          label: "Average position (GSC)",
          earlier: gsc.compareAvgPosition,
          later: gsc.avgPosition,
          changePercent: gsc.positionDelta.deltaPercent,
        },
      ]
    : null;

  const topQueries = viewModel.gscQueries.slice(0, 10).map((q) => ({
    query: q.query,
    earlierClicks: q.previousClicks,
    laterClicks: q.clicks,
    earlierImpressions: q.previousImpressions,
    laterImpressions: q.impressions,
    avgPosition: q.position,
    clicksChangePercent: q.clicksDelta.deltaPercent,
    impressionsChangePercent: q.impressionsDelta.deltaPercent,
  }));

  return {
    siteName,
    siteUrl,
    showCompare,
    periods: {
      earlier: viewModel.periodLabels.compare,
      later: viewModel.periodLabels.primary,
    },
    ga4Rows,
    gscTotals,
    topQueries,
  };
}

export function parseOrganicReportingHighlightsPayload(raw: string): OrganicReportingHighlights {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    const fence = raw.match(/\{[\s\S]*\}/);
    if (!fence) throw new Error("Highlights response was not valid JSON.");
    parsed = JSON.parse(fence[0]!);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Highlights JSON must be an object.");
  }
  const o = parsed as Record<string, unknown>;
  if (!isNonEmptyString(o.executiveSummary)) {
    throw new Error("Highlights missing executiveSummary.");
  }
  if (o.executiveSummary.length > 400) {
    throw new Error("executiveSummary exceeds allowed length.");
  }
  const takeawaysRaw = o.keyTakeaways;
  if (!Array.isArray(takeawaysRaw) || takeawaysRaw.length < 2 || takeawaysRaw.length > 4) {
    throw new Error("keyTakeaways must be an array of 2–4 strings.");
  }
  const keyTakeaways = takeawaysRaw
    .filter((t) => isNonEmptyString(t))
    .map((t) => plainDeckText(String(t)));
  if (keyTakeaways.length < 2) {
    throw new Error("keyTakeaways must include at least 2 non-empty strings.");
  }
  const narrativeRaw = o.performanceNarrative;
  if (!Array.isArray(narrativeRaw) || narrativeRaw.length < 2 || narrativeRaw.length > 3) {
    throw new Error("performanceNarrative must be an array of 2–3 strings.");
  }
  const performanceNarrative = narrativeRaw
    .filter((p) => isNonEmptyString(p))
    .map((p) => plainDeckText(String(p)));
  if (performanceNarrative.length < 2) {
    throw new Error("performanceNarrative must include at least 2 non-empty paragraphs.");
  }
  const keywordRaw = o.keywordNarrative;
  if (!Array.isArray(keywordRaw) || keywordRaw.length < 1 || keywordRaw.length > 2) {
    throw new Error("keywordNarrative must be an array of 1–2 strings.");
  }
  const keywordNarrative = keywordRaw
    .filter((p) => isNonEmptyString(p))
    .map((p) => plainDeckText(String(p)));
  if (keywordNarrative.length < 1) {
    throw new Error("keywordNarrative must include at least 1 non-empty paragraph.");
  }
  const top = o.topOpportunities;
  if (!Array.isArray(top)) throw new Error("topOpportunities must be an array.");
  if (top.length < 3 || top.length > 4) {
    throw new Error("topOpportunities must contain 3 or 4 items.");
  }

  const topOpportunities: OrganicDeckOpportunity[] = [];
  for (let i = 0; i < top.length; i++) {
    const row = top[i];
    if (!row || typeof row !== "object") throw new Error(`topOpportunities[${i}] invalid.`);
    const r = row as Record<string, unknown>;
    const rank = typeof r.rank === "number" ? r.rank : Number(r.rank);
    if (!Number.isFinite(rank)) throw new Error(`topOpportunities[${i}].rank invalid.`);
    if (!isNonEmptyString(r.label) || !isNonEmptyString(r.why)) {
      throw new Error(`topOpportunities[${i}] missing label or why.`);
    }
    const comparisonRows = sanitizeDeckOpportunityComparisonRows(r.comparisonRows);
    if (comparisonRows.length < 1) {
      throw new Error(`topOpportunities[${i}] missing comparisonRows.`);
    }
    let evidence: string[] | undefined;
    if (r.evidence != null) {
      if (!Array.isArray(r.evidence)) throw new Error(`topOpportunities[${i}].evidence must be an array.`);
      evidence = r.evidence.filter((e) => isNonEmptyString(e)).map((e) => plainDeckText(String(e)));
    }
    topOpportunities.push(
      sanitizeDeckOpportunity({
        rank,
        label: r.label,
        why: r.why,
        comparisonRows,
        metrics: typeof r.metrics === "string" ? r.metrics : "",
        action: typeof r.action === "string" ? r.action : "",
        evidence,
      }),
    );
  }

  return {
    executiveSummary: plainDeckText(o.executiveSummary),
    keyTakeaways,
    performanceNarrative: performanceNarrative.slice(0, 3),
    keywordNarrative: keywordNarrative.slice(0, 2),
    topOpportunities,
  };
}

/** Clean client-facing summary while the report agent finishes (no internal status jargon). */
export function buildPlaceholderOrganicReportingHighlights(
  siteName: string,
  viewModel?: OrganicDashboardViewModel,
): OrganicReportingHighlights {
  const name = siteName.trim() || "This site";
  const takeaways: string[] = [];
  const sessionsRow = viewModel?.ga4Table.find((r) => r.label === "Organic Search sessions");
  if (sessionsRow && sessionsRow.current !== "—") {
    takeaways.push(
      `GA4 Organic Search recorded ${sessionsRow.current} sessions in ${viewModel?.periodLabels.primary ?? "the primary period"}.`,
    );
  }
  if (viewModel?.gscSummary) {
    takeaways.push(
      `Google Search Console recorded ${viewModel.gscSummary.clicks} clicks and ${viewModel.gscSummary.impressions} impressions (${viewModel.gscSummary.ctr} CTR, avg. position ${viewModel.gscSummary.avgPosition}).`,
    );
  }
  if (takeaways.length < 2) {
    takeaways.push(
      "Headline GA4 organic traffic and Google Search Console visibility metrics are summarized in the tables below.",
      "Top organic search queries and period comparisons are detailed by section.",
    );
  }
  return {
    executiveSummary: `${name} organic search performance summary across GA4, Google Search Console, and Semrush.`,
    keyTakeaways: takeaways.slice(0, 4),
    performanceNarrative: [],
    keywordNarrative: [],
    topOpportunities: [],
  };
}

export function resolveClientReportHighlights(
  cached: OrganicReportingHighlights | undefined,
  siteName: string,
  viewModel?: OrganicDashboardViewModel,
): OrganicReportingHighlights {
  if (cached) {
    return cached;
  }
  return buildPlaceholderOrganicReportingHighlights(siteName, viewModel);
}

function organicReportingHighlightsRequestHeaders(): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = loadSemrushApiKeyForAppRequests();
  if (key) {
    headers["X-Semrush-Api-Key"] = key;
  }
  return headers;
}

export async function fetchOrganicReportingHighlights(
  snapshot: OrganicReportingHighlightsSnapshot,
  siteId: string,
  signal?: AbortSignal,
): Promise<OrganicReportingHighlights> {
  const response = await fetch(`${BACKEND_API_BASE}/api/organic-dashboard/reporting-highlights`, {
    method: "POST",
    credentials: "include",
    headers: organicReportingHighlightsRequestHeaders(),
    body: JSON.stringify({ siteId, snapshot }),
    signal,
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

  return parseOrganicReportingHighlightsPayload(JSON.stringify(data.highlights));
}
