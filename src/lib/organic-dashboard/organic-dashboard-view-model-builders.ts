import { pickGa4OrganicAcquisition, type GA4ReportData } from "@/components/integrations/types";
import {
  formatCanadianCompactNumber,
  formatCanadianNumber,
} from "@/lib/gsc-reporting/gsc-number-format";
import type {
  OrganicDashboardGscHistorical,
  OrganicDashboardGscStats,
  OrganicDashboardGscTimeseriesPoint,
  OrganicDashboardSemrushMetrics,
  OrganicDashboardSemrushStats,
} from "@/lib/organic-dashboard/organic-dashboard-types";
import type {
  OrganicChartPoint,
  OrganicGa4TableRow,
  OrganicGscMetricDelta,
  OrganicGscQueryRow,
  OrganicGscSummary,
  OrganicSemrushKeywordRow,
  OrganicSemrushSummary,
} from "@/lib/organic-dashboard/organic-dashboard-view-model-types";

const EM = "—";
const EMPTY_DELTA: OrganicGscMetricDelta = { deltaPercent: null, deltaPositive: null };

function fmtInt(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? EM : formatCanadianNumber(Math.round(n));
}

function fmtCount(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? EM : formatCanadianCompactNumber(Math.round(n));
}

function fmtPct(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? EM : `${n.toFixed(1)}%`;
}

function fmtPosition(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? EM : n.toFixed(1);
}

function fmtTrafficCost(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? EM : `$${formatCanadianCompactNumber(Math.round(n))}`;
}

function deltaFromPercent(changePercent: number | null | undefined): OrganicGscMetricDelta {
  if (changePercent == null || !Number.isFinite(changePercent)) return EMPTY_DELTA;
  return { deltaPercent: Math.abs(changePercent), deltaPositive: changePercent >= 0 };
}

function deltaFromPair(current: number | undefined, previous: number | undefined): OrganicGscMetricDelta {
  if (
    current == null ||
    previous == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return EMPTY_DELTA;
  }
  return deltaFromPercent(((current - previous) / previous) * 100);
}

function monthInRange(monthKey: string, startYmd: string, endYmd: string): boolean {
  const start = startYmd.slice(0, 7);
  const end = endYmd.slice(0, 7);
  return monthKey >= start && monthKey <= end;
}

function formatGaMetricValue(val: number, format: "int" | "pct" | "sec"): string {
  if (format === "pct") return fmtPct(val * 100);
  if (format === "sec") return `${Math.round(val)}s`;
  return fmtInt(val);
}

export function buildGa4Table(ga: GA4ReportData | undefined, showCompare: boolean): OrganicGa4TableRow[] {
  const acq = ga ? pickGa4OrganicAcquisition(ga) : undefined;
  const users = ga?.organicUsers;
  if (!acq && !users) return [];
  const rows: Array<{ label: string; cur: number; prev: number; format: "int" | "pct" | "sec" }> = [];
  if (users) {
    rows.push(
      { label: "Total users", cur: users.current.totalUsers, prev: users.previous.totalUsers, format: "int" },
      { label: "New users", cur: users.current.newUsers, prev: users.previous.newUsers, format: "int" },
      { label: "User key event rate", cur: users.current.userKeyEventRate, prev: users.previous.userKeyEventRate, format: "pct" },
      { label: "Key events", cur: users.current.keyEvents, prev: users.previous.keyEvents, format: "int" },
    );
  }
  if (acq) {
    rows.push(
      { label: "Organic Search sessions", cur: acq.current.sessions, prev: acq.previous.sessions, format: "int" },
      { label: "Engaged sessions", cur: acq.current.engagedSessions, prev: acq.previous.engagedSessions, format: "int" },
      { label: "Engagement rate", cur: acq.current.engagementRate, prev: acq.previous.engagementRate, format: "pct" },
      { label: "Avg session duration", cur: acq.current.averageSessionDurationSec, prev: acq.previous.averageSessionDurationSec, format: "sec" },
      { label: "Key events (Organic Search sessions)", cur: acq.current.keyEvents, prev: acq.previous.keyEvents, format: "int" },
    );
  }
  return rows.map((r) => ({
    label: r.label,
    current: formatGaMetricValue(r.cur, r.format),
    previous: formatGaMetricValue(r.prev, r.format),
    delta: showCompare ? deltaFromPair(r.cur, r.prev) : EMPTY_DELTA,
  }));
}

export function buildGa4MonthlyChart(
  ga: GA4ReportData | undefined,
  primary: { startDate: string; endDate: string },
): OrganicChartPoint[] {
  const userMonths = ga?.organicUsersMonthly?.months ?? [];
  if (userMonths.length > 0) {
    return userMonths
      .filter((m) => monthInRange(m.yearMonth, primary.startDate, primary.endDate))
      .map((m) => ({ label: m.label || m.yearMonth, gaUsers: m.totalUsers }));
  }
  const months = ga?.organicTrafficAcquisitionMonthly?.months ?? [];
  return months
    .filter((m) => monthInRange(m.yearMonth, primary.startDate, primary.endDate))
    .map((m) => ({ label: m.label || m.yearMonth, gaSessions: m.sessions }));
}

