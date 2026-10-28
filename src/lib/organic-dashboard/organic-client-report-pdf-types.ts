/** PDF raster export always uses the white print layout (screen preview stays branded). */
export type OrganicClientReportPdfTheme = "print";

/** Content column width at 96 CSS px per inch (7.5in content column for letter PDF). */
export const ORGANIC_CLIENT_REPORT_PDF_CONTENT_WIDTH_PX = 720;

/** Page margin for letter PDF (inches). */
export const ORGANIC_CLIENT_REPORT_PDF_MARGIN_IN = 0.4;

/** Footer band at bottom of each PDF page (inches) when vector footers are drawn. */
export const ORGANIC_CLIENT_REPORT_PDF_FOOTER_BAND_IN = 0.38;

/** One letter page content height at the PDF capture width (same ratio as canvas slice planner). */
export function organicClientReportPdfPageContentHeightPx(
  contentWidthPx: number = ORGANIC_CLIENT_REPORT_PDF_CONTENT_WIDTH_PX,
  marginIn: number = ORGANIC_CLIENT_REPORT_PDF_MARGIN_IN,
  footerBandIn: number = 0,
): number {
  const letterWidthIn = 8.5;
  const letterHeightIn = 11;
  const innerWidth = letterWidthIn - marginIn * 2;
  const innerHeight = letterHeightIn - marginIn * 2 - footerBandIn;
  return Math.floor(contentWidthPx * (innerHeight / innerWidth));
}

export const ORGANIC_CLIENT_REPORT_COVER_PAGE_MIN_HEIGHT_PX =
  organicClientReportPdfPageContentHeightPx();

export const ORGANIC_CLIENT_REPORT_PDF_CAPTURE_SCALE = 2;

export const ORGANIC_CLIENT_REPORT_PDF_CAPTURE_CLASS = "organic-client-report--pdf-capture";

/** @deprecated Screen deck no longer uses export class; kept for capture host. */
export const ORGANIC_CLIENT_REPORT_PDF_EXPORT_CLASS = "organic-client-report--pdf-export";

/** @deprecated Use ORGANIC_CLIENT_REPORT_PDF_EXPORT_CLASS */
export const ORGANIC_CLIENT_REPORT_PDF_PRINT_THEME_CLASS = ORGANIC_CLIENT_REPORT_PDF_EXPORT_CLASS;

export function pdfThemeBackgroundColor(_theme: OrganicClientReportPdfTheme = "print"): string {
  return "#ffffff";
}

export function pdfThemeGutterColor(_theme: OrganicClientReportPdfTheme = "print"): string {
  return "#ffffff";
}
