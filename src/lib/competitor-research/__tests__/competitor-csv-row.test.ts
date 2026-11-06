import { describe, expect, it } from "vitest";
import {
  buildCompetitorCsvKeyword,
  buildCompetitorFieldsValue,
  buildCompetitorRowModifier,
  isCompetitorComparisonRow,
  isCompetitorCsvKeyword,
} from "@/lib/competitor-research/competitor-csv-row";

describe("competitor-csv-row", () => {
  it("builds competitor-prefixed keyword from business name", () => {
    expect(buildCompetitorCsvKeyword("Solar Blinds")).toBe("competitor - Solar Blinds");
  });

  it("detects competitor CSV keyword shape", () => {
    expect(isCompetitorCsvKeyword("competitor - Solar Blinds")).toBe(true);
    expect(isCompetitorCsvKeyword("blinds")).toBe(false);
    expect(isCompetitorComparisonRow({ keyword: "competitor - Solar Blinds" })).toBe(true);
  });

  it("builds competitor_fields ACF value", () => {
    expect(buildCompetitorFieldsValue("Highend Blinds Inc", "blinds")).toBe(
      "Highend Blinds Inc, blinds",
    );
  });

  it("builds human modifier with positioning and user modification", () => {
    const mod = buildCompetitorRowModifier({
      focusKeyword: "blinds",
      competitorName: "Solar Blinds",
      connectedSiteName: "Blind Magic",
      comparison: {
        serviceComparison: [],
        featureBenefitTable: [],
        positioningNotes: "Emphasize consultation and install timelines.",
      },
      promptModifier: "Mention motorization options briefly.",
    });
    expect(mod).toContain("Competitor comparison for blinds.");
    expect(mod).toContain("Compare Solar Blinds with Blind Magic.");
    expect(mod).toContain("Emphasize consultation");
    expect(mod).toContain("motorization");
    expect(mod).not.toMatch(/^\s*\{/);
  });
});
