import { Download, ExternalLink, Link2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

import { BULK_TOOLBAR_GROUP_DIVIDER } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";

import { GeneratorToolbarFrame } from "@/components/blog-generator/GeneratorToolbarFrame";

import {
  Ga4ReportingDateRangePopover,
  type Ga4ReportingDateHarness,
} from "@/components/research/reporting/Ga4ReportingDateRangePopover";

import {
  REPORTING_TOOLBAR_CLIENT_REPORT_BTN_CLASS,
  REPORTING_TOOLBAR_DOWNLOAD_PDF_BTN_CLASS,
  REPORTING_TOOLBAR_LABEL_RESERVE_CLASS,
  REPORTING_TOOLBAR_LABEL_SLOT_CLASS,
  REPORTING_TOOLBAR_LABEL_VISIBLE_CLASS,
  REPORTING_TOOLBAR_REFRESH_BTN_CLASS,
  REPORTING_TOOLBAR_SHARE_BTN_CLASS,
} from "@/components/organic-dashboard/organic-reporting-toolbar-buttons";

export type OrganicDashboardToolbarProps = {
  onRefresh: () => void;
  onExportPdf: () => void;
  exportPdfDisabled?: boolean;
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

function ToolbarLabelSlot({ visible, reserve }: { visible: string; reserve: string }) {
  return (
    <span className={REPORTING_TOOLBAR_LABEL_SLOT_CLASS}>
      <span className={REPORTING_TOOLBAR_LABEL_RESERVE_CLASS} aria-hidden>
        {reserve}
      </span>
      <span className={REPORTING_TOOLBAR_LABEL_VISIBLE_CLASS}>{visible}</span>
    </span>
  );
}

export function OrganicDashboardToolbar({
  onRefresh,
  onExportPdf,
  exportPdfDisabled = false,
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
          <div className={BULK_TOOLBAR_GROUP_DIVIDER} />
          <Button
            type="button"
            variant="ghost"
            className={REPORTING_TOOLBAR_SHARE_BTN_CLASS}
            onClick={onShareLink}
          >
            <Link2 className="h-4 w-4 shrink-0" aria-hidden />
            <ToolbarLabelSlot visible={shareCopied ? "Copied" : "Share link"} reserve="Share link" />
          </Button>
          {showExportPdf ? (
            <>
              {onDownloadPdf ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={exportPdfDisabled || downloadPdfBusy}
                  aria-busy={downloadPdfBusy}
                  className={REPORTING_TOOLBAR_DOWNLOAD_PDF_BTN_CLASS}
                  onClick={onDownloadPdf}
                >
                  <Download className="h-4 w-4 shrink-0" aria-hidden />
                  <ToolbarLabelSlot
                    visible={downloadPdfBusy ? "Preparing…" : "Download PDF"}
                    reserve="Download PDF"
                  />
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                disabled={exportPdfDisabled}
                className={REPORTING_TOOLBAR_CLIENT_REPORT_BTN_CLASS}
                onClick={onExportPdf}
              >
                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                Client report
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className={REPORTING_TOOLBAR_REFRESH_BTN_CLASS}
            onClick={onRefresh}
          >
            <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
            Refresh
          </Button>
        </>
      }
    />
  );
}
