import { OrganicClientReportLocalGridMapSnapshot } from "@/components/organic-dashboard/OrganicClientReportLocalGridMapSnapshot";
import type { LocalGridClientReportSection } from "@/lib/organic-dashboard/local-grid-client-report";
import type {
  LocalGridDistanceMeasure,
  LocalGridScanSize,
  LocalGridShape,
} from "@/lib/local-grid-studio/local-grid-types";

export type OrganicClientReportLocalGridSectionProps = {
  section?: LocalGridClientReportSection;
  sections?: LocalGridClientReportSection[];
  narrative?: string[];
  overviewLoading?: boolean;
  overviewError?: string | null;
};

export function OrganicClientReportLocalGridSection({
  section,
  sections,
}: OrganicClientReportLocalGridSectionProps) {
  const list =
    sections && sections.length > 0
      ? sections
      : section
        ? [section]
        : [];
  if (list.length === 0) return null;

  const isSingleGrid = list.length === 1;

  return (
    <div
      className={
        isSingleGrid
          ? "organic-client-report-export__local-grid organic-client-report-export__local-grid--single flex flex-col gap-3"
          : "organic-client-report-export__local-grid grid grid-cols-2 gap-4"
      }
    >
      {list.map((item, idx) => {
        const { meta, evaluatedPins, previewNodes } = item;
        const headingLabel = meta.locationLabel?.trim() || meta.businessLabel?.trim() || "";
        return (
          <div
            key={`${meta.scanId}-${idx}`}
            className="organic-client-report-export__local-grid-item flex flex-col gap-1.5"
          >
            {headingLabel ? (
              <div
                className={
                  isSingleGrid
                    ? "mx-auto flex w-full max-w-[26rem] flex-wrap items-baseline justify-between gap-2"
                    : "mx-auto flex w-full max-w-[21.25rem] flex-wrap items-baseline justify-between gap-1.5"
                }
              >
                <h3 className="m-0 text-base font-semibold leading-snug text-[#18181b]">
                  {headingLabel}
                </h3>
                {meta.keyword ? (
                  <span className="text-base leading-snug text-[#52525b]">
                    {meta.keyword}
                  </span>
                ) : null}
              </div>
            ) : null}
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
          </div>
        );
      })}
    </div>
  );
}
