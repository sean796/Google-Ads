import { jsPDF } from "jspdf";
import {
  planPdfCanvasSlices,
  type PdfAvoidRegion,
  type PdfCanvasSlice,
} from "@/lib/organic-dashboard/organic-client-report-pdf-breakpoints";
import { drawReportPdfPageFooters } from "@/lib/organic-dashboard/organic-client-report-pdf-page-chrome";
import type { OrganicClientReportPdfTheme } from "@/lib/organic-dashboard/organic-client-report-pdf-types";
import { pdfThemeGutterColor } from "@/lib/organic-dashboard/organic-client-report-pdf-types";

export type ReportCanvasToPdfOptions = {
  margin: number;
  imageType: "jpeg" | "png";
  imageQuality: number;
  jsPDF: { unit: string; format: string; orientation: string };
  theme: OrganicClientReportPdfTheme;
  breakpointsCanvasPx?: number[];
  avoidRegionsCanvasPx?: PdfAvoidRegion[];
  majorSectionStartsCanvasPx?: number[];
  preparedOn: string;
  drawFooters?: boolean;
};

function renderSliceToPage(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  slice: PdfCanvasSlice,
  pageIndex: number,
  options: {
    margin: number;
    innerWidth: number;
    innerHeight: number;
    pxPageHeight: number;
    imageType: "jpeg" | "png";
    imageQuality: number;
    gutterColor: string;
  },
  pageCanvas: HTMLCanvasElement,
  pageCtx: CanvasRenderingContext2D,
): void {
  const sliceHeight = slice.endPx - slice.startPx;
  let drawHeight = sliceHeight * (options.innerWidth / canvas.width);
  drawHeight = Math.min(drawHeight, options.innerHeight);

  if (sliceHeight < options.pxPageHeight) {
    pageCanvas.height = sliceHeight;
    drawHeight = sliceHeight * (options.innerWidth / canvas.width);
  } else {
    pageCanvas.height = sliceHeight;
  }

  const w = pageCanvas.width;
  const h = pageCanvas.height;
  pageCtx.fillStyle = options.gutterColor;
  pageCtx.fillRect(0, 0, w, h);
  pageCtx.drawImage(canvas, 0, slice.startPx, w, sliceHeight, 0, 0, w, h);

  if (pageIndex > 0) {
    pdf.addPage();
  }

  const imgData = pageCanvas.toDataURL(`image/${options.imageType}`, options.imageQuality);
  pdf.addImage(imgData, options.imageType, options.margin, options.margin, options.innerWidth, drawHeight);
}

/** Splits a tall html2canvas capture into letter pages with theme-colored gutters. */
export function renderReportCanvasToPdf(
  canvas: HTMLCanvasElement,
  options: ReportCanvasToPdfOptions,
): jsPDF {
  const pdf = new jsPDF(options.jsPDF);
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = options.margin;
  const drawFooters = options.drawFooters ?? true;
  const footerBandIn = drawFooters ? (margin > 0 ? 0.38 : 0.32) : 0;
  const innerWidth = pageWidth - margin * 2;
  const innerHeight = pageHeight - margin * 2 - footerBandIn;
  const innerRatio = innerHeight / innerWidth;

  const pxPageHeight = Math.floor(canvas.width * innerRatio);
  const breakpoints = options.breakpointsCanvasPx ?? [];
  const avoidRegions = options.avoidRegionsCanvasPx ?? [];
  const majorSectionStarts = options.majorSectionStartsCanvasPx ?? [];
  const slices = planPdfCanvasSlices(
    canvas.height,
    pxPageHeight,
    breakpoints,
    avoidRegions,
    majorSectionStarts,
  );

  const pageCanvas = document.createElement("canvas");
  const pageCtx = pageCanvas.getContext("2d");
  if (!pageCtx) {
    throw new Error("Could not create PDF page canvas.");
  }
  pageCanvas.width = canvas.width;

  const gutterColor = pdfThemeGutterColor(options.theme);

  const validSlices = slices.filter((slice, idx) => {
    const h = slice.endPx - slice.startPx;
    if (idx > 0 && h <= 16) return false;
    return h > 0;
  });

  validSlices.forEach((slice, pageIndex) => {
    renderSliceToPage(
      pdf,
      canvas,
      slice,
      pageIndex,
      {
        margin,
        innerWidth,
        innerHeight,
        pxPageHeight,
        imageType: options.imageType,
        imageQuality: options.imageQuality,
        gutterColor,
      },
      pageCanvas,
      pageCtx,
    );
  });

  if (drawFooters) {
    drawReportPdfPageFooters(pdf, {
      preparedOn: options.preparedOn,
      theme: options.theme,
      marginIn: margin,
    });
  }

  return pdf;
}
