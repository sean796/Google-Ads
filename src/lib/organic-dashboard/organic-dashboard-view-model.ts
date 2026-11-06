import { semrushDomainOverviewUrl } from "@/lib/competitor-research/semrush-domain-overview-url";
import type { OrganicDashboardBundleResponse } from "@/lib/organic-dashboard/organic-dashboard-types";
import {
  buildGoogleAdsBudgetPacingDisplay,
  buildGoogleAdsDailyChart,
  buildGoogleAdsSummary,
  buildGoogleAdsTable,
  formatGoogleAdsLoadError,
  readOrganicGoogleAdsPayload,
} from "@/lib/organic-dashboard/organic-dashboard-google-ads";
import { isOrganicSkippedBlock } from "@/lib/organic-dashboard/organic-dashboard-types";
import { formatComparePeriodLabel } from "@/lib/reporting/reporting-date-presets";
import {
  buildOrganicPeriodProgressTables,
  reconcilePeriodProgressTablesForDeck,
  type OrganicPeriodProgressTables,
} from "@/lib/organic-dashboard/organic-dashboard-period-progress";
import {
  aggregateTimeseriesToMonthly,
  buildGa4MonthlyChart,
  buildGa4Table,
  buildGscQueries,
  buildGscSummary,
  buildGscTrendFromDaily,
  buildGscTrendMonthly,
  buildSemrushKeywords,
  buildSemrushSummary,
  buildSemrushTrend,
  dedupeByNormalizedKey,
} from "@/lib/organic-dashboard/organic-dashboard-view-model-builders";

import type {
  OrganicDashboardPeriodLabels,
  OrganicDashboardViewModel,
  OrganicDashboardViewModelOptions,
} from "@/lib/organic-dashboard/organic-dashboard-view-model-types";

export type {
  OrganicChartPoint,
  OrganicDashboardPeriodLabels,
  OrganicDashboardViewModel,
  OrganicDashboardViewModelOptions,
  OrganicGa4TableRow,
  OrganicGscMetricDelta,
  OrganicGscQueryRow,
  OrganicGscSummary,
  OrganicSemrushKeywordRow,
  OrganicSemrushSummary,
} from "@/lib/organic-dashboard/organic-dashboard-view-model-types";

