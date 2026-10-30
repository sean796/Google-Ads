import { adsCpa, adsPctDelta, microsToSpend } from "@/lib/ads-reporting/ads-reporting-metrics";
import { formatCanadianNumber } from "@/lib/gsc-reporting/gsc-number-format";
import type { OrganicGscMetricDelta } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import type {
  OrganicDashboardGoogleAdsDailyPoint,
  OrganicDashboardGoogleAdsPayload,
} from "@/lib/organic-dashboard/organic-dashboard-types";
import { isOrganicSkippedBlock } from "@/lib/organic-dashboard/organic-dashboard-types";

const EM = "—";
const EMPTY_DELTA: OrganicGscMetricDelta = { deltaPercent: null, deltaPositive: null };

export type OrganicGoogleAdsAccountMetrics = {
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  ctr: number;
  averageCpc: number;
};

export type OrganicGoogleAdsTableRow = {
  label: string;
  current: string;
  previous: string;
  delta: OrganicGscMetricDelta;
};

export type OrganicGoogleAdsSummary = {
  leads: string;
  compareLeads: string;
  leadsDelta: OrganicGscMetricDelta;
  costPerLead: string;
  compareCostPerLead: string;
  costPerLeadDelta: OrganicGscMetricDelta;
  spend: string;
  compareSpend: string;
  spendDelta: OrganicGscMetricDelta;
  clicks: string;
  compareClicks: string;
  clicksDelta: OrganicGscMetricDelta;
  currencyCode: string;
  customerId: string;
};

export type OrganicGoogleAdsChartPoint = {
  label: string;
  adsSpend?: number;
  adsConversions?: number;
};

function parseAccountMetrics(raw: unknown): OrganicGoogleAdsAccountMetrics | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  return {
    impressions: Number(m.impressions) || 0,
    clicks: Number(m.clicks) || 0,
    costMicros: Number(m.costMicros) || 0,
    conversions: Number(m.conversions) || 0,
    ctr: Number(m.ctr) || 0,
    averageCpc: Number(m.averageCpc) || 0,
  };
}

function deltaFromPercent(changePercent: number | null | undefined): OrganicGscMetricDelta {
  if (changePercent == null || !Number.isFinite(changePercent)) return EMPTY_DELTA;
  return { deltaPercent: Math.abs(changePercent), deltaPositive: changePercent >= 0 };
}

function deltaFromPair(current: number, previous: number): OrganicGscMetricDelta {
  const d = adsPctDelta(current, previous);
  if (d == null) return EMPTY_DELTA;
  return deltaFromPercent(d);
}

export function formatGoogleAdsMoney(amount: number, currencyCode: string): string {
  const rounded = Math.round(amount * 100) / 100;
  const body = formatCanadianNumber(rounded);
  if (currencyCode.toUpperCase() === "CAD") return `CA$${body}`;
  if (currencyCode.toUpperCase() === "USD") return `$${body}`;
  return `${currencyCode.toUpperCase()} ${body}`;
}

function fmtLeads(n: number): string {
  return formatCanadianNumber(Math.round(n * 10) / 10);
}

function fmtCpl(costMicros: number, conversions: number, currencyCode: string): string {
  const cpa = adsCpa(costMicros, conversions);
  if (cpa == null) return EM;
  return formatGoogleAdsMoney(cpa, currencyCode);
}

export function readOrganicGoogleAdsPayload(
  block: OrganicDashboardGoogleAdsPayload | undefined,
): { ok: true; data: NonNullable<ReturnType<typeof parseGoogleAdsSuccess>> } | { ok: false; error: string | null } {
  if (!block || isOrganicSkippedBlock(block)) {
    return { ok: false, error: isOrganicSkippedBlock(block) ? block.error ?? null : null };
  }
  const parsed = parseGoogleAdsSuccess(block);
  if (!parsed) return { ok: false, error: "Google Ads data unavailable." };
  return { ok: true, data: parsed };
}

function parseGoogleAdsSuccess(block: Exclude<OrganicDashboardGoogleAdsPayload, { skipped: true }>) {
  if (block.success !== true) return null;
  const account = parseAccountMetrics(block.account);
  if (!account) return null;
  const compareAccount = parseAccountMetrics(block.compareAccount) ?? {
    impressions: 0,
    clicks: 0,
    costMicros: 0,
    conversions: 0,
    ctr: 0,
    averageCpc: 0,
  };
  const currencyCode = typeof block.currencyCode === "string" ? block.currencyCode : "USD";
  const customerId = typeof block.customerId === "string" ? block.customerId : "";
  const dailySeries = Array.isArray(block.dailySeries) ? block.dailySeries : [];
  const budgetPacing = parseBudgetPacing(block.budgetPacing);
  return { account, compareAccount, currencyCode, customerId, dailySeries, budgetPacing };
}

