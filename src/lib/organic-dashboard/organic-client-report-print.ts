import html2pdf from "html2pdf.js";
import {
  collectReportPdfAvoidRegionsCssPx,
  collectReportPdfBreakpointsCssPx,
  collectReportPdfMajorSectionStartsCssPx,
  cssAvoidRegionsToCanvasPx,
  cssBreakpointsToCanvasPx,
} from "@/lib/organic-dashboard/organic-client-report-pdf-breakpoints";
import { renderReportCanvasToPdf } from "@/lib/organic-dashboard/organic-client-report-pdf-canvas";
import { applyOrganicClientReportExportOnclone } from "@/lib/organic-dashboard/organic-client-report-export-onclone";
import { organicClientReportPdfFileName } from "@/lib/organic-dashboard/organic-client-report-pdf-filename";
import type { OrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";
import { mountOrganicClientReportPdfCapture } from "@/lib/organic-dashboard/organic-client-report-pdf-capture";
import {
  ORGANIC_CLIENT_REPORT_PDF_CAPTURE_CLASS,
  ORGANIC_CLIENT_REPORT_PDF_CONTENT_WIDTH_PX,
  ORGANIC_CLIENT_REPORT_PDF_MARGIN_IN,
  pdfThemeBackgroundColor,
} from "@/lib/organic-dashboard/organic-client-report-pdf-types";

/** @deprecated Use ORGANIC_CLIENT_REPORT_PDF_CONTENT_WIDTH_PX */
export const ORGANIC_CLIENT_REPORT_PDF_LETTER_WIDTH_PX = ORGANIC_CLIENT_REPORT_PDF_CONTENT_WIDTH_PX;

export { ORGANIC_CLIENT_REPORT_PDF_CAPTURE_CLASS };

export type OrganicClientReportPdfHtml2PdfOptions = {
  margin: number;
  filename: string;
  image: { type: string; quality: number };
  html2canvas: {
    scale: number;
    useCORS: boolean;
    backgroundColor: string;
    width: number;
    windowWidth: number;
    onclone: (clonedDoc: Document) => void;
  };
  jsPDF: { unit: string; format: string; orientation: string };
  pagebreak: {
    mode: string[];
    before: string[];
    avoid: string[];
  };
};

export function buildOrganicClientReportPdfOptions(
  fileName: string,
  rootWidthPx: number = ORGANIC_CLIENT_REPORT_PDF_CONTENT_WIDTH_PX,
): OrganicClientReportPdfHtml2PdfOptions {
  const backgroundColor = pdfThemeBackgroundColor("print");
  return {
    margin: ORGANIC_CLIENT_REPORT_PDF_MARGIN_IN,
    filename: fileName,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor,
      width: rootWidthPx,
      windowWidth: rootWidthPx,
      onclone: (clonedDoc) => {
        applyOrganicClientReportExportOnclone(clonedDoc);
      },
    },
    jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
    /* Disable html2pdf internal DOM spacer injection; planPdfCanvasSlices handles pagination. */
    pagebreak: {
      mode: [],
      before: [],
      avoid: [],
    },
  };
}

export type DownloadOrganicClientReportPdfOptions = {
  content: OrganicClientReportContent;
  preparedOn: string;
};

export async function downloadOrganicClientReportPdf(
  options: DownloadOrganicClientReportPdfOptions,
): Promise<void> {
  const { content, preparedOn } = options;
  const fileName = organicClientReportPdfFileName(content.siteName);
  const pdfOptions = buildOrganicClientReportPdfOptions(fileName);

  const capture = await mountOrganicClientReportPdfCapture(content);
  const rootElement = capture.rootElement;

  try {
    const breakpointsCssPx = collectReportPdfBreakpointsCssPx(rootElement);
    const breakpointsCanvasPx = cssBreakpointsToCanvasPx(breakpointsCssPx);
    const avoidRegionsCssPx = collectReportPdfAvoidRegionsCssPx(rootElement);
    const avoidRegionsCanvasPx = cssAvoidRegionsToCanvasPx(avoidRegionsCssPx);
    const majorSectionStartsCssPx = collectReportPdfMajorSectionStartsCssPx(rootElement);
    const majorSectionStartsCanvasPx = cssBreakpointsToCanvasPx(majorSectionStartsCssPx);

    const canvas = (await html2pdf()
      .set(pdfOptions)
      .from(rootElement)
      .toCanvas()
      .get("canvas")) as HTMLCanvasElement;

    const pdf = renderReportCanvasToPdf(canvas, {
      margin: pdfOptions.margin,
      imageType: "jpeg",
      imageQuality: pdfOptions.image.quality,
      jsPDF: pdfOptions.jsPDF,
      theme: "print",
      breakpointsCanvasPx,
      avoidRegionsCanvasPx,
      majorSectionStartsCanvasPx,
      preparedOn,
    });
    pdf.save(fileName);
  } finally {
    capture.cleanup();
  }
}
