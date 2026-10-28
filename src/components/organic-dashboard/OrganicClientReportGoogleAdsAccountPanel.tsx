import { OrganicClientReportOverviewSlot } from "@/components/organic-dashboard/OrganicClientReportOverviewSlot";
import { EXPORT_LABEL_CLASS } from "@/components/organic-dashboard/organic-client-report-export-theme";
import type { OrganicGoogleAdsReportAccountCard } from "@/lib/organic-dashboard/organic-dashboard-google-ads";
import { buildGoogleAdsSparklineAreaPath } from "@/lib/organic-dashboard/organic-dashboard-google-ads";
import type { OrganicGscMetricDelta } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import {
  CLIENT_REPORT_DELTA_EMPTY,
  toExportTitleCase,
} from "@/lib/organic-dashboard/organic-client-report-copy";
import { cn } from "@/lib/utils";

const CHART_WIDTH = 640;
const CHART_HEIGHT = 88;

function ReportKpiDelta({
  delta,
  favorableWhenDown,
}: {
  delta: OrganicGscMetricDelta;
  favorableWhenDown?: boolean;
}) {
  if (delta.deltaPercent == null) {
    return <span className="text-[#52525b]">{CLIENT_REPORT_DELTA_EMPTY}</span>;
  }
  const up = delta.deltaPositive === true;
  const favorable = favorableWhenDown ? !up : up;
  return (
    <span
      className={cn(
        "text-base tabular-nums",
        favorable ? "organic-client-report-export__delta-positive" : "organic-client-report-export__delta-negative",
      )}
    >
      {up ? "▲" : "▼"} {delta.deltaPercent.toFixed(0)}%
    </span>
  );
}

export type OrganicClientReportGoogleAdsAccountPanelProps = {
  card: OrganicGoogleAdsReportAccountCard;
  narrative: string[];
  overviewLoading?: boolean;
  overviewError?: string | null;
};

export function OrganicClientReportGoogleAdsAccountPanel({
  card,
  narrative,
  overviewLoading = false,
  overviewError = null,
}: OrganicClientReportGoogleAdsAccountPanelProps) {
  const sparkline = buildGoogleAdsSparklineAreaPath(card.chartPoints, CHART_WIDTH, CHART_HEIGHT);
  const pacing = card.budgetPacing;

  return (
    <div className="organic-client-report-export__ads-account">
      <OrganicClientReportOverviewSlot
        heading=""
        paragraphs={narrative}
        loading={overviewLoading && narrative.length === 0}
        error={!overviewLoading && narrative.length === 0 ? overviewError : null}
      />

      <div className="organic-client-report-export__ads-account-card">
        <ul className="organic-client-report-export__ads-kpi-row">
          {card.kpis.map((kpi) => (
            <li key={kpi.label} className="organic-client-report-export__ads-kpi">
              <p className={EXPORT_LABEL_CLASS}>{toExportTitleCase(kpi.label)}</p>
              <p className="organic-client-report-export__ads-kpi-value tabular-nums">{kpi.value}</p>
              <ReportKpiDelta delta={kpi.delta} favorableWhenDown={kpi.favorableWhenDown} />
            </li>
          ))}
        </ul>

        {sparkline ? (
          <svg
            className="organic-client-report-export__ads-chart"
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Daily Google Ads spend trend"
          >
            <path className="organic-client-report-export__ads-chart-area" d={sparkline.areaPath} />
            <path className="organic-client-report-export__ads-chart-line" d={sparkline.linePath} fill="none" />
          </svg>
        ) : null}

        {pacing ? (
          <div className="organic-client-report-export__ads-budget">
            <p className="organic-client-report-export__ads-budget-caption">{pacing.caption}</p>
            <div className="organic-client-report-export__ads-budget-track">
              <div
                className="organic-client-report-export__ads-budget-fill"
                style={{ width: `${Math.round(pacing.spendRatio * 100)}%` }}
              />
              <div
                className="organic-client-report-export__ads-budget-time-marker"
                style={{ left: `${Math.round(pacing.timeRatio * 100)}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