function parseBudgetPacing(raw: unknown): OrganicGoogleAdsBudgetPacing | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const spendMicros = Number(o.spendMicros);
  const budgetMicros = Number(o.budgetMicros);
  const periodStart = typeof o.periodStart === "string" ? o.periodStart.trim() : "";
  const periodEnd = typeof o.periodEnd === "string" ? o.periodEnd.trim() : "";
  if (
    !Number.isFinite(spendMicros) ||
    !Number.isFinite(budgetMicros) ||
    budgetMicros <= 0 ||
    periodStart === "" ||
    periodEnd === ""
  ) {
    return null;
  }
  return { spendMicros, budgetMicros, periodStart, periodEnd };
}

export type OrganicGoogleAdsBudgetPacing = {
  spendMicros: number;
  budgetMicros: number;
  periodStart: string;
  periodEnd: string;
};

export type OrganicGoogleAdsBudgetPacingDisplay = {
  caption: string;
  spendRatio: number;
  timeRatio: number;
};

export type OrganicGoogleAdsReportKpi = {
  label: string;
  value: string;
  delta: OrganicGscMetricDelta;
  /** When true, a decrease shows as positive (green). Used for cost per lead. */
  favorableWhenDown?: boolean;
};

export type OrganicGoogleAdsReportAccountCard = {
  accountTitle: string;
  kpis: OrganicGoogleAdsReportKpi[];
  chartPoints: OrganicGoogleAdsChartPoint[];
  budgetPacing: OrganicGoogleAdsBudgetPacingDisplay | null;
  dataAsOf: string;
};

