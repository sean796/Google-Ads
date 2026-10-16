import { OrganicClientReportExportDocument } from "@/components/organic-dashboard/OrganicClientReportExportDocument";
import {
  buildOrganicClientReportContent,
  type OrganicClientReportDocumentProps,
} from "@/lib/organic-dashboard/organic-client-report-content";

export type { OrganicClientReportDocumentProps };

/** Unified light-theme printer-friendly client report (screen preview, print, and PDF export). */
export function OrganicClientReportDocument(props: OrganicClientReportDocumentProps) {
  const content = buildOrganicClientReportContent(props);
  return <OrganicClientReportExportDocument content={content} />;
}
