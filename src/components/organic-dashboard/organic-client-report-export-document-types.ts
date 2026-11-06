import type { OrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";

export type OrganicClientReportExportDocumentProps = {
  content: OrganicClientReportContent;
  highlightsLoading?: boolean;
  localGridNarrativeLoading?: boolean;
  highlightsError?: string | null;
  onToggleLogoBoxTheme?: () => void;
  pdfExport?: boolean;
};
