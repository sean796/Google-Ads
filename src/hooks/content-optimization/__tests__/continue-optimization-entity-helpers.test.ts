import { describe, expect, it } from "vitest";
import {
  entityFromGeoKeywordPhrase,
  resolveSapEntityForOptimize,
} from "../continue-optimization-entity-helpers";

describe("entityFromGeoKeywordPhrase", () => {
  it("derives Sunset Park, FL from blinds sunset park fl keyword", () => {
    expect(entityFromGeoKeywordPhrase("blinds sunset park fl")).toBe("Sunset Park, FL");
  });

  it("derives entity from SAP colon title head", () => {
    expect(
      entityFromGeoKeywordPhrase("Blinds Sunset Park Fl"),
    ).toBe("Sunset Park, FL");
  });

  it("parses near-title pattern via resolveSapEntityForOptimize title path", () => {
    const entity = resolveSapEntityForOptimize({
      site: { id: "s", name: "T", siteUrl: "https://example.com", username: "u", appPassword: "p", connectedAt: 0 },
      url: "https://example.com/blinds-near-plum-coulee/",
      title: "Blinds Near Plum Coulee, MB",
      keyword: "blinds",
    });
    expect(entity).toBe("Plum Coulee, MB");
  });
});
