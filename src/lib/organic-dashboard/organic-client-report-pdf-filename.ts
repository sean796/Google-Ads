const INVALID_FILE_CHARS = /[<>:"/\\|?*\p{Cc}]/gu;

/** Builds a safe PDF download name for the organic client report. */
export function organicClientReportPdfFileName(siteName: string): string {
  const trimmed = siteName.trim();
  const base = `${trimmed || "Site"} Organic Performance`.replace(INVALID_FILE_CHARS, "").trim();
  return `${base || "Organic Performance"}.pdf`;
}