function formatGscChartDateLabel(ymd: string): string {
  const parts = ymd.split("-");
  if (parts.length !== 3) return ymd;
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  return Number.isFinite(m) && Number.isFinite(d) ? `${m}/${d}` : ymd;
}

export function buildGscTrendFromDaily(gsc: OrganicDashboardGscStats | undefined): OrganicChartPoint[] {
  return (gsc?.timeseries ?? []).map((row) => ({
    label: formatGscChartDateLabel(row.date),
    gscClicks: row.clicks,
    gscImpressions: row.impressions,
    gscAvgPosition: row.avgPosition,
  }));
}

export function buildGscTrendMonthly(
  hist: OrganicDashboardGscHistorical | undefined,
  primary: { startDate: string; endDate: string },
): OrganicChartPoint[] {
  return (hist?.monthlyStats ?? [])
    .filter((m) => monthInRange(m.month, primary.startDate, primary.endDate))
    .map((m) => ({
      label: m.month,
      gscClicks: m.clicks ?? 0,
      gscImpressions: m.impressions,
      gscAvgPosition: m.avgPosition,
    }));
}

export function aggregateTimeseriesToMonthly(daily: OrganicDashboardGscTimeseriesPoint[]): OrganicChartPoint[] {
  const buckets = new Map<string, { clicks: number; impressions: number; pos: number; posW: number }>();
  for (const row of daily) {
    const mk = row.date.slice(0, 7);
    const b = buckets.get(mk) ?? { clicks: 0, impressions: 0, pos: 0, posW: 0 };
    b.clicks += row.clicks;
    b.impressions += row.impressions;
    const w = Math.max(1, row.impressions);
    b.pos += row.avgPosition * w;
    b.posW += w;
    buckets.set(mk, b);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, b]) => ({
      label: month,
      gscClicks: b.clicks,
      gscImpressions: b.impressions,
      gscAvgPosition: b.posW > 0 ? b.pos / b.posW : 0,
    }));
}

export function buildGscSummary(gsc: OrganicDashboardGscStats | undefined): OrganicGscSummary | null {
  const stats = gsc?.stats;
  const cur = stats?.currentPeriod;
  if (!cur) return null;
  const cmp = stats.comparisons;
  const posChange = cmp?.avgPositionChange;
  const positionDelta =
    posChange != null && Number.isFinite(posChange)
      ? { deltaPercent: Math.abs(cmp.avgPositionChangePercent ?? 0), deltaPositive: posChange <= 0 }
      : EMPTY_DELTA;
  const prev = stats.comparisonPeriod;
  return {
    clicks: fmtCount(cur.clicks),
    impressions: fmtCount(cur.impressions),
    ctr: fmtPct(cur.ctr * 100),
    avgPosition: fmtPosition(cur.avgPosition),
    compareClicks: fmtCount(prev?.clicks),
    compareImpressions: fmtCount(prev?.impressions),
    compareCtr: fmtPct((prev?.ctr ?? 0) * 100),
    compareAvgPosition: fmtPosition(prev?.avgPosition),
    clicksDelta: deltaFromPercent(cmp?.clicksChangePercent),
    impressionsDelta: deltaFromPercent(cmp?.impressionsChangePercent),
    ctrDelta: deltaFromPercent(cmp?.ctrChangePercent),
    positionDelta,
  };
}

function chartMetricNumber(value: number | null | undefined): number | undefined {
  return value == null || typeof value !== "number" || !Number.isFinite(value) ? undefined : value;
}

function lastDayOfMonthYm(monthYm: string): number {
  const [y, m] = monthYm.split("-").map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 31;
  return new Date(y, m, 0).getDate();
}

function appendSemrushRemainderMonthToTrend(
  trend: OrganicChartPoint[],
  semrush: OrganicDashboardSemrushStats | undefined,
  primary: { startDate: string; endDate: string },
): OrganicChartPoint[] {
  const current = semrush?.current;
  if (!current || !primary.endDate) return trend;
  const endMonth = primary.endDate.slice(0, 7);
  if (!monthInRange(endMonth, primary.startDate, primary.endDate)) return trend;

  const point: OrganicChartPoint = {
    label: endMonth,
    semrushTraffic: chartMetricNumber(current.organicTraffic),
    semrushKeywords: chartMetricNumber(current.organicKeywords),
    semrushTrafficCost: chartMetricNumber(current.trafficCost),
  };

  const idx = trend.findIndex((p) => p.label.slice(0, 7) === endMonth);
  const endDay = Number.parseInt(primary.endDate.slice(8, 10), 10);
  const monthEndsEarly =
    Number.isFinite(endDay) && endDay > 0 && endDay < lastDayOfMonthYm(endMonth);

  if (idx >= 0) {
    if (!monthEndsEarly) return trend;
    const copy = [...trend];
    copy[idx] = point;
    return copy;
  }

  return [...trend, point].sort((a, b) => a.label.localeCompare(b.label));
}

