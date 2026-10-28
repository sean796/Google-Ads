import { describe, expect, it, vi, beforeEach } from "vitest";
import { organicClientReportPdfFileName } from "@/lib/organic-dashboard/organic-client-report-pdf-filename";
import { buildOrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";
import {
  ORGANIC_CLIENT_REPORT_PDF_CONTENT_WIDTH_PX,
  ORGANIC_CLIENT_REPORT_PDF_MARGIN_IN,
} from "@/lib/organic-dashboard/organic-client-report-pdf-types";
import {
  ORGANIC_CLIENT_REPORT_PDF_LETTER_WIDTH_PX,
  buildOrganicClientReportPdfOptions,
  downloadOrganicClientReportPdf,
} from "@/lib/organic-dashboard/organic-client-report-print";
import type { OrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";

const saveMock = vi.fn();
const getMock = vi.fn().mockResolvedValue({ width: 720, height: 2400 });
const toCanvasMock = vi.fn(() => ({ get: getMock }));
const fromMock = vi.fn(() => ({ toCanvas: toCanvasMock }));
const setMock = vi.fn(() => ({ from: fromMock }));
const cleanupMock = vi.fn();

vi.mock("html2pdf.js", () => ({
  default: vi.fn(() => ({
    set: setMock,
  })),
}));

vi.mock("@/lib/organic-dashboard/organic-client-report-pdf-canvas", () => ({
  renderReportCanvasToPdf: vi.fn(() => ({ save: saveMock })),
}));

vi.mock("@/lib/organic-dashboard/organic-client-report-cover-images", () => ({
  withOrganicClientReportCoverDataUrls: vi.fn(async (content: unknown) => content),
}));

vi.mock("@/lib/organic-dashboard/organic-client-report-pdf-capture", () => ({
  mountOrganicClientReportPdfCapture: vi.fn(async () => ({
    rootElement: {
      classList: { add: vi.fn(), remove: vi.fn() },
      getBoundingClientRect: () => ({ top: 0, left: 0 }),
      scrollTop: 0,
      querySelectorAll: () => [],
    },
    cleanup: cleanupMock,
  })),
}));

const emptyVm: OrganicDashboardViewModel = {
  ga4Table: [],
  ga4MonthlyChart: [],
  gscQueries: [],
  gscTrendDaily: [],
  gscTrendMonthly: [],
  gscSummary: null,
  semrushSummary: null,
  semrushTrend: [],
  semrushKeywords: [],
  semrushOverviewUrl: "",
  semrushDomain: "",
  semrushDatabase: "us",
  periodLabels: { primary: "Sep", compare: "Aug" },
  hasGa4: false,
  hasGsc: false,
  hasSemrush: false,
};

function sampleContent() {
  return buildOrganicClientReportContent({
    viewModel: emptyVm,
    highlights: {
      executiveSummary: "Summary line.",
      keyTakeaways: ["One.", "Two."],
      performanceNarrative: [],
      keywordNarrative: [],
      googleAdsNarrative: [],
      topOpportunities: [],
    },
    siteName: "Blind Magic",
    siteUrl: "https://example.com",
    showCompare: true,
    preparedOn: "2026-10-13",
  });
}

describe("organicClientReportPdfFileName", () => {
  it("sanitizes invalid filesystem characters", () => {
    expect(organicClientReportPdfFileName('Blind Magic: "test"')).toBe(
      "Blind Magic test Organic Performance.pdf",
    );
  });

  it("uses a default when site name is empty", () => {
    expect(organicClientReportPdfFileName("   ")).toBe("Site Organic Performance.pdf");
  });
});

describe("buildOrganicClientReportPdfOptions", () => {
  it("uses agency letter width, slim page margin, and disables html2pdf internal spacer injection", () => {
    const opt = buildOrganicClientReportPdfOptions("Acme Organic Performance.pdf");
    expect(opt.margin).toBe(ORGANIC_CLIENT_REPORT_PDF_MARGIN_IN);
    expect(opt.margin).toBe(0.4);
    expect(opt.html2canvas.width).toBe(ORGANIC_CLIENT_REPORT_PDF_CONTENT_WIDTH_PX);
    expect(opt.html2canvas.windowWidth).toBe(720);
    expect(opt.html2canvas.backgroundColor).toBe("#ffffff");
    expect(opt.pagebreak).toEqual({ mode: [], before: [], avoid: [] });
    expect(ORGANIC_CLIENT_REPORT_PDF_LETTER_WIDTH_PX).toBe(720);
  });
});

describe("downloadOrganicClientReportPdf", () => {
  beforeEach(() => {
    saveMock.mockClear();
    getMock.mockClear();
    toCanvasMock.mockClear();
    fromMock.mockClear();
    setMock.mockClear();
    cleanupMock.mockClear();
  });

  it("captures export DOM with html2pdf then saves via page renderer", async () => {
    await downloadOrganicClientReportPdf({
      content: sampleContent(),
      preparedOn: "Oct 13, 2026",
    });

    expect(setMock).toHaveBeenCalledOnce();
    expect(fromMock).toHaveBeenCalledOnce();
    expect(toCanvasMock).toHaveBeenCalledOnce();
    expect(getMock).toHaveBeenCalledWith("canvas");
    expect(saveMock).toHaveBeenCalledOnce();
    expect(cleanupMock).toHaveBeenCalledOnce();
    const setArg = setMock.mock.calls[0]![0] as { margin: number };
    expect(setArg.margin).toBe(0.4);
  });
});