export function buildOrganicDashboardViewModel(
  data: OrganicDashboardBundleResponse | undefined,
  options?: OrganicDashboardViewModelOptions,
): OrganicDashboardViewModel {
  const showCompare = options?.showCompare !== false;
  const primary = data?.meta?.primary ?? { startDate: "", endDate: "" };
  const compare = data?.meta?.compare ?? { startDate: "", endDate: "" };
  const ga4 = data?.ga4 && !isOrganicSkippedBlock(data.ga4) ? data.ga4 : undefined;
  const gsc = data?.gsc && !isOrganicSkippedBlock(data.gsc) ? data.gsc : undefined;
  const hist = data?.gscHistorical && !isOrganicSkippedBlock(data.gscHistorical) ? data.gscHistorical : undefined;
  const semrush = data?.semrush && !isOrganicSkippedBlock(data.semrush) ? data.semrush : undefined;
  const semrushDomain = semrush?.domain?.trim() ?? "";
  const semrushDatabase = semrush?.database?.trim() || "us";
  const semrushOverviewUrl =
    semrush?.overviewUrl?.trim() ||
    (semrushDomain ? semrushDomainOverviewUrl(semrushDomain, semrushDatabase) : "");
  const semrushLoadError =
    semrush?.errors && semrush.errors.length > 0 ? semrush.errors[0]?.message ?? null : null;

  const reportStructure: "compare" | "period_progress" =
    data?.meta?.reportStructure === "period_progress" ? "period_progress" : "compare";

  const googleAdsRaw = data?.googleAds;
  const googleAdsRead = readOrganicGoogleAdsPayload(googleAdsRaw);
  const googleAdsParsed = googleAdsRead.ok ? googleAdsRead.data : null;
  const googleAdsLoadError = googleAdsRead.ok
    ? null
    : formatGoogleAdsLoadError(googleAdsRaw, options?.googleAdsCustomerIdForReporting);
  const googleAdsSummary = googleAdsParsed
    ? buildGoogleAdsSummary(googleAdsParsed, showCompare)
    : null;
  const googleAdsTable = googleAdsSummary
    ? buildGoogleAdsTable(googleAdsSummary, showCompare)
    : [];
  const googleAdsDailyChart = googleAdsParsed
    ? buildGoogleAdsDailyChart(googleAdsParsed.dailySeries)
    : [];

  const periodLabels: OrganicDashboardPeriodLabels = {
    primary:
      primary.startDate && primary.endDate
        ? formatComparePeriodLabel(primary.startDate, primary.endDate)
        : "Current period",
    compare:
      compare.startDate && compare.endDate
        ? formatComparePeriodLabel(compare.startDate, compare.endDate)
        : "Compare period",
  };

  const googleAdsBudgetPacing = googleAdsParsed?.budgetPacing
    ? buildGoogleAdsBudgetPacingDisplay(
        googleAdsParsed.budgetPacing,
        googleAdsParsed.currencyCode,
        periodLabels.primary,
        primary.endDate || data?.meta?.fetchedAt?.slice(0, 10) || "",
      )
    : null;
  const hasGoogleAds = !!googleAdsSummary;

  const periodTotalColumnLabel =
    options?.periodTotalColumnLabel ??
    (periodLabels.primary !== "Current period" ? periodLabels.primary : "Total");

  const series = gsc?.timeseries ?? [];
  const ga4Table = buildGa4Table(ga4, showCompare);
  const gscTrendMonthly =
    series.length > 0 ? aggregateTimeseriesToMonthly(series) : buildGscTrendMonthly(hist, primary);
  const gscSummary = buildGscSummary(gsc);

  const partialVm = {
    ga4Table,
    ga4MonthlyChart: buildGa4MonthlyChart(ga4, primary),
    gscQueries: buildGscQueries(gsc, showCompare),
    gscTrendDaily: buildGscTrendFromDaily(gsc),
    gscTrendMonthly,
    gscSummary,
    semrushSummary: buildSemrushSummary(semrush, showCompare),
    semrushTrend: buildSemrushTrend(semrush, primary),
    semrushKeywords: buildSemrushKeywords(semrush),
    semrushOverviewUrl,
    semrushDomain,
    semrushDatabase,
    semrushLoadError,
    periodLabels,
    reportStructure,
    periodProgressTables: null as OrganicPeriodProgressTables | null,
    hasGa4: !!ga4,
    hasGsc: !!gsc?.stats,
    hasSemrush: !!semrush?.current || (semrush?.history?.length ?? 0) > 0,
    googleAdsSummary,
    googleAdsTable,
    googleAdsDailyChart,
    googleAdsLoadError,
    googleAdsBudgetPacing,
    hasGoogleAds,
  };
  const periodProgressTables = buildOrganicPeriodProgressTables(
    ga4,
    primary,
    partialVm,
    periodTotalColumnLabel,
  );
  return {
    ...partialVm,
    periodProgressTables,
  };
}

