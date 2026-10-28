import type { OrganicPeriodProgressTable } from "@/lib/organic-dashboard/organic-dashboard-period-progress";
import type { OrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import { loadSemrushApiKeyForAppRequests } from "@/lib/api";
import { getOpenRouterApiKeyForApp } from "@/lib/openrouter-api-key-resolve";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import {
  deriveKeyTakeawaysFromSummary,
  filterHighlightsTakeaways,
  isNonExistentSectionOmissionStatement,
  stripNonExistentOmissionClauses,
  ORGANIC_GA4_DECK_LABELS,
  deckNarrativeText,
  plainDeckText,
  sanitizeDeckOpportunity,
  sanitizeDeckOpportunityComparisonRows,
  sanitizeExecutiveSummaryText,
  type SanitizedDeckOpportunity,
} from "@/lib/organic-dashboard/organic-client-report-deck-helpers";
import type { LocalGridReportingSnapshot } from "@/lib/organic-dashboard/local-grid-client-report";

export type OrganicDeckOpportunity = SanitizedDeckOpportunity;

export type OrganicReportingHighlights = {
  executiveSummary: string;
  keyTakeaways: string[];
  /** Client-facing GA4 + GSC narrative for the performance summary section (DeepSeek / report model). */
  performanceNarrative: string[];
  /** Keyword / query story for the keyword performance section (report model). */
  keywordNarrative: string[];
  /** Paid search narrative for the Google Ads account card in the client report. */
  googleAdsNarrative: string[];
  /** Local map grid overview when a saved Local Grid scan is on the latest report. */
  localGridNarrative: string[];
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
  const cleanSummary = sanitizeExecutiveSummaryText(String(o.executiveSummary));
  const topOpportunities = sanitizeOpportunityList(o.topOpportunities);
  const fromApi = Array.isArray(o.keyTakeaways)
    ? filterHighlightsTakeaways(
        o.keyTakeaways.filter((t) => isNonEmptyString(t)).map((t) => plainDeckText(String(t))),
      )
    : [];
  const performanceNarrative = sanitizeNarrativeParagraphs(o.performanceNarrative, 3);
  const keywordNarrative = sanitizeNarrativeParagraphs(o.keywordNarrative, 2);
  const googleAdsNarrative = sanitizeNarrativeParagraphs(o.googleAdsNarrative, 2);
  const localGridNarrative = sanitizeNarrativeParagraphs(o.localGridNarrative, 2);

  if (fromApi.length >= 2) {
    return {
      executiveSummary: cleanSummary,
      keyTakeaways: fromApi.slice(0, 4),
      performanceNarrative,
      keywordNarrative,
      googleAdsNarrative,
      localGridNarrative,
      topOpportunities,
    };
  }
  const derived = deriveKeyTakeawaysFromSummary(cleanSummary);
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
    googleAdsNarrative,
    localGridNarrative,
    topOpportunities,
  };
}

function sanitizeNarrativeParagraphs(raw: unknown, maxItems: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) =>
      isNonEmptyString(p)
        ? stripNonExistentOmissionClauses(deckNarrativeText(String(p)))
        : "",
    )
    .filter((p) => isNonEmptyString(p) && !isNonExistentSectionOmissionStatement(p))
    .slice(0, maxItems);
}

export type OrganicReportingHighlightsSnapshotPeriodQuery = {
  query: string;
  clicks: string;
  impressions: string;
  avgPosition: string;
};

export type OrganicReportingHighlightsSnapshotCompareQuery = {
  query: string;
  earlierClicks: string;
  laterClicks: string;
  earlierImpressions: string;
  laterImpressions: string;
  avgPosition: string;
  clicksChangePercent: number | null;
  impressionsChangePercent: number | null;
};

export type OrganicReportingHighlightsSnapshotMonthlyTable = {
  title: string;
  monthLabels: string[];
  periodTotalColumnLabel: string;
  rows: Array<{ label: string; months: string[]; periodTotal: string }>;
};

