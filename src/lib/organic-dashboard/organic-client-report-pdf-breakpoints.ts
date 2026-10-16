import { ORGANIC_CLIENT_REPORT_PDF_CAPTURE_SCALE } from "@/lib/organic-dashboard/organic-client-report-pdf-types";

const BREAKPOINT_SELECTORS =
  ".organic-client-report-export__hero, .organic-client-report-export__section, .organic-deck-export-page-break, .organic-client-report-export__footer";

const MAJOR_SECTION_BREAK_SELECTOR = ".organic-deck-export-page-break";

const AVOID_SPLIT_SELECTORS = [
  ".organic-client-report-export__hero-body",
  ".organic-client-report-export__section-head",
  ".organic-client-report-export__narrative",
  ".organic-client-report-export__kpi-item",
  ".organic-client-report-export__query-item",
  ".organic-client-report-export__opportunity",
  ".organic-client-report-export__metric-stack",
  ".organic-client-report-export__metric-table tr",
  ".organic-client-report-export__footer",
].join(", ");

export type PdfAvoidRegion = { topPx: number; bottomPx: number };

/** CSS-pixel vertical ranges that should not be split by PDF page slices. */
export function collectReportPdfAvoidRegionsCssPx(root: HTMLElement): PdfAvoidRegion[] {
  const rootRect = root.getBoundingClientRect();
  const regions: PdfAvoidRegion[] = [];

  root.querySelectorAll(AVOID_SPLIT_SELECTORS).forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const rect = node.getBoundingClientRect();
    const topPx = Math.max(0, Math.round(rect.top - rootRect.top + root.scrollTop));
    const bottomPx = Math.round(topPx + rect.height);
    if (bottomPx > topPx) {
      regions.push({ topPx, bottomPx });
    }
  });

  return regions.sort((a, b) => a.topPx - b.topPx);
}

export function cssAvoidRegionsToCanvasPx(
  regions: PdfAvoidRegion[],
  scale: number = ORGANIC_CLIENT_REPORT_PDF_CAPTURE_SCALE,
): PdfAvoidRegion[] {
  return regions.map((region) => ({
    topPx: Math.round(region.topPx * scale),
    bottomPx: Math.round(region.bottomPx * scale),
  }));
}

/** CSS-pixel Y where major export sections must start on a new PDF page. */
export function collectReportPdfMajorSectionStartsCssPx(root: HTMLElement): number[] {
  const rootRect = root.getBoundingClientRect();
  const offsets: number[] = [];

  root.querySelectorAll(MAJOR_SECTION_BREAK_SELECTOR).forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const top = node.getBoundingClientRect().top - rootRect.top + root.scrollTop;
    offsets.push(Math.max(0, Math.round(top)));
  });

  return [...new Set(offsets)].sort((a, b) => a - b);
}

/** CSS-pixel Y offsets relative to the report root (sorted, unique). */
export function collectReportPdfBreakpointsCssPx(root: HTMLElement): number[] {
  const rootRect = root.getBoundingClientRect();
  const offsets = new Set<number>([0]);

  const nodes = root.querySelectorAll(BREAKPOINT_SELECTORS);
  nodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const top = node.getBoundingClientRect().top - rootRect.top + root.scrollTop;
    offsets.add(Math.max(0, Math.round(top)));
  });

  return [...offsets].sort((a, b) => a - b);
}

export function cssBreakpointsToCanvasPx(
  breakpointsCssPx: number[],
  scale: number = ORGANIC_CLIENT_REPORT_PDF_CAPTURE_SCALE,
): number[] {
  return breakpointsCssPx.map((y) => Math.round(y * scale));
}

export type PdfCanvasSlice = { startPx: number; endPx: number };

function adjustSliceEndForAvoidRegions(
  sliceStart: number,
  proposedEnd: number,
  pxPageHeight: number,
  regions: PdfAvoidRegion[],
): number {
  let end = proposedEnd;
  const minSlicePx = Math.max(48, Math.floor(pxPageHeight * 0.18));

  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    for (const region of regions) {
      if (region.bottomPx <= sliceStart || region.topPx >= end) continue;

      const cutsIntoBlock =
        sliceStart <= region.topPx && end > region.topPx && end < region.bottomPx;
      const startedInsideBlock = sliceStart > region.topPx && sliceStart < region.bottomPx;

      if (cutsIntoBlock) {
        const endBefore = region.topPx;
        const endAfter = region.bottomPx;
        if (endBefore - sliceStart >= minSlicePx) {
          end = endBefore;
          changed = true;
          break;
        }
        if (endAfter - sliceStart <= pxPageHeight) {
          end = endAfter;
          changed = true;
          break;
        }
      } else if (startedInsideBlock && end < region.bottomPx) {
        if (region.bottomPx - sliceStart <= pxPageHeight) {
          end = region.bottomPx;
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }

  return Math.min(end, sliceStart + pxPageHeight);
}

/** Plans vertical slice ranges for a tall canvas with optional section snap points. */
export function planPdfCanvasSlices(
  canvasHeightPx: number,
  pxPageHeight: number,
  breakpointsCanvasPx: number[],
  avoidRegionsCanvasPx: PdfAvoidRegion[] = [],
  majorSectionStartsCanvasPx: number[] = [],
  snapZoneRatio = 0.2,
): PdfCanvasSlice[] {
  if (canvasHeightPx <= 0 || pxPageHeight <= 0) {
    return [];
  }

  const breaks = [...new Set([0, ...breakpointsCanvasPx.filter((b) => b > 0 && b < canvasHeightPx), canvasHeightPx])].sort(
    (a, b) => a - b,
  );

  const slices: PdfCanvasSlice[] = [];
  let y = 0;
  const minSlicePx = Math.max(48, Math.floor(pxPageHeight * 0.12));
  const majorStarts = [...new Set(majorSectionStartsCanvasPx)].sort((a, b) => a - b);

  while (y < canvasHeightPx) {
    const remaining = canvasHeightPx - y;
    if (remaining <= pxPageHeight) {
      slices.push({ startPx: y, endPx: canvasHeightPx });
      break;
    }

    const idealEnd = y + pxPageHeight;
    let endPx = idealEnd;

    const sectionStartsOnPage = majorStarts.filter((b) => b > y && b < idealEnd);
    if (sectionStartsOnPage.length > 0) {
      const sectionStart = Math.min(...sectionStartsOnPage);
      if (sectionStart - y >= minSlicePx) {
        endPx = sectionStart;
      }
    }

    if (endPx === idealEnd) {
      const snapZoneStart = y + pxPageHeight * (1 - snapZoneRatio);
      const snapCandidates = breaks.filter((b) => b > y && b <= idealEnd && b >= snapZoneStart);
      if (snapCandidates.length > 0) {
        endPx = Math.min(...snapCandidates);
      }
    }

    endPx = adjustSliceEndForAvoidRegions(y, endPx, pxPageHeight, avoidRegionsCanvasPx);
    if (endPx <= y) {
      endPx = Math.min(y + pxPageHeight, canvasHeightPx);
    }
    slices.push({ startPx: y, endPx });
    y = endPx;
  }

  return slices;
}
