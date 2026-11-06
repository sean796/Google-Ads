import { plainDeckText } from "@/lib/organic-dashboard/organic-client-report-deck-text";

export type DeckOpportunityComparisonRow = {
  metric: string;
  comparePeriodValue: string;
  primaryPeriodValue: string;
};

export type OpportunityQueryGridRow = {
  query: string;
  clicks: { compare: string; primary: string };
  impressions: { compare: string; primary: string };
  avgPosition: { compare: string; primary: string };
};

export type OpportunityComparisonLayout =
  | { kind: "flat"; rows: DeckOpportunityComparisonRow[] }
  | {
      kind: "query-grid";
      queryRows: OpportunityQueryGridRow[];
      siteRows: DeckOpportunityComparisonRow[];
    };

const OPPORTUNITY_QUERY_METRIC_COMMA =
  /^(.+?)\s*,\s*(clicks|impressions|average position|avg\.?\s*position|position)$/i;

type OpportunityMetricKind = "clicks" | "impressions" | "position";

function opportunityMetricKind(label: string): OpportunityMetricKind | null {
  const k = label.trim().toLowerCase();
  if (k === "clicks" || k.startsWith("click")) return "clicks";
  if (k === "impressions" || k.startsWith("impression")) return "impressions";
  if (k.includes("position")) return "position";
  return null;
}

function formatOpportunityMetricLabel(raw: string): string {
  const kind = opportunityMetricKind(raw);
  if (kind === "clicks") return "Clicks";
  if (kind === "impressions") return "Impressions";
  if (kind === "position") return "Avg. position";
  return raw.trim();
}

/** Parses model rows like `query|Clicks` or legacy `query , clicks`. */
export function parseOpportunityRowMetric(raw: string): { query: string | null; label: string } {
  const trimmed = raw.trim();
  const pipe = trimmed.indexOf("|");
  if (pipe > 0) {
    return {
      query: trimmed.slice(0, pipe).trim(),
      label: formatOpportunityMetricLabel(trimmed.slice(pipe + 1)),
    };
  }
  const comma = OPPORTUNITY_QUERY_METRIC_COMMA.exec(trimmed);
  if (comma) {
    return {
      query: comma[1]!.trim(),
      label: formatOpportunityMetricLabel(comma[2]!),
    };
  }
  return { query: null, label: trimmed };
}

function pairFromRow(row: DeckOpportunityComparisonRow | undefined): { compare: string; primary: string } {
  if (!row) return { compare: "—", primary: "—" };
  return { compare: row.comparePeriodValue, primary: row.primaryPeriodValue };
}

/** Query-level GSC rows become a Query × metrics grid; site-wide rows stay flat. */
export function layoutOpportunityComparisonRows(
  rows: DeckOpportunityComparisonRow[],
): OpportunityComparisonLayout {
  const siteRows: DeckOpportunityComparisonRow[] = [];
  const buckets = new Map<string, Partial<Record<OpportunityMetricKind, DeckOpportunityComparisonRow>>>();

  for (const row of rows) {
    const parsed = parseOpportunityRowMetric(row.metric);
    const kind = opportunityMetricKind(parsed.label);
    if (parsed.query && kind) {
      const bucket = buckets.get(parsed.query) ?? {};
      bucket[kind] = row;
      buckets.set(parsed.query, bucket);
    } else {
      siteRows.push({ ...row, metric: parsed.label });
    }
  }

  if (buckets.size === 0) {
    return { kind: "flat", rows };
  }

  const queryRows: OpportunityQueryGridRow[] = [...buckets.entries()].map(([query, cells]) => ({
    query,
    clicks: pairFromRow(cells.clicks),
    impressions: pairFromRow(cells.impressions),
    avgPosition: pairFromRow(cells.position),
  }));

  return { kind: "query-grid", queryRows, siteRows };
}

export type SanitizedDeckOpportunity = {
  rank: number;
  label: string;
  why: string;
  comparisonRows: DeckOpportunityComparisonRow[];
  /** @deprecated Legacy prose metrics; not shown when comparisonRows exist. */
  metrics: string;
  action: string;
  evidence?: string[];
};

const SITE_WIDE_GA4_METRIC_KEYS = new Set([
  "total users",
  "new users",
  "key events",
  "user key event rate",
]);