export type OrganicReportingHighlightsSnapshot = {
  siteName: string;
  siteUrl: string;
  showCompare: boolean;
  reportStructure: "compare" | "period_progress";
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
  topQueries: Array<
    OrganicReportingHighlightsSnapshotCompareQuery | OrganicReportingHighlightsSnapshotPeriodQuery
  >;
  periodTotals?: {
    ga4: Array<{ label: string; value: string }>;
    gsc: Array<{ label: string; value: string }> | null;
    googleAds?: Array<{ label: string; value: string }> | null;
  };
  monthlyProgression?: {
    ga4: OrganicReportingHighlightsSnapshotMonthlyTable | null;
    gsc: OrganicReportingHighlightsSnapshotMonthlyTable | null;
  };
  googleAdsTotals?: Array<{
    label: string;
    earlier: string;
    later: string;
    changePercent: number | null;
  }> | null;
  /** Budget pacing caption for the Google Ads account card (when available). */
  googleAdsBudgetCaption?: string | null;
  semrushBrandedTotals?: Array<{
    label: string;
    earlier: string;
    later: string;
    changePercent: number | null;
  }> | null;
  localGrid?: LocalGridReportingSnapshot | null;
  leadsTotals?: Array<{ label: string; value: string }> | null;
  leadsRoiHeadline?: string | null;
};

function buildLeadsSnapshotTotals(viewModel: OrganicDashboardViewModel): Array<{ label: string; value: string }> | null {
  if (!viewModel.hasLeads || !viewModel.leadsSummary) return null;
  const s = viewModel.leadsSummary;
  return [
    { label: "Organic inquiries (SEO)", value: s.organic.inquiries },
    { label: "Organic closed revenue", value: s.organic.wonRevenue },
    { label: "Paid inquiries (Google Ads)", value: s.paid.inquiries },
    { label: "Paid closed revenue (Google Ads)", value: s.paid.wonRevenue },
    { label: "Google Ads ROAS", value: s.paid.roas },
    { label: "Total closed sales revenue", value: s.blended.wonRevenue },
  ];
}