function inclusiveDaysBetween(startYmd: string, endYmd: string): number {
  const a = Date.parse(`${startYmd}T12:00:00`);
  const b = Date.parse(`${endYmd}T12:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.floor((b - a) / 86_400_000) + 1;
}

function clampRatio(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function buildGoogleAdsBudgetPacingDisplay(
  pacing: OrganicGoogleAdsBudgetPacing,
  currencyCode: string,
  periodCaption: string,
  asOfYmd: string,
): OrganicGoogleAdsBudgetPacingDisplay {
  const spend = microsToSpend(pacing.spendMicros);
  const budget = microsToSpend(pacing.budgetMicros);
  const spendRatio = clampRatio(pacing.spendMicros / pacing.budgetMicros);
  const periodDays = inclusiveDaysBetween(pacing.periodStart, pacing.periodEnd);
  const asOf = (typeof asOfYmd === "string" && asOfYmd.trim() ? asOfYmd : pacing.periodEnd).slice(
    0,
    10,
  );
  let elapsedDays = periodDays;
  if (asOf >= pacing.periodStart && asOf <= pacing.periodEnd) {
    elapsedDays = inclusiveDaysBetween(pacing.periodStart, asOf);
  } else if (asOf < pacing.periodStart) {
    elapsedDays = 0;
  }
  const timeRatio = periodDays > 0 ? clampRatio(elapsedDays / periodDays) : 1;
  const pct = Math.round(spendRatio * 100);
  return {
    caption: `${periodCaption}: ${formatGoogleAdsMoney(spend, currencyCode)} of ${formatGoogleAdsMoney(budget, currencyCode)} budget (${pct}%)`,
    spendRatio,
    timeRatio,
  };
}

export function buildGoogleAdsSparklineAreaPath(
  points: OrganicGoogleAdsChartPoint[],
  width: number,
  height: number,
): { areaPath: string; linePath: string } | null {
  const values = points.map((p) => p.adsSpend ?? 0);
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const padY = 4;
  const innerH = height - padY * 2;
  const step = width / (values.length - 1);
  const coords = values.map((v, i) => {
    const x = i * step;
    const y = padY + innerH - (v / max) * innerH;
    return { x, y };
  });
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${width.toFixed(1)} ${height.toFixed(1)} L 0 ${height.toFixed(1)} Z`;
  return { areaPath, linePath };
}

export function buildGoogleAdsReportAccountCard(args: {
  siteName: string;
  summary: OrganicGoogleAdsSummary;
  tableRows: OrganicGoogleAdsTableRow[];
  chartPoints: OrganicGoogleAdsChartPoint[];
  budgetPacing: OrganicGoogleAdsBudgetPacingDisplay | null;
  preparedOn: string;
  showCompare: boolean;
}): OrganicGoogleAdsReportAccountCard {
  const topLabels = ["Leads", "Cost per lead", "Spend"] as const;
  const compareRows = buildGoogleAdsTable(args.summary, args.showCompare);
  const kpis: OrganicGoogleAdsReportKpi[] = [];
  for (const label of topLabels) {
    const row = compareRows.find((r) => r.label === label);
    if (!row) continue;
    kpis.push({
      label,
      value: row.current,
      delta: row.delta,
      favorableWhenDown: label === "Cost per lead",
    });
  }
  return {
    accountTitle: args.siteName.trim() || "Google Ads account",
    kpis,
    chartPoints: args.chartPoints,
    budgetPacing: args.budgetPacing,
    dataAsOf: args.preparedOn.slice(0, 10),
  };
}

export function buildGoogleAdsSummary(
  payload: ReturnType<typeof parseGoogleAdsSuccess>,
  showCompare: boolean,
): OrganicGoogleAdsSummary | null {
  if (!payload) return null;
  const { account, compareAccount, currencyCode } = payload;
  const spend = microsToSpend(account.costMicros);
  const compareSpend = microsToSpend(compareAccount.costMicros);
  return {
    leads: fmtLeads(account.conversions),
    compareLeads: fmtLeads(compareAccount.conversions),
    leadsDelta: showCompare ? deltaFromPair(account.conversions, compareAccount.conversions) : EMPTY_DELTA,
    costPerLead: fmtCpl(account.costMicros, account.conversions, currencyCode),
    compareCostPerLead: fmtCpl(compareAccount.costMicros, compareAccount.conversions, currencyCode),
    costPerLeadDelta: (() => {
      if (!showCompare) return EMPTY_DELTA;
      const cur = adsCpa(account.costMicros, account.conversions);
      const prev = adsCpa(compareAccount.costMicros, compareAccount.conversions);
      if (cur == null || prev == null) return EMPTY_DELTA;
      return deltaFromPair(cur, prev);
    })(),
    spend: formatGoogleAdsMoney(spend, currencyCode),
    compareSpend: formatGoogleAdsMoney(compareSpend, currencyCode),
    spendDelta: showCompare ? deltaFromPair(spend, compareSpend) : EMPTY_DELTA,
    clicks: formatCanadianNumber(account.clicks),
    compareClicks: formatCanadianNumber(compareAccount.clicks),
    clicksDelta: showCompare ? deltaFromPair(account.clicks, compareAccount.clicks) : EMPTY_DELTA,
    currencyCode,
    customerId: payload.customerId,
  };
}

export function buildGoogleAdsTable(summary: OrganicGoogleAdsSummary | null, showCompare: boolean): OrganicGoogleAdsTableRow[] {
  if (!summary) return [];
  const emptyDelta = EMPTY_DELTA;
  return [
    {
      label: "Leads",
      current: summary.leads,
      previous: summary.compareLeads,
      delta: showCompare ? summary.leadsDelta : emptyDelta,
    },
    {
      label: "Cost per lead",
      current: summary.costPerLead,
      previous: summary.compareCostPerLead,
      delta: showCompare ? summary.costPerLeadDelta : emptyDelta,
    },
    {
      label: "Spend",
      current: summary.spend,
      previous: summary.compareSpend,
      delta: showCompare ? summary.spendDelta : emptyDelta,
    },
    {
      label: "Clicks",
      current: summary.clicks,
      previous: summary.compareClicks,
      delta: showCompare ? summary.clicksDelta : emptyDelta,
    },
  ];
}

export function buildGoogleAdsDailyChart(
  dailySeries: OrganicDashboardGoogleAdsDailyPoint[],
): OrganicGoogleAdsChartPoint[] {
  return dailySeries.map((row) => ({
    label: row.date.slice(5).replace("-", "/"),
    adsSpend: microsToSpend(row.costMicros),
    adsConversions: row.conversions,
  }));
}

export function formatGoogleAdsLoadError(
  raw: unknown,
  configuredCustomerId?: string | null,
): string | null {
  if (configuredCustomerId) {
    if (!raw) {
      return "Google Ads metrics could not be loaded.";
    }
    if (typeof raw === "object" && isOrganicSkippedBlock(raw)) {
      if (raw.reason === "missing_google_ads_customer_id") return null;
      const err = raw.error?.trim() ?? "";
      if (err) return err.replace(/\s+/g, " ").trim();
      return raw.reason ? `Google Ads unavailable (${raw.reason}).` : "Google Ads unavailable.";
    }
  }
  if (!raw || typeof raw !== "object" || !isOrganicSkippedBlock(raw)) return null;
  const reason = raw.reason?.trim() ?? "";
  if (reason === "missing_google_ads_customer_id" || reason === "partial_request") return null;
  const err = raw.error?.trim() ?? "";
  if (err) return err.replace(/\s+/g, " ").trim();
  return reason ? `Google Ads unavailable (${reason}).` : "Google Ads unavailable.";
}