function comparisonRowDedupeKey(metric: string): string | null {
  const parsed = parseOpportunityRowMetric(metric);
  const k = parsed.label.trim().toLowerCase();
  if (parsed.query) return `${parsed.query.toLowerCase()}|${k}`;
  if (SITE_WIDE_GA4_METRIC_KEYS.has(k)) return null;
  if (k === "key events (organic search sessions)" || k.includes("organic search") && k.includes("key event")) {
    return "organic_key_events";
  }
  if (k === "clicks" || k.startsWith("click")) return "gsc_clicks";
  if (k === "impressions" || k.startsWith("impression")) return "gsc_impressions";
  if (k.includes("avg position") || k === "position") return "gsc_position";
  if (k.includes("ctr")) return "gsc_ctr";
  return k;
}

/** Drop site-wide GA4 metrics and duplicate row types (e.g. Key events + organic key events). */
export function dedupeOrganicComparisonRows(rows: DeckOpportunityComparisonRow[]): DeckOpportunityComparisonRow[] {
  const seen = new Set<string>();
  const out: DeckOpportunityComparisonRow[] = [];
  for (const row of rows) {
    const key = comparisonRowDedupeKey(row.metric);
    if (key == null || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= 6) break;
  }
  return out;
}

const COMPARISON_ROW_SLASH_SPLIT = /\s*\/\s*/;

function splitCombinedComparisonRow(row: DeckOpportunityComparisonRow): DeckOpportunityComparisonRow[] {
  const hasSlash =
    COMPARISON_ROW_SLASH_SPLIT.test(row.metric) ||
    COMPARISON_ROW_SLASH_SPLIT.test(row.comparePeriodValue) ||
    COMPARISON_ROW_SLASH_SPLIT.test(row.primaryPeriodValue);
  if (!hasSlash) return [row];

  const metricParts = row.metric.split(COMPARISON_ROW_SLASH_SPLIT).map((s) => s.trim()).filter(Boolean);
  const compareParts = row.comparePeriodValue.split(COMPARISON_ROW_SLASH_SPLIT).map((s) => s.trim());
  const primaryParts = row.primaryPeriodValue.split(COMPARISON_ROW_SLASH_SPLIT).map((s) => s.trim());
  const n = metricParts.length;
  if (n <= 1 || compareParts.length !== n || primaryParts.length !== n) {
    return [row];
  }

  let queryPrefix = "";
  const first = metricParts[0] ?? "";
  const commaIdx = first.lastIndexOf(",");
  if (commaIdx > 0 && n > 1 && !metricParts[1]?.includes(",")) {
    queryPrefix = `${first.slice(0, commaIdx + 1)} `;
  }

  const out: DeckOpportunityComparisonRow[] = [];
  for (let i = 0; i < n; i++) {
    let metric = metricParts[i] ?? "";
    if (i > 0 && queryPrefix && !metric.includes(",")) {
      metric = queryPrefix + metric;
    }
    const comparePeriodValue = compareParts[i] ?? "";
    const primaryPeriodValue = primaryParts[i] ?? "";
    if (!metric || !comparePeriodValue || !primaryPeriodValue) continue;
    out.push({ metric, comparePeriodValue, primaryPeriodValue });
  }
  return out.length > 0 ? out : [row];
}

export function sanitizeDeckOpportunityComparisonRows(raw: unknown): DeckOpportunityComparisonRow[] {
  if (!Array.isArray(raw)) return [];
  const out: DeckOpportunityComparisonRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.metric !== "string") continue;
    if (typeof r.comparePeriodValue !== "string" || typeof r.primaryPeriodValue !== "string") continue;
    const metric = plainDeckText(r.metric);
    const comparePeriodValue = plainDeckText(r.comparePeriodValue);
    const primaryPeriodValue = plainDeckText(r.primaryPeriodValue);
    if (!metric || !comparePeriodValue || !primaryPeriodValue) continue;
    for (const splitRow of splitCombinedComparisonRow({ metric, comparePeriodValue, primaryPeriodValue })) {
      out.push(splitRow);
      if (out.length >= 12) break;
    }
    if (out.length >= 12) break;
  }
  return dedupeOrganicComparisonRows(out);
}