function serializePeriodProgressTableForSnapshot(
  table: OrganicPeriodProgressTable,
): OrganicReportingHighlightsSnapshotMonthlyTable {
  return {
    title: table.title,
    monthLabels: table.monthLabels,
    periodTotalColumnLabel: table.periodTotalColumnLabel,
    rows: table.rows.map((row) => ({
      label: row.label,
      months: row.values,
      periodTotal: row.periodTotal,
    })),
  };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function buildGoogleAdsSnapshotTotals(
  viewModel: OrganicDashboardViewModel,
  showCompare: boolean,
): OrganicReportingHighlightsSnapshot["googleAdsTotals"] {
  if (!viewModel.hasGoogleAds || !viewModel.googleAdsSummary) return null;
  const s = viewModel.googleAdsSummary;
  const rows = [
    {
      label: "Leads (Google Ads)",
      earlier: s.compareLeads,
      later: s.leads,
      changePercent: showCompare ? s.leadsDelta.deltaPercent : null,
    },
    {
      label: "Cost per lead (Google Ads)",
      earlier: s.compareCostPerLead,
      later: s.costPerLead,
      changePercent: showCompare ? s.costPerLeadDelta.deltaPercent : null,
    },
    {
      label: "Spend (Google Ads)",
      earlier: s.compareSpend,
      later: s.spend,
      changePercent: showCompare ? s.spendDelta.deltaPercent : null,
    },
    {
      label: "Clicks (Google Ads)",
      earlier: s.compareClicks,
      later: s.clicks,
      changePercent: showCompare ? s.clicksDelta.deltaPercent : null,
    },
  ];
  return rows;
}

function buildSemrushBrandedSnapshotTotals(
  viewModel: OrganicDashboardViewModel,
  showCompare: boolean,
): OrganicReportingHighlightsSnapshot["semrushBrandedTotals"] {
  const s = viewModel.semrushSummary;
  if (!s?.hasBrandedMetrics) return null;
  return [
    {
      label: "Branded traffic (Semrush est.)",
      earlier: showCompare ? s.compareBrandedTraffic : "n/a",
      later: s.brandedTraffic,
      changePercent: showCompare ? s.brandedDelta.deltaPercent : null,
    },
    {
      label: "Non-branded traffic (Semrush est.)",
      earlier: showCompare ? s.compareNonBrandedTraffic : "n/a",
      later: s.nonBrandedTraffic,
      changePercent: showCompare ? s.nonBrandedDelta.deltaPercent : null,
    },
  ];
}

export function buildOrganicReportingHighlightsSnapshot(
  viewModel: OrganicDashboardViewModel,
  siteName: string,
  siteUrl: string,
  showCompare: boolean,
  localGrid?: LocalGridReportingSnapshot | null,
): OrganicReportingHighlightsSnapshot {
  const semrushBrandedTotals = buildSemrushBrandedSnapshotTotals(viewModel, showCompare);
  const localGridBlock = localGrid ?? null;
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

  const reportStructure =
    viewModel.reportStructure === "period_progress" || !showCompare ? "period_progress" : "compare";
  const googleAdsTotalsRaw = buildGoogleAdsSnapshotTotals(viewModel, showCompare);

  if (reportStructure === "period_progress") {
    const topQueriesPeriod: OrganicReportingHighlightsSnapshotPeriodQuery[] = viewModel.gscQueries
      .slice(0, 10)
      .map((q) => ({
        query: q.query,
        clicks: q.clicks,
        impressions: q.impressions,
        avgPosition: q.position,
      }));

    const tables = viewModel.periodProgressTables;
    const monthlyProgression = tables
      ? {
          ga4: tables.ga4 ? serializePeriodProgressTableForSnapshot(tables.ga4) : null,
          gsc: tables.gsc ? serializePeriodProgressTableForSnapshot(tables.gsc) : null,
        }
      : undefined;

    return {
      siteName,
      siteUrl,
      showCompare: false,
      reportStructure: "period_progress",
      semrushBrandedTotals,
      localGrid: localGridBlock,
      periods: {
        earlier: "",
        later: viewModel.periodLabels.primary,
      },
      ga4Rows: ga4Rows.map((row) => ({
        ...row,
        earlier: "n/a",
        changePercent: null,
      })),
      gscTotals: gscTotals
        ? gscTotals.map((row) => ({
            ...row,
            earlier: "n/a",
            changePercent: null,
          }))
        : null,
      topQueries: topQueriesPeriod,
      periodTotals: {
        ga4: ga4Rows.map((row) => ({ label: row.label, value: row.later })),
        gsc: gscTotals ? gscTotals.map((row) => ({ label: row.label, value: row.later })) : null,
        googleAds: googleAdsTotalsRaw
          ? googleAdsTotalsRaw.map((row) => ({ label: row.label, value: row.later }))
          : null,
      },
      monthlyProgression,
      googleAdsTotals: googleAdsTotalsRaw
        ? googleAdsTotalsRaw.map((row) => ({
            ...row,
            earlier: "n/a",
            changePercent: null,
          }))
        : null,
      googleAdsBudgetCaption: viewModel.googleAdsBudgetPacing?.caption ?? null,
      leadsTotals: buildLeadsSnapshotTotals(viewModel),
      leadsRoiHeadline: viewModel.leadsSummary?.roiHeadline ?? null,
    };
  }

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
    showCompare: true,
    reportStructure: "compare",
    periods: {
      earlier: viewModel.periodLabels.compare,
      later: viewModel.periodLabels.primary,
    },
    ga4Rows,
    gscTotals,
    topQueries,
    googleAdsTotals: googleAdsTotalsRaw,
    googleAdsBudgetCaption: viewModel.googleAdsBudgetPacing?.caption ?? null,
    semrushBrandedTotals,
    localGrid: localGridBlock,
    leadsTotals: buildLeadsSnapshotTotals(viewModel),
    leadsRoiHeadline: viewModel.leadsSummary?.roiHeadline ?? null,
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
  const keyTakeaways = filterHighlightsTakeaways(
    takeawaysRaw.filter((t) => isNonEmptyString(t)).map((t) => plainDeckText(String(t))),
  );
  if (keyTakeaways.length < 2) {
    const derived = deriveKeyTakeawaysFromSummary(plainDeckText(o.executiveSummary)).takeaways;
    for (const d of derived) {
      if (keyTakeaways.length < 2 && !keyTakeaways.includes(d)) {
        keyTakeaways.push(d);
      }
    }
  }
  if (keyTakeaways.length < 2) {
    throw new Error("keyTakeaways must include at least 2 non-empty strings.");
  }
  const narrativeRaw = o.performanceNarrative;
  if (!Array.isArray(narrativeRaw) || narrativeRaw.length < 1 || narrativeRaw.length > 3) {
    throw new Error("performanceNarrative must be an array of 1–3 strings.");
  }
  const performanceNarrative = narrativeRaw
    .filter((p) => isNonEmptyString(p))
    .map((p) => deckNarrativeText(String(p)));
  if (performanceNarrative.length < 1) {
    throw new Error("performanceNarrative must include at least 1 non-empty paragraph.");
  }
  const keywordRaw = o.keywordNarrative;
  if (!Array.isArray(keywordRaw) || keywordRaw.length < 1 || keywordRaw.length > 2) {
    throw new Error("keywordNarrative must be an array of 1–2 strings.");
  }
  const keywordNarrative = keywordRaw
    .filter((p) => isNonEmptyString(p))
    .map((p) => deckNarrativeText(String(p)));
  if (keywordNarrative.length < 1) {
    throw new Error("keywordNarrative must include at least 1 non-empty paragraph.");
  }
  const googleAdsRaw = o.googleAdsNarrative;
  let googleAdsNarrative: string[] = [];
  if (googleAdsRaw != null) {
    if (!Array.isArray(googleAdsRaw) || googleAdsRaw.length > 2) {
      throw new Error("googleAdsNarrative must be an array of 0–2 strings.");
    }
    googleAdsNarrative = googleAdsRaw
      .filter((p) => isNonEmptyString(p))
      .map((p) => deckNarrativeText(String(p)))
      .slice(0, 2);
  }
  const localGridRaw = o.localGridNarrative;
  let localGridNarrative: string[] = [];
  if (localGridRaw != null) {
    if (!Array.isArray(localGridRaw) || localGridRaw.length > 2) {
      throw new Error("localGridNarrative must be an array of 0–2 strings.");
    }
    localGridNarrative = localGridRaw
      .filter((p) => isNonEmptyString(p))
      .map((p) => deckNarrativeText(String(p)))
      .slice(0, 2);
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
    googleAdsNarrative,
    localGridNarrative,
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
    const hasCompare = Boolean(viewModel?.hasCompare && viewModel?.showCompare);
    takeaways.push(
      "Headline GA4 organic traffic and Google Search Console visibility metrics are summarized in the tables below.",
      hasCompare
        ? "Top organic search queries and period comparisons are detailed by section."
        : "Top organic search queries and search visibility metrics are detailed by section.",
    );
  }
  const hasSemrush = Boolean(
    viewModel?.hasSemrush &&
      ((viewModel.semrushKeywords && viewModel.semrushKeywords.length > 0) ||
        (viewModel.semrushTable && viewModel.semrushTable.length > 0)),
  );
  const channelText = hasSemrush
    ? "GA4, Google Search Console, and Semrush"
    : "GA4 and Google Search Console";
  return {
    executiveSummary: `${name} organic search performance summary across ${channelText}.`,
    keyTakeaways: takeaways.slice(0, 4),
    performanceNarrative: [],
    keywordNarrative: [],
    googleAdsNarrative: [],
    localGridNarrative: [],
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
  const openRouterKey = getOpenRouterApiKeyForApp().trim();
  if (openRouterKey) {
    headers["X-OpenRouter-Api-Key"] = openRouterKey;
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
  const headers: Record<string, string> = {
    ...(organicReportingHighlightsRequestHeaders() as Record<string, string>),
  };
  if (options?.bypassCache) {
    headers["X-Neo-Pulse-Reporting-Highlights-Bypass-Cache"] = "1";
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