export function buildSemrushTrend(
  semrush: OrganicDashboardSemrushStats | undefined,
  primary?: { startDate: string; endDate: string },
): OrganicChartPoint[] {
  const history = [...(semrush?.history ?? [])].sort((a, b) => a.month.localeCompare(b.month));
  const fromHistory = history.map((row) => ({
    label: row.month,
    semrushTraffic: chartMetricNumber(row.organicTraffic),
    semrushKeywords: chartMetricNumber(row.organicKeywords),
    semrushTrafficCost: chartMetricNumber(row.trafficCost),
  }));
  if (!primary?.startDate || !primary?.endDate) return fromHistory;
  return appendSemrushRemainderMonthToTrend(fromHistory, semrush, primary);
}

function metricStrings(m: OrganicDashboardSemrushMetrics | null | undefined) {
  return {
    keywords: fmtCount(m?.organicKeywords),
    traffic: fmtCount(m?.organicTraffic),
    trafficCost: fmtTrafficCost(m?.trafficCost),
    branded: fmtCount(m?.brandedTraffic),
    nonBranded: fmtCount(m?.nonBrandedTraffic),
  };
}

export function buildSemrushSummary(
  semrush: OrganicDashboardSemrushStats | undefined,
  showCompare: boolean,
): OrganicSemrushSummary | null {
  const cur = semrush?.current;
  if (!cur) return null;
  const cmp = semrush?.compare;
  const comparisons = semrush?.comparisons;
  const curFmt = metricStrings(cur);
  const cmpFmt = metricStrings(cmp);
  const hasBranded =
    cur.brandedTraffic != null &&
    Number.isFinite(cur.brandedTraffic) &&
    cur.nonBrandedTraffic != null &&
    Number.isFinite(cur.nonBrandedTraffic);

  return {
    keywords: curFmt.keywords,
    traffic: curFmt.traffic,
    trafficCost: curFmt.trafficCost,
    brandedTraffic: curFmt.branded,
    nonBrandedTraffic: curFmt.nonBranded,
    compareKeywords: cmpFmt.keywords,
    compareTraffic: cmpFmt.traffic,
    compareTrafficCost: cmpFmt.trafficCost,
    compareBrandedTraffic: cmpFmt.branded,
    compareNonBrandedTraffic: cmpFmt.nonBranded,
    keywordsDelta: showCompare ? deltaFromPercent(comparisons?.keywordsChangePercent) : EMPTY_DELTA,
    trafficDelta: showCompare ? deltaFromPercent(comparisons?.trafficChangePercent) : EMPTY_DELTA,
    trafficCostDelta: showCompare ? deltaFromPercent(comparisons?.trafficCostChangePercent) : EMPTY_DELTA,
    brandedDelta: showCompare ? deltaFromPair(cur.brandedTraffic ?? undefined, cmp?.brandedTraffic ?? undefined) : EMPTY_DELTA,
    nonBrandedDelta: showCompare ? deltaFromPair(cur.nonBrandedTraffic ?? undefined, cmp?.nonBrandedTraffic ?? undefined) : EMPTY_DELTA,
    hasBrandedMetrics: hasBranded,
  };
}

export function dedupeByNormalizedKey<T>(rows: T[], getKey: (row: T) => string, limit = 25): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const raw = getKey(row)?.trim() ?? "";
    if (!raw) continue;
    const norm = raw.toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

export function buildSemrushKeywords(semrush: OrganicDashboardSemrushStats | undefined): OrganicSemrushKeywordRow[] {
  const unique = dedupeByNormalizedKey(semrush?.topKeywords ?? [], (r) => r.phrase);
  return unique.map((row) => ({
    phrase: row.phrase.trim(),
    volume: fmtCount(row.volume),
    traffic: fmtCount(row.traffic),
    position: fmtPosition(row.position),
  }));
}

export function buildGscQueries(
  gsc: OrganicDashboardGscStats | undefined,
  showCompare: boolean,
): OrganicGscQueryRow[] {
  const sorted = [...(gsc?.stats?.topKeywords ?? [])].sort(
    (a, b) => (b.currentClicks ?? 0) - (a.currentClicks ?? 0),
  );
  const unique = dedupeByNormalizedKey(sorted, (r) => r.query);
  return unique.map((row) => ({
    query: row.query.trim(),
    clicks: fmtCount(row.currentClicks),
    previousClicks: fmtCount(row.previousClicks),
    clicksDelta: showCompare ? deltaFromPair(row.currentClicks, row.previousClicks) : EMPTY_DELTA,
    impressions: fmtCount(row.currentImpressions),
    previousImpressions: fmtCount(row.previousImpressions),
    impressionsDelta: showCompare ? deltaFromPair(row.currentImpressions, row.previousImpressions) : EMPTY_DELTA,
    position: fmtPosition(row.currentRanking),
  }));
}

