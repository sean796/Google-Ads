import type {
  OrganicDashboardViewModel,
  OrganicGscMetricDelta,
} from "@/lib/organic-dashboard/organic-dashboard-view-model";

export {
  expandClientReportNarrativeParagraphs,
  cleanTakeawayBulletText,
  deckNarrativeText,
  parseDeckCountDisplay,
  plainDeckText,
  plainTextSummary,
  splitDeckSentences,
} from "@/lib/organic-dashboard/organic-client-report-deck-text";
export {
  dedupeOrganicComparisonRows,
  layoutOpportunityComparisonRows,
  parseOpportunityRowMetric,
  sanitizeDeckOpportunityComparisonRows,
} from "@/lib/organic-dashboard/organic-client-report-deck-opportunity";
export type {
  DeckOpportunityComparisonRow,
  OpportunityComparisonLayout,
  OpportunityQueryGridRow,
  SanitizedDeckOpportunity,
} from "@/lib/organic-dashboard/organic-client-report-deck-opportunity";
export {
  deriveKeyTakeawaysFromSummary,
  filterHighlightsTakeaways,
  isNonExistentSectionOmissionStatement,
  sanitizeDeckOpportunity,
  sanitizeExecutiveSummaryText,
  stripNonExistentOmissionClauses,
} from "@/lib/organic-dashboard/organic-client-report-deck-omission";
export type { SectionExistenceFilterOptions } from "@/lib/organic-dashboard/organic-client-report-deck-omission";

export type DeckSummaryRow = {
  label: string;
  earlier: string;
  later: string;
  delta: OrganicGscMetricDelta;
};

export type DeckHighlightAccent = "primary" | "clicks" | "impressions";

export type DeckHighlightStat = {
  label: string;
  value: string;
  delta: OrganicGscMetricDelta;
  accent: DeckHighlightAccent;
};

/** GA4 User acquisition rows (firstUserDefaultChannelGroup = Organic Search). */
export const ORGANIC_GA4_USER_ACQ_LABELS = new Set([
  "Total users",
  "New users",
  "User key event rate",
  "Key events",
]);

/** GA4 rows shown on the client deck (organic channel only, no site-wide duplicates). */
export const ORGANIC_GA4_DECK_LABELS = new Set([
  "Organic Search sessions",
  "Engaged sessions",
  "Engagement rate",
  "Key events (Organic Search sessions)",
]);

/** Client-facing GA4 row labels (tables are already organic / GA4 scoped). */
export function organicGa4ClientDisplayLabel(label: string): string {
  if (label === "Organic Search sessions") return "Sessions";
  if (label === "Key events (Organic Search sessions)") return "Key events";
  return label;
}

/** Highlight / opportunity tables: drop redundant source tags like (GSC) and organic GA4 parens. */
export function clientReportHighlightMetricLabel(metric: string): string {
  const ga4 = organicGa4ClientDisplayLabel(metric.trim());
  return ga4.replace(/\s*\(GSC\)\s*$/i, "").trim();
}

export function buildHeadlineSummaryRows(
  viewModel: OrganicDashboardViewModel,
  showCompare: boolean,
): DeckSummaryRow[] {
  const emptyDelta = { deltaPercent: null, deltaPositive: null };
  const rows: DeckSummaryRow[] = [];
  const hasUserAcqRows = viewModel.ga4Table.some((r) => ORGANIC_GA4_USER_ACQ_LABELS.has(r.label));
  const allowedGa4Labels = hasUserAcqRows ? ORGANIC_GA4_USER_ACQ_LABELS : ORGANIC_GA4_DECK_LABELS;

  for (const r of viewModel.ga4Table) {
    if (!allowedGa4Labels.has(r.label)) continue;
    rows.push({
      label: organicGa4ClientDisplayLabel(r.label),
      earlier: r.previous,
      later: r.current,
      delta: showCompare ? r.delta : emptyDelta,
    });
  }

  const gsc = viewModel.gscSummary;
  if (gsc) {
    rows.push(
      {
        label: "Total clicks",
        earlier: gsc.compareClicks,
        later: gsc.clicks,
        delta: showCompare ? gsc.clicksDelta : emptyDelta,
      },
      {
        label: "Total impressions",
        earlier: gsc.compareImpressions,
        later: gsc.impressions,
        delta: showCompare ? gsc.impressionsDelta : emptyDelta,
      },
      {
        label: "Average CTR",
        earlier: gsc.compareCtr,
        later: gsc.ctr,
        delta: showCompare ? gsc.ctrDelta : emptyDelta,
      },
      {
        label: "Average position",
        earlier: gsc.compareAvgPosition,
        later: gsc.avgPosition,
        delta: showCompare ? gsc.positionDelta : emptyDelta,
      },
    );
  }

  return rows;
}

export function buildGoogleAdsDeckSummaryRows(
  viewModel: OrganicDashboardViewModel,
  showCompare: boolean,
): DeckSummaryRow[] {
  if (!viewModel.hasGoogleAds || !viewModel.googleAdsSummary) return [];
  const emptyDelta = { deltaPercent: null, deltaPositive: null };
  const s = viewModel.googleAdsSummary;
  return [
    {
      label: "Leads",
      earlier: s.compareLeads,
      later: s.leads,
      delta: showCompare ? s.leadsDelta : emptyDelta,
    },
    {
      label: "Cost per lead",
      earlier: s.compareCostPerLead,
      later: s.costPerLead,
      delta: showCompare ? s.costPerLeadDelta : emptyDelta,
    },
    {
      label: "Spend",
      earlier: s.compareSpend,
      later: s.spend,
      delta: showCompare ? s.spendDelta : emptyDelta,
    },
    {
      label: "Clicks",
      earlier: s.compareClicks,
      later: s.clicks,
      delta: showCompare ? s.clicksDelta : emptyDelta,
    },
  ];
}