/** Backfill arrays and Semrush fields on deck payloads saved before view-model shape grew. */
export function normalizeOrganicDashboardViewModelForDeck(raw: unknown): OrganicDashboardViewModel {
  const defaults = buildOrganicDashboardViewModel(undefined);
  if (!raw || typeof raw !== "object") return defaults;
  const r = raw as Partial<OrganicDashboardViewModel>;
  return {
    ...defaults,
    ...r,
    ga4Table: Array.isArray(r.ga4Table) ? r.ga4Table : defaults.ga4Table,
    ga4MonthlyChart: Array.isArray(r.ga4MonthlyChart) ? r.ga4MonthlyChart : defaults.ga4MonthlyChart,
    gscQueries: Array.isArray(r.gscQueries) ? dedupeByNormalizedKey(r.gscQueries, (q) => q.query) : defaults.gscQueries,
    gscTrendDaily: Array.isArray(r.gscTrendDaily) ? r.gscTrendDaily : defaults.gscTrendDaily,
    gscTrendMonthly: Array.isArray(r.gscTrendMonthly) ? r.gscTrendMonthly : defaults.gscTrendMonthly,
    semrushKeywords: Array.isArray(r.semrushKeywords)
      ? dedupeByNormalizedKey(r.semrushKeywords, (k) => k.phrase)
      : defaults.semrushKeywords,
    semrushTrend: Array.isArray(r.semrushTrend) ? r.semrushTrend : defaults.semrushTrend,
    periodLabels:
      r.periodLabels && typeof r.periodLabels === "object"
        ? {
            primary: typeof r.periodLabels.primary === "string" ? r.periodLabels.primary : defaults.periodLabels.primary,
            compare: typeof r.periodLabels.compare === "string" ? r.periodLabels.compare : defaults.periodLabels.compare,
          }
        : defaults.periodLabels,
    gscSummary: r.gscSummary !== undefined ? r.gscSummary : defaults.gscSummary,
    semrushSummary: r.semrushSummary !== undefined ? r.semrushSummary : defaults.semrushSummary,
    semrushOverviewUrl: typeof r.semrushOverviewUrl === "string" ? r.semrushOverviewUrl : defaults.semrushOverviewUrl,
    semrushDomain: typeof r.semrushDomain === "string" ? r.semrushDomain : defaults.semrushDomain,
    semrushDatabase: typeof r.semrushDatabase === "string" ? r.semrushDatabase : defaults.semrushDatabase,
    semrushLoadError:
      r.semrushLoadError !== undefined ? r.semrushLoadError : defaults.semrushLoadError,
    hasGa4: typeof r.hasGa4 === "boolean" ? r.hasGa4 : defaults.hasGa4,
    hasGsc: typeof r.hasGsc === "boolean" ? r.hasGsc : defaults.hasGsc,
    hasSemrush: typeof r.hasSemrush === "boolean" ? r.hasSemrush : defaults.hasSemrush,
    googleAdsSummary: r.googleAdsSummary !== undefined ? r.googleAdsSummary : defaults.googleAdsSummary,
    googleAdsTable: Array.isArray(r.googleAdsTable) ? r.googleAdsTable : defaults.googleAdsTable,
    googleAdsDailyChart: Array.isArray(r.googleAdsDailyChart)
      ? r.googleAdsDailyChart
      : defaults.googleAdsDailyChart,
    googleAdsLoadError:
      r.googleAdsLoadError !== undefined ? r.googleAdsLoadError : defaults.googleAdsLoadError,
    googleAdsBudgetPacing:
      r.googleAdsBudgetPacing !== undefined ? r.googleAdsBudgetPacing : defaults.googleAdsBudgetPacing,
    hasGoogleAds: typeof r.hasGoogleAds === "boolean" ? r.hasGoogleAds : defaults.hasGoogleAds,
    reportStructure:
      r.reportStructure === "period_progress" || r.reportStructure === "compare"
        ? r.reportStructure
        : defaults.reportStructure,
    periodProgressTables: reconcilePeriodProgressTablesForDeck({
      ...defaults,
      ...r,
      ga4Table: Array.isArray(r.ga4Table) ? r.ga4Table : defaults.ga4Table,
      gscTrendMonthly: Array.isArray(r.gscTrendMonthly) ? r.gscTrendMonthly : defaults.gscTrendMonthly,
      gscSummary: r.gscSummary !== undefined ? r.gscSummary : defaults.gscSummary,
      periodLabels:
        r.periodLabels && typeof r.periodLabels === "object"
          ? {
              primary:
                typeof r.periodLabels.primary === "string"
                  ? r.periodLabels.primary
                  : defaults.periodLabels.primary,
              compare:
                typeof r.periodLabels.compare === "string"
                  ? r.periodLabels.compare
                  : defaults.periodLabels.compare,
            }
          : defaults.periodLabels,
      periodProgressTables:
        r.periodProgressTables && typeof r.periodProgressTables === "object"
          ? r.periodProgressTables
          : null,
    }),
  };
}
