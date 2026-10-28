import { describe, expect, it } from "vitest";
import {
  buildLocalGridResultsNarrativeParagraph,
  isLocalGridNarrativePlaceholder,
  resolveLocalGridNarrativeForReport,
} from "@/lib/organic-dashboard/local-grid-report-narrative";
import type { LocalGridReportingSnapshot } from "@/lib/organic-dashboard/local-grid-client-report";

const snapshot: LocalGridReportingSnapshot = {
  scanId: "scan-1",
  keyword: "custom blinds edmonton",
  scanDateLabel: "Oct 2026",
  scanSize: "7x7",
  shape: "square",
  distance: 1,
  distanceMeasure: "mi",
  summary: {
    tarp: 8.2,
    avgRank: 6.1,
    rankedPoints: 40,
    totalPoints: 49,
    highCount: 12,
    highPct: 24,
    medCount: 10,
    medPct: 20,
    lowCount: 8,
    lowPct: 16,
    outCount: 19,
    outPct: 39,
  },
};

describe("local-grid-report-narrative", () => {
  it("flags schema placeholder String1", () => {
    expect(isLocalGridNarrativePlaceholder("String1")).toBe(true);
    expect(isLocalGridNarrativePlaceholder("string")).toBe(true);
  });

  it("falls back to stats paragraph when AI returns String1", () => {
    const paragraphs = resolveLocalGridNarrativeForReport(["String1"], snapshot, "Blind Magic");
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]).toContain("custom blinds edmonton");
    expect(paragraphs[0]).toContain("TARP");
  });

  it("keeps valid AI narrative", () => {
    const ai =
      "Blind Magic shows solid map pack presence for **custom blinds edmonton** with TARP 8.2 and 24% of pins in the top 3, while weaker cells sit outside the top 20.";
    const paragraphs = resolveLocalGridNarrativeForReport([ai], snapshot, "Blind Magic");
    expect(paragraphs[0]).toBe(ai);
  });

  it("builds deterministic fallback with keyword", () => {
    const p = buildLocalGridResultsNarrativeParagraph(snapshot, "Blind Magic");
    expect(p).toContain("**custom blinds edmonton**");
  });
});