export function buildSemrushDeckSummaryRows(
  viewModel: OrganicDashboardViewModel,
  showCompare: boolean,
): DeckSummaryRow[] {
  const s = viewModel.semrushSummary;
  if (!s) return [];
  const emptyDelta = { deltaPercent: null, deltaPositive: null };
  const rows: DeckSummaryRow[] = [
    {
      label: "Keywords",
      earlier: s.compareKeywords,
      later: s.keywords,
      delta: showCompare ? s.keywordsDelta : emptyDelta,
    },
    {
      label: "Est. organic traffic",
      earlier: s.compareTraffic,
      later: s.traffic,
      delta: showCompare ? s.trafficDelta : emptyDelta,
    },
    {
      label: "Traffic cost",
      earlier: s.compareTrafficCost,
      later: s.trafficCost,
      delta: showCompare ? s.trafficCostDelta : emptyDelta,
    },
  ];
  if (s.hasBrandedMetrics) {
    rows.push(
      {
        label: "Branded traffic",
        earlier: s.compareBrandedTraffic,
        later: s.brandedTraffic,
        delta: showCompare ? s.brandedDelta : emptyDelta,
      },
      {
        label: "Non-branded traffic",
        earlier: s.compareNonBrandedTraffic,
        later: s.nonBrandedTraffic,
        delta: showCompare ? s.nonBrandedDelta : emptyDelta,
      },
    );
  }
  return rows;
}

export function splitHeadlineSummaryRows(rows: DeckSummaryRow[]): {
  traffic: DeckSummaryRow[];
  search: DeckSummaryRow[];
} {
  const searchLabels = new Set([
    "Total clicks",
    "Total impressions",
    "Average CTR",
    "Average position",
  ]);
  const traffic: DeckSummaryRow[] = [];
  const search: DeckSummaryRow[] = [];
  for (const row of rows) {
    if (searchLabels.has(row.label)) search.push(row);
    else traffic.push(row);
  }
  return { traffic, search };
}

function accentForLabel(label: string): DeckHighlightAccent {
  if (label === "Total clicks") return "clicks";
  if (label === "Total impressions") return "impressions";
  return "primary";
}

function deckHighlightChangePriority(label: string): number {
  if (label.includes("Key events")) return 100;
  if (label === "Engaged sessions") return 90;
  if (label.startsWith("Branded traffic")) return 85;
  if (label.startsWith("Non-branded traffic")) return 50;
  if (label === "Organic Search sessions") return 40;
  if (label === "Total clicks") return 30;
  if (label === "Total impressions") return 20;
  return 10;
}

/** Up to 3 headline KPIs with largest period change (for Highlights strip). */
export function pickDeckHighlightStats(
  viewModel: OrganicDashboardViewModel,
  showCompare: boolean,
): DeckHighlightStat[] {
  if (!showCompare) return [];

  const candidates: DeckHighlightStat[] = [];

  for (const r of viewModel.ga4Table) {
    if (r.delta.deltaPercent == null) continue;
    if (
      r.label === "Organic Search sessions" ||
      r.label === "Key events (Organic Search sessions)" ||
      r.label === "Engaged sessions"
    ) {
      candidates.push({
        label: organicGa4ClientDisplayLabel(r.label),
        value: r.current,
        delta: r.delta,
        accent: "primary",
      });
    }
  }

  const semrush = viewModel.semrushSummary;
  if (semrush?.hasBrandedMetrics) {
    if (semrush.brandedDelta.deltaPercent != null) {
      candidates.push({
        label: "Branded traffic (Semrush est.)",
        value: semrush.brandedTraffic,
        delta: semrush.brandedDelta,
        accent: "primary",
      });
    }
    if (semrush.nonBrandedDelta.deltaPercent != null) {
      candidates.push({
        label: "Non-branded traffic (Semrush est.)",
        value: semrush.nonBrandedTraffic,
        delta: semrush.nonBrandedDelta,
        accent: "primary",
      });
    }
  }

  const gsc = viewModel.gscSummary;
  if (gsc) {
    if (gsc.clicksDelta.deltaPercent != null) {
      candidates.push({
        label: "Total clicks",
        value: gsc.clicks,
        delta: gsc.clicksDelta,
        accent: "clicks",
      });
    }
    if (gsc.impressionsDelta.deltaPercent != null) {
      candidates.push({
        label: "Total impressions",
        value: gsc.impressions,
        delta: gsc.impressionsDelta,
        accent: "impressions",
      });
    }
  }

  const ranked = [...candidates].sort((a, b) => {
    const priorityDiff =
      deckHighlightChangePriority(b.label) - deckHighlightChangePriority(a.label);
    if (priorityDiff !== 0) return priorityDiff;
    return (b.delta.deltaPercent ?? 0) - (a.delta.deltaPercent ?? 0);
  });

  const picked: DeckHighlightStat[] = [];
  const seenLabels = new Set<string>();
  for (const c of ranked) {
    if (picked.length >= 3) break;
    if (seenLabels.has(c.label)) continue;
    seenLabels.add(c.label);
    picked.push({ ...c, accent: accentForLabel(c.label) });
  }
  return picked;
}
