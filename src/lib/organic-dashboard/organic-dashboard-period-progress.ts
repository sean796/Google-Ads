import { pickGa4OrganicAcquisition, type GA4ReportData } from "@/components/integrations/types";
import {
  ORGANIC_GA4_DECK_LABELS,
  organicGa4ClientDisplayLabel,
} from "@/lib/organic-dashboard/organic-client-report-deck-helpers";
import {
  formatCanadianCompactNumber,
  formatCanadianNumber,
} from "@/lib/gsc-reporting/gsc-number-format";
import { formatOrganicDashboardMonthColumn } from "@/lib/organic-dashboard/organic-dashboard-month-column-label";
import type { OrganicChartPoint, OrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";

export type OrganicPeriodProgressRow = {
  label: string;
  values: string[];
  periodTotal: string;
};

export type OrganicPeriodProgressTable = {
  title: string;
  monthLabels: string[];
  periodTotalColumnLabel: string;
  rows: OrganicPeriodProgressRow[];
};

export type OrganicPeriodProgressTables = {
  ga4: OrganicPeriodProgressTable | null;
  gsc: OrganicPeriodProgressTable | null;
};

const EM = "—";

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

function formatGaMetricValue(val: number, format: "int" | "pct" | "sec"): string {
  if (format === "pct") return fmtPct(val * 100);
  if (format === "sec") return `${Math.round(val)}s`;
  return fmtInt(val);
}

/** GA4 yearMonth is YYYYMM; GSC historical months use YYYY-MM. */
export function normalizeOrganicDashboardYearMonth(monthKey: string): string {
  const trimmed = monthKey.trim();
  if (/^\d{6}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}`;
  }
  return trimmed.length >= 7 ? trimmed.slice(0, 7) : trimmed;
}

function monthInRange(monthKey: string, startYmd: string, endYmd: string): boolean {
  const start = startYmd.slice(0, 7);
  const end = endYmd.slice(0, 7);
  const mk = normalizeOrganicDashboardYearMonth(monthKey);
  return mk >= start && mk <= end;
}

function formatMonthHeader(_label: string, yearMonth: string): string {
  return formatOrganicDashboardMonthColumn(yearMonth);
}

type Ga4RowSpec = {
  label: string;
  format: "int" | "pct" | "sec";
  usersField?: keyof {
    totalUsers: number;
    newUsers: number;
    userKeyEventRate: number;
    keyEvents: number;
  };
  acqField?: keyof {
    sessions: number;
    engagedSessions: number;
    engagementRate: number;
    averageSessionDurationSec: number;
    keyEvents: number;
  };
};

const GA4_PERIOD_ROW_SPECS: Ga4RowSpec[] = [
  { label: "Total users", format: "int", usersField: "totalUsers" },
  { label: "New users", format: "int", usersField: "newUsers" },
  { label: "User key event rate", format: "pct", usersField: "userKeyEventRate" },
  { label: "Key events", format: "int", usersField: "keyEvents" },
  { label: "Organic Search sessions", format: "int", acqField: "sessions" },
  { label: "Engaged sessions", format: "int", acqField: "engagedSessions" },
  { label: "Engagement rate", format: "pct", acqField: "engagementRate" },
  { label: "Avg session duration", format: "sec", acqField: "averageSessionDurationSec" },
  { label: "Key events (Organic Search sessions)", format: "int", acqField: "keyEvents" },
];

export function buildGa4PeriodProgressTable(
  ga: GA4ReportData | undefined,
  primary: { startDate: string; endDate: string },
  ga4Table: OrganicDashboardViewModel["ga4Table"],
  periodTotalColumnLabel: string,
): OrganicPeriodProgressTable | null {
  if (!ga) return null;
  const usersMonths = (ga.organicUsersMonthly?.months ?? []).filter((m) =>
    monthInRange(m.yearMonth, primary.startDate, primary.endDate),
  );
  const acqMonths = (ga.organicTrafficAcquisitionMonthly?.months ?? []).filter((m) =>
    monthInRange(m.yearMonth, primary.startDate, primary.endDate),
  );
  if (usersMonths.length === 0 && acqMonths.length === 0) return null;

  const monthKeys = new Map<string, string>();
  for (const m of usersMonths) {
    monthKeys.set(m.yearMonth, formatMonthHeader(m.label, m.yearMonth));
  }
  for (const m of acqMonths) {
    if (!monthKeys.has(m.yearMonth)) {
      monthKeys.set(m.yearMonth, formatMonthHeader(m.label, m.yearMonth));
    }
  }
  const orderedKeys = [...monthKeys.keys()].sort();
  const monthLabels = orderedKeys.map((k) => monthKeys.get(k)!);

  const usersByMonth = new Map(usersMonths.map((m) => [m.yearMonth, m]));
  const acqByMonth = new Map(acqMonths.map((m) => [m.yearMonth, m]));

  const tableLabels = new Set(ga4Table.map((r) => r.label));
  const specs = GA4_PERIOD_ROW_SPECS.filter(
    (s) =>
      ORGANIC_GA4_DECK_LABELS.has(s.label) &&
      tableLabels.has(s.label) &&
      (s.usersField ? usersByMonth.size > 0 : acqByMonth.size > 0),
  );
  if (specs.length === 0) return null;

  const totalsByLabel = new Map(ga4Table.map((r) => [r.label, r.current]));

  const rows: OrganicPeriodProgressRow[] = specs.map((spec) => {
    const values = orderedKeys.map((ym) => {
      if (spec.usersField) {
        const row = usersByMonth.get(ym);
        const n = row?.[spec.usersField];
        return n == null || !Number.isFinite(n) ? EM : formatGaMetricValue(n, spec.format);
      }
      const row = acqByMonth.get(ym);
      const n = row?.[spec.acqField!];
      return n == null || !Number.isFinite(n) ? EM : formatGaMetricValue(n, spec.format);
    });
    return {
      label: organicGa4ClientDisplayLabel(spec.label),
      values,
      periodTotal: totalsByLabel.get(spec.label) ?? EM,
    };
  });

  return {
    title: "Website traffic (GA4) by month",
    monthLabels,
    periodTotalColumnLabel,
    rows,
  };
}

function gscCtrPct(clicks: number, impressions: number): number | null {
  if (!Number.isFinite(clicks) || !Number.isFinite(impressions) || impressions <= 0) return null;
  return (clicks / impressions) * 100;
}

export function buildGscPeriodProgressTable(
  gscTrendMonthly: OrganicChartPoint[],
  gscSummary: OrganicDashboardViewModel["gscSummary"],
  periodTotalColumnLabel: string,
): OrganicPeriodProgressTable | null {
  if (gscTrendMonthly.length === 0) return null;

  const monthLabels = gscTrendMonthly.map((p) => formatOrganicDashboardMonthColumn(p.label));
  const clicksValues = gscTrendMonthly.map((p) => fmtCount(p.gscClicks));
  const impValues = gscTrendMonthly.map((p) => fmtCount(p.gscImpressions));
  const ctrValues = gscTrendMonthly.map((p) => {
    const ctr = gscCtrPct(p.gscClicks ?? 0, p.gscImpressions ?? 0);
    return ctr == null ? EM : fmtPct(ctr);
  });
  const posValues = gscTrendMonthly.map((p) => fmtPosition(p.gscAvgPosition));

  const rows: OrganicPeriodProgressRow[] = [
    {
      label: "Total clicks",
      values: clicksValues,
      periodTotal: gscSummary?.clicks ?? EM,
    },
    {
      label: "Total impressions",
      values: impValues,
      periodTotal: gscSummary?.impressions ?? EM,
    },
    {
      label: "Average CTR",
      values: ctrValues,
      periodTotal: gscSummary?.ctr ?? EM,
    },
    {
      label: "Average position",
      values: posValues,
      periodTotal: gscSummary?.avgPosition ?? EM,
    },
  ];

  return {
    title: "Search visibility (GSC) by month",
    monthLabels,
    periodTotalColumnLabel,
    rows,
  };
}

export function buildOrganicPeriodProgressTables(
  ga: GA4ReportData | undefined,
  primary: { startDate: string; endDate: string },
  viewModel: OrganicDashboardViewModel,
  periodTotalColumnLabel: string,
): OrganicPeriodProgressTables {
  return {
    ga4: buildGa4PeriodProgressTable(ga, primary, viewModel.ga4Table, periodTotalColumnLabel),
    gsc: buildGscPeriodProgressTable(viewModel.gscTrendMonthly, viewModel.gscSummary, periodTotalColumnLabel),
  };
}

/** Snapshot-friendly monthly progression (numbers as strings). */
export function serializePeriodProgressForSnapshot(tables: OrganicPeriodProgressTables | null): {
  ga4: OrganicPeriodProgressTable | null;
  gsc: OrganicPeriodProgressTable | null;
} | null {
  if (!tables) return null;
  return tables;
}

export function pickGa4FromViewModelBuild(
  data: { ga4?: GA4ReportData | { skipped: true } } | undefined,
): GA4ReportData | undefined {
  if (!data?.ga4 || "skipped" in data.ga4) return undefined;
  return data.ga4;
}

export function hasOrganicAcquisitionMonthly(ga: GA4ReportData | undefined): boolean {
  return !!pickGa4OrganicAcquisition(ga) || (ga?.organicUsersMonthly?.months?.length ?? 0) > 0;
}
