import { OrganicClientReportLocalGridMapSnapshot } from "@/components/organic-dashboard/OrganicClientReportLocalGridMapSnapshot";
import { OrganicClientReportOverviewSlot } from "@/components/organic-dashboard/OrganicClientReportOverviewSlot";
import {
  EXPORT_H3_CLASS,
  EXPORT_METRIC_TABLE_CLASS,
} from "@/components/organic-dashboard/organic-client-report-export-theme";
import type { LocalGridClientReportSection } from "@/lib/organic-dashboard/local-grid-client-report";
import type {
  LocalGridDistanceMeasure,
  LocalGridScanSize,
  LocalGridShape,
} from "@/lib/local-grid-studio/local-grid-types";
import type { DeckSummaryRow } from "@/lib/organic-dashboard/organic-client-report-deck-helpers";
import { toExportTitleCase } from "@/lib/organic-dashboard/organic-client-report-copy";

function ExportMetricTable({ rows }: { rows: DeckSummaryRow[] }) {
  if (rows.length === 0) return null;
  return (
    <table className={EXPORT_METRIC_TABLE_CLASS}>
      <thead>
        <tr>
          <th scope="col">{toExportTitleCase("Metric")}</th>
          <th scope="col">{toExportTitleCase("Value")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <td>{row.label}</td>
            <td className="tabular-nums font-semibold">{row.later}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export type OrganicClientReportLocalGridSectionProps = {
  section: LocalGridClientReportSection;
  narrative: string[];
  overviewLoading?: boolean;
  overviewError?: string | null;
};

export function OrganicClientReportLocalGridSection({
  section,
  narrative,
  overviewLoading = false,
  overviewError = null,
}: OrganicClientReportLocalGridSectionProps) {
  const { meta, summaryRows, evaluatedPins, previewNodes } = section;
  const explainerParagraph = narrative.slice(0, 1);

  return (
    <div className="organic-client-report-export__local-grid flex flex-col gap-4">
      <OrganicClientReportOverviewSlot
        heading=""
        paragraphs={explainerParagraph}
        loading={overviewLoading && explainerParagraph.length === 0}
        loadingLabel="Generating map summary…"
        error={!overviewLoading && explainerParagraph.length === 0 ? overviewError : null}
      />
      <div className="w-full">
        <OrganicClientReportLocalGridMapSnapshot
          siteId={meta.siteId}
          scanId={meta.scanId}
          evaluatedPins={evaluatedPins}
          previewNodes={previewNodes}
          reportGridMeta={{
            centerLat: meta.centerLat,
            centerLng: meta.centerLng,
            scanSize: meta.scanSize as LocalGridScanSize,
            shape: meta.shape as LocalGridShape,
            distance: meta.distance,
            distanceMeasure: meta.distanceMeasure as LocalGridDistanceMeasure,
          }}
        />
      </div>
      <div className="organic-client-report-export__metric-stack flex flex-col gap-2">
        <h3 className={EXPORT_H3_CLASS}>{toExportTitleCase("Map pack metrics")}</h3>
        <ExportMetricTable rows={summaryRows} />
      </div>
    </div>
  );
}
