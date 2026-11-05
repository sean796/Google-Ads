
import {
  REPORTING_SECTION_TAB_ACTIVE,
  REPORTING_SECTION_TAB_INACTIVE,
} from "@/components/organic-dashboard/organic-reporting-toolbar-buttons";
import {
  REPORTING_GSC_INDEXING_LABEL,
  REPORTING_SECTION_LABELS,
  type ReportingSectionId,
} from "@/lib/organic-dashboard/reporting-sections";
import { buildGscPageIndexingUrl } from "@/lib/gsc-reporting/gsc-console-ui-url";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

export type ReportingSectionPillsProps = {
  activeSection: ReportingSectionId;
  onSectionChange: (id: ReportingSectionId) => void;
  /** Public site URL for GSC property (Page indexing opens in a new tab). */
  gscSiteUrl: string;
};

export function ReportingSectionPills({
  activeSection,
  onSectionChange,
  gscSiteUrl,
}: ReportingSectionPillsProps) {
  const gscIndexingHref = gscSiteUrl.trim() ? buildGscPageIndexingUrl(gscSiteUrl) : null;

  const sectionButton = (id: ReportingSectionId) => (
    <Button
      variant="quiet"
      key={id}
      type="button"
      aria-pressed={activeSection === id}
      onClick={() => {
        if (activeSection !== id) onSectionChange(id);
      }}
    >
      {REPORTING_SECTION_LABELS[id]}
    </Button>
  );

  return (
    <div
      className={cn("flex min-w-0 flex-nowrap items-center gap-1")}
      role="group"
      aria-label="Reporting section"
    >
      {sectionButton("performance")}
      {gscIndexingHref ? (
        <a
          href={gscIndexingHref}
          target="_blank"
          rel="noopener noreferrer"
          className={REPORTING_SECTION_TAB_INACTIVE}
          title="Open Page indexing in Google Search Console"
        >
          {REPORTING_GSC_INDEXING_LABEL}
        </a>
      ) : null}
      {sectionButton("speed")}
    </div>
  );
}
