import { OrganicClientReportInlineText } from "@/components/organic-dashboard/OrganicClientReportInlineText";
import {
  EXPORT_BODY_CLASS,
  EXPORT_BODY_MUTED_CLASS,
  EXPORT_H3_CLASS,
  EXPORT_NARRATIVE_WELL_CLASS,
} from "@/components/organic-dashboard/organic-client-report-export-theme";
import { toExportTitleCase } from "@/lib/organic-dashboard/organic-client-report-copy";

export type OrganicClientReportOverviewSlotProps = {
  heading?: string;
  headingLevel?: "h2" | "h3";
  paragraphs: string[];
  loading?: boolean;
  loadingLabel?: string;
  error?: string | null;
};

export function OrganicClientReportOverviewSlot({
  heading = "Overview",
  headingLevel = "h3",
  paragraphs,
  loading = false,
  loadingLabel = "Generating overview…",
  error = null,
}: OrganicClientReportOverviewSlotProps) {
  const HeadingTag = headingLevel === "h2" ? "h2" : "h3";
  const headingClass =
    headingLevel === "h2" ? "organic-client-report-export__insights-title" : EXPORT_H3_CLASS;
  const headingText = heading ? toExportTitleCase(heading) : "";

  if (paragraphs.length > 0) {
    return (
      <div className={EXPORT_NARRATIVE_WELL_CLASS}>
        {headingText ? <HeadingTag className={headingClass}>{headingText}</HeadingTag> : null}
        {paragraphs.map((p, idx) => (
          <p key={`${idx}-${p.slice(0, 24)}`} className={EXPORT_BODY_CLASS}>
            <OrganicClientReportInlineText text={p} />
          </p>
        ))}
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="organic-client-report-export__overview-splash"
        aria-busy="true"
        aria-label="Generating overview"
      >
        {headingText ? <HeadingTag className={headingClass}>{headingText}</HeadingTag> : null}
        <div className="organic-client-report-export__overview-splash-body">
          <span className="organic-client-report-export__overview-splash-pulse" aria-hidden />
          <p className={EXPORT_BODY_MUTED_CLASS}>{loadingLabel}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={EXPORT_NARRATIVE_WELL_CLASS}>
        {headingText ? <HeadingTag className={headingClass}>{headingText}</HeadingTag> : null}
        <p className="text-base text-[#b91c1c]">{error}</p>
      </div>
    );
  }

  return null;
}
