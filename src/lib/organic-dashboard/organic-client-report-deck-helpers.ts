import type {
  OrganicDashboardViewModel,
  OrganicGscMetricDelta,
} from "@/lib/organic-dashboard/organic-dashboard-view-model";

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

const SITE_WIDE_GA4_METRIC_KEYS = new Set([
  "total users",
  "new users",
  "key events",
  "user key event rate",
]);

/** Sentence split that does not break on decimals (e.g. 40.6%). */
export function splitDeckSentences(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    buf += c;
    if (c !== "." && c !== "!" && c !== "?") continue;
    const prev = text[i - 1] ?? "";
    const next = text[i + 1];
    if (c === "." && /\d/.test(prev) && next != null && /\d/.test(next)) continue;
    if (next != null && next !== " " && next !== "\n" && i !== text.length - 1) continue;
    const trimmed = buf.trim();
    if (trimmed) out.push(trimmed);
    buf = "";
    while (text[i + 1] === " ") i++;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out.length > 0 ? out : [text.trim()];
}

export function plainDeckText(raw: string): string {
  return raw
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`/g, "")
    .replace(/#+\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strips leading bullet markers (e.g. •, -, *, 1.) from takeaway lines so that
 * custom list rendering or standard list markers don't result in duplicate or misaligned bullets.
 */
export function cleanTakeawayBulletText(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  let text = raw.trim();
  let prev = "";
  while (text !== prev) {
    prev = text;
    text = text
      .replace(/^[•\u2022\u2023\u25E6\u2043\u2219]\s*/, "")
      .replace(/^[-*]\s+/, "")
      .replace(/^\d+[\.\)]\s+/, "")
      .trim();
  }
  return text;
}

/** Model narrative fields: keep **bold** markers; no grammar or keyword rewriting. */
export function deckNarrativeText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

const CLIENT_REPORT_NARRATIVE_CHUNK_CHARS = 340;

/** Split long model paragraphs into shorter blocks for client report readability. */
export function expandClientReportNarrativeParagraphs(
  paragraphs: readonly string[],
  maxItems: number,
): string[] {
  if (maxItems < 1) return [];
  const out: string[] = [];

  for (const paragraph of paragraphs) {
    if (out.length >= maxItems) break;
    const text = paragraph.trim();
    if (!text) continue;

    if (text.length <= CLIENT_REPORT_NARRATIVE_CHUNK_CHARS) {
      out.push(text);
      continue;
    }

    const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
    if (sentences.length <= 1) {
      out.push(text);
      continue;
    }

    let chunk = "";
    for (const sentence of sentences) {
      const next = chunk ? `${chunk} ${sentence}` : sentence;
      if (next.length > CLIENT_REPORT_NARRATIVE_CHUNK_CHARS && chunk) {
        out.push(chunk.trim());
        chunk = sentence;
        if (out.length >= maxItems) break;
      } else {
        chunk = next;
      }
    }
    if (out.length < maxItems && chunk.trim()) {
      out.push(chunk.trim());
    }
  }

  return out.slice(0, maxItems);
}

/** @deprecated use plainDeckText */
export const plainTextSummary = plainDeckText;

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

export function sanitizeDeckOpportunity(row: {
  rank: number;
  label: string;
  why: string;
  comparisonRows?: DeckOpportunityComparisonRow[];
  metrics?: string;
  action?: string;
  evidence?: string[];
}): SanitizedDeckOpportunity {
  return {
    rank: row.rank,
    label: stripNonExistentOmissionClauses(plainDeckText(row.label)),
    why: stripNonExistentOmissionClauses(deckNarrativeText(row.why)),
    comparisonRows: row.comparisonRows ?? [],
    metrics: stripNonExistentOmissionClauses(plainDeckText(row.metrics ?? "")),
    action: stripNonExistentOmissionClauses(plainDeckText(row.action ?? "")),
    evidence: row.evidence
      ?.map((e) => stripNonExistentOmissionClauses(plainDeckText(e)))
      .filter((e) => Boolean(e) && !isNonExistentSectionOmissionStatement(e)),
  };
}

/**
 * Strips negative disclaimers / preamble clauses that report on things that do not exist,
 * such as absent comparison periods, missing key events, or zero conversions, while
 * preserving the valuable business insights that follow.
 *
 * Example:
 * "With no comparison period and no key events, the immediate opportunity for KWB lies in converting..."
 * -> "The immediate opportunity for KWB lies in converting..."
 */
export function stripNonExistentOmissionClauses(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  let text = raw.trim();
  if (!text) return "";

  if (isNonExistentSectionOmissionStatement(text)) {
    return "";
  }

  // 1. Starting preamble clauses about missing comparison period and/or missing key events/conversions
  const leadingPatterns = [
    // "With no comparison period and no key events, " / "Without a comparison period or conversions, "
    /^(?:with\s+)?(?:no|without(?:\s+a)?)\s+(?:comparison|prior|baseline|previous)\s+period(?:s)?(?:\s+(?:and|or|,)\s+(?:with\s+)?(?:no|zero|0)\s+(?:key\s+events?|conversions?))?,?\s*/i,
    // "With no key events and no comparison period, " / "Without key events or comparison period, "
    /^(?:with\s+)?(?:no|without(?:\s+a)?)\s+(?:key\s+events?|conversions?)(?:\s+(?:and|or|,)\s+(?:with\s+)?(?:no|zero|0)\s+(?:comparison|prior|baseline|previous)\s+period(?:s)?)?,?\s*/i,
    // "In the absence of a comparison period, " / "Given the lack of key events, "
    /^(?:in\s+the\s+absence\s+of|given\s+the\s+lack\s+of|since\s+there\s+is\s+no|as\s+there\s+is\s+no)\s+(?:(?:a\s+)?(?:comparison|prior|baseline|previous)\s+period(?:s)?|(?:key\s+events?|conversions?))[^,]*?,?\s*/i,
    // "Without a comparison period, " / "With no comparison period, "
    /^(?:without\s+a\s+comparison\s+period|with\s+no\s+comparison\s+period),?\s*/i,
    // "With no key events, " / "Without key events recorded, "
    /^(?:without\s+(?:key\s+events?|conversions?)(?:\s+recorded)?|with\s+no\s+(?:key\s+events?|conversions?)),?\s*/i,
  ];

  for (const pat of leadingPatterns) {
    if (pat.test(text)) {
      text = text.replace(pat, "").trim();
      break;
    }
  }

  // 2. Trailing/appended omission clauses (e.g. ", while recording no key events", ", with no key events reported")
  const trailingPatterns = [
    /,?\s*(?:while|and|although|despite)?\s*(?:recording|registering|tracking|logging|reporting|having)\s+(?:no|zero|0)\s+(?:key\s+events?|conversions?)[^.!?]*(?=[.!?]|$)/i,
    /,?\s*(?:while|and|although)\s+no\s+(?:key\s+events?|conversions?)\s+(?:were|are|have\s+been)\s+(?:recorded|tracked|registered|reported)[^.!?]*(?=[.!?]|$)/i,
    /,?\s*(?:with|having)\s+(?:no|zero|0)\s+(?:key\s+events?|conversions?)[^.!?]*(?=[.!?]|$)/i,
    /,?\s*(?:with|as\s+there\s+is|since\s+there\s+is)\s+no\s+(?:comparison|prior|baseline)\s+period[^.!?]*(?=[.!?]|$)/i,
    /,?\s*with\s+zero\s+(?:key\s+events?|conversions?)[^.!?]*(?=[.!?]|$)/i,
  ];

  for (const pat of trailingPatterns) {
    if (pat.test(text)) {
      text = text.replace(pat, "").trim();
    }
  }

  // 3. Clean up formatting
  text = text.replace(/^[,;:\s]+/, "").trim();
  text = text.replace(/[,;:\s]+(?=[.!?]|$)/, "").trim();

  // If text starts with lowercase letter after clause stripping, capitalize it
  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  if (isNonExistentSectionOmissionStatement(text)) {
    return "";
  }

  return text;
}

/**
 * Detects negative disclaimer sentences stating that a channel, section, comparison period,
 * or metric (such as key events/conversions) has no data, was not reported, is omitted,
 * or is unavailable.
 * Reports should only focus on sections and data that exist.
 */
export function isNonExistentSectionOmissionStatement(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const t = text.trim();
  if (!t) return false;

  // 1. Channel omission statements (Google Ads, Semrush, Local Map, etc.)
  const channel =
    /(?:google\s+ads|paid\s+search|semrush|local\s+grid|local\s+map|map\s+pack|local\s+falcon|tarp)/i;
  if (channel.test(t)) {
    const noChannelPattern =
      /\bno\s+(?:google\s+ads|paid\s+search|semrush|local\s+grid|local\s+map|map\s+pack|local\s+falcon|data\s+for\s+google\s+ads)[^.]*?(?:available|reported|recorded|supplied|provided|found|configured|tracked|data|figures?|totals?|metrics?|results?|included|active|inquiries|leads)/i;

    const channelNegativePattern =
      /\b(?:google\s+ads|paid\s+search|semrush|local\s+grid|local\s+map|map\s+pack|local\s+falcon)[^.]*?(?:(?:(?:is|was|are|were|has\s+been)\s+)?(?:omitted|unavailable|not\s+configured|not\s+available|not\s+connected|not\s+reported|not\s+tracked|not\s+supplied|not\s+provided|not\s+active|excluded)|returned\s+no\s+data|contained\s+no|is\s+omitted|omitted\s+from\s+this\s+report|was\s+not\s+recorded|were\s+not\s+recorded)/i;

    const omittedPattern =
      /(?:omitted\s+from\s+this\s+report|(?:not|no)\s+(?:data|metrics|figures|totals)\s+(?:are|is|were|was)?\s*(?:available|reported|found|supplied|provided)\s+for\s+(?:google\s+ads|paid\s+search|semrush|local\s+map|local\s+grid))/i;

    if (noChannelPattern.test(t) || channelNegativePattern.test(t) || omittedPattern.test(t)) {
      return true;
    }
  }

  // 2. Comparison period omission statements
  const comparisonOmission =
    /\b(?:no|without(?:\s+a)?)\s+(?:comparison|prior|baseline|historical)\s+(?:period|data)(?:s)?\s+(?:is|was|are|were)?\s*(?:available|provided|selected|recorded|tracked|configured|present|included|exists?)\b/i;
  const comparisonUnavailable =
    /\b(?:comparison|prior|baseline)\s+period\s+(?:is|was)\s+(?:not\s+available|unavailable|omitted|missing|not\s+provided)\b/i;
  const standaloneNoCompare =
    /^(?:with\s+no|without\s+a)\s+(?:comparison|prior|baseline)\s+period(?:,?\s*(?:trend|period-over-period|growth|comparison)[^.]*?)?[.!?]?$/i;

  if (
    comparisonOmission.test(t) ||
    comparisonUnavailable.test(t) ||
    standaloneNoCompare.test(t)
  ) {
    return true;
  }

  // 3. Key events / Conversions omission statements (disclaimers about 0 or unrecorded conversions)
  const noKeyEventsRecorded =
    /\bno\s+(?:key\s+events?|conversions?)\s+(?:were|are|have\s+been)\s+(?:recorded|tracked|registered|reported|logged)\b/i;
  const keyEventsZero =
    /\b(?:key\s+events?|conversions?)(?:\s+attributed\s+to[^,.]*?)?\s+(?:registered\s+at\s+zero|were\s+zero|at\s+zero|were\s+not\s+(?:recorded|tracked))\b/i;
  const noConversionsTracked =
    /\bno\s+conversions\s+(?:were|are)\s+tracked\b/i;
  const conversionTrackingAttention =
    /\bconversion\s+tracking\s+(?:or\s+landing\s+page\s+alignment\s+)?may\s+need\s+attention\b/i;
  const conversionTrackingInactive =
    /\b(?:conversion\s+tracking|key\s+event\s+tracking)\s+(?:is|was)\s+(?:not\s+configured|not\s+set\s+up|inactive|missing)\b/i;
  const recordedNoKeyEvents =
    /\b(?:recorded|registered|tracked|had)\s+(?:no|zero|0)\s+(?:key\s+events?|conversions?)\b/i;

  if (
    noKeyEventsRecorded.test(t) ||
    keyEventsZero.test(t) ||
    noConversionsTracked.test(t) ||
    conversionTrackingAttention.test(t) ||
    conversionTrackingInactive.test(t) ||
    recordedNoKeyEvents.test(t)
  ) {
    return true;
  }

  return false;
}

export type SectionExistenceFilterOptions = {
  siteName?: string;
  hasGoogleAds?: boolean;
  hasSemrush?: boolean;
  hasLocalGrid?: boolean;
};

/** Filters out negative omission disclaimers as well as references to channels that do not exist in the report. */
export function filterHighlightsTakeaways(
  takeaways: string[],
  options?: SectionExistenceFilterOptions,
): string[] {
  return takeaways
    .map((line) => {
      if (typeof line !== "string") return "";
      const cleaned = cleanTakeawayBulletText(line);
      return stripNonExistentOmissionClauses(cleaned);
    })
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (isNonExistentSectionOmissionStatement(t)) return false;

      if (options?.hasGoogleAds === false && /(?:google\s+ads|paid\s+search)/i.test(t)) {
        return false;
      }
      if (options?.hasSemrush === false && /semrush/i.test(t)) {
        return false;
      }
      if (
        options?.hasLocalGrid === false &&
        /(?:local\s+grid|local\s+map|map\s+pack|local\s+falcon|tarp)/i.test(t)
      ) {
        return false;
      }
      return true;
    });
}

/** Cleans executive summary text by stripping negative disclaimers and non-existent section references. */
export function sanitizeExecutiveSummaryText(
  summary: string,
  options?: SectionExistenceFilterOptions,
): string {
  const cleaned = plainDeckText(summary);
  if (!cleaned) return "";

  const sentences = splitDeckSentences(cleaned);
  const remaining = sentences
    .map((sentence) => stripNonExistentOmissionClauses(sentence))
    .filter((sentence) => {
      const s = sentence.trim();
      if (!s) return false;
      if (isNonExistentSectionOmissionStatement(s)) return false;
      if (options?.hasGoogleAds === false && /(?:google\s+ads|paid\s+search)/i.test(s)) {
        return false;
      }
      if (options?.hasSemrush === false && /semrush/i.test(s)) {
        return false;
      }
      if (
        options?.hasLocalGrid === false &&
        /(?:local\s+grid|local\s+map|map\s+pack|local\s+falcon|tarp)/i.test(s)
      ) {
        return false;
      }
      return true;
    });

  if (remaining.length > 0) {
    return remaining.join(" ");
  }

  const name = options?.siteName?.trim() || "Organic";
  return `${name} search performance summary across active channels.`;
}

/** Split legacy single-block executive copy into headline + bullets for deck hero. */
export function deriveKeyTakeawaysFromSummary(summary: string): {
  headline: string;
  takeaways: string[];
} {
  const cleaned = plainDeckText(summary);
  if (!cleaned) {
    return {
      headline: "Organic performance summary",
      takeaways: [
        "Website traffic and search visibility metrics are in the performance summary below.",
        "Traffic figures use GA4; search visibility uses Google Search Console.",
      ],
    };
  }
  const sentences = splitDeckSentences(cleaned)
    .map((s) => cleanTakeawayBulletText(stripNonExistentOmissionClauses(s)))
    .filter((s) => s.length > 0 && !isNonExistentSectionOmissionStatement(s));
  if (sentences.length >= 3) {
    return { headline: sentences[0]!, takeaways: sentences.slice(1, 5) };
  }
  if (sentences.length === 2) {
    return { headline: sentences[0]!, takeaways: [sentences[1]!] };
  }
  if (sentences.length === 1) {
    return {
      headline: sentences[0]!,
      takeaways: [
        "See the performance summary below for website traffic and search visibility details.",
        "Opportunity cards highlight queries and themes worth acting on next.",
      ],
    };
  }
  return {
    headline: "Organic performance summary",
    takeaways: [
      "See the performance summary below for website traffic and search visibility changes.",
      "Opportunity cards highlight queries and themes worth acting on next.",
    ],
  };
}

export function parseDeckCountDisplay(value: string): number {
  const t = value.trim().replace(/,/g, "");
  if (t.endsWith("K") || t.endsWith("k")) {
    const n = Number.parseFloat(t.slice(0, -1));
    return Number.isFinite(n) ? n * 1_000 : 0;
  }
  if (t.endsWith("M") || t.endsWith("m")) {
    const n = Number.parseFloat(t.slice(0, -1));
    return Number.isFinite(n) ? n * 1_000_000 : 0;
  }
  const n = Number.parseFloat(t.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function buildHeadlineSummaryRows(
  viewModel: OrganicDashboardViewModel,
  showCompare: boolean,
): DeckSummaryRow[] {
  const emptyDelta = { deltaPercent: null, deltaPositive: null };
  const rows: DeckSummaryRow[] = [];

  for (const r of viewModel.ga4Table) {
    if (!ORGANIC_GA4_DECK_LABELS.has(r.label)) continue;
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
