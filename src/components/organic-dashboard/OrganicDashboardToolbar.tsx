import { Download, ExternalLink, Link2, RefreshCw } from "lucide-react";
import { ActionButton, Button, FilterRowDivider } from "@/ui";
import { GeneratorToolbarFrame } from "@/components/blog-generator/GeneratorToolbarFrame";
import { Ga4ReportingDateRangePopover } from "@/components/research/reporting/Ga4ReportingDateRangePopover";
import type { Ga4ReportingDateHarness } from "@/components/research/reporting/Ga4ReportingDateRangePopover-types";

export type OrganicDashboardToolbarProps = {
  onRefresh: () => void;
  onExportPdf: () => void;
  exportPdfDisabled?: boolean;
  clientReportBusy?: boolean;
  onDownloadPdf?: () => void;
  downloadPdfBusy?: boolean;
  onShareLink: () => void;
  shareCopied?: boolean;
  showDateRange?: boolean;
  showExportPdf?: boolean;
  dateHarness: Ga4ReportingDateHarness;
  onDateHarnessApply: (next: Ga4ReportingDateHarness) => void;
  todayYmdMax: string;
  dateRangePopoverOpen?: boolean;
  onDateRangePopoverOpenChange?: (open: boolean) => void;
};

const SHARE_STATES = ["Share link", "Copied"] as const;
const DOWNLOAD_PDF_STATES = ["Download PDF", "Preparing"] as const;
const CLIENT_REPORT_STATES = ["Client report", "Preparing"] as const;

export function OrganicDashboardToolbar({
  onRefresh,
  onExportPdf,
  exportPdfDisabled = false,
  clientReportBusy = false,
  onDownloadPdf,
  downloadPdfBusy = false,
  onShareLink,
  shareCopied = false,
  showDateRange = true,
  showExportPdf = true,
  dateHarness,
  onDateHarnessApply,
  todayYmdMax,
  dateRangePopoverOpen,
  onDateRangePopoverOpenChange,
}: OrganicDashboardToolbarProps) {
  return (
    <GeneratorToolbarFrame
      primary={
        showDateRange ? (
          <Ga4ReportingDateRangePopover
            busy={false}
            value={dateHarness}
            onApply={onDateHarnessApply}
            todayYmdMax={todayYmdMax}
            open={dateRangePopoverOpen}
            onOpenChange={onDateRangePopoverOpenChange}
          />
        ) : null
      }
      actions={
        <>
          <FilterRowDivider />
          <ActionButton
            variant="tool"
            icon={Link2}
            states={SHARE_STATES}
            state={shareCopied ? "Copied" : "Share link"}
            onClick={onShareLink}
          />
          {showExportPdf ? (
            <>
              {onDownloadPdf ? (
                <ActionButton
                  variant="tool"
                  icon={Download}
                  states={DOWNLOAD_PDF_STATES}
                  state={downloadPdfBusy ? "Preparing" : "Download PDF"}
                  disabled={exportPdfDisabled || downloadPdfBusy}
                  onClick={onDownloadPdf}
                />
              ) : null}
              <ActionButton
                variant="tool"
                icon={ExternalLink}
                states={CLIENT_REPORT_STATES}
                state={clientReportBusy ? "Preparing" : "Client report"}
                disabled={exportPdfDisabled || clientReportBusy}
                onClick={onExportPdf}
              />
            </>
          ) : null}
          <Button variant="tool" icon={RefreshCw} onClick={onRefresh}>
            Refresh
          </Button>
        </>
      }
    />
  );
}
