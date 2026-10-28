import { describe, expect, it } from "vitest";
import {
  formatSapHeadlineTitleCase,
  gscQueryMatchesTradingName,
  limitServiceWords,
  shortPlaceLabelForSapTitle,
  stripTradingNameFromPhrase,
  tradingNameAppearsInText,
  truncateAtWordBoundary,
} from "../sap-brand-and-brevity";
import { buildSapSlugFromKeywordEntity } from "../sap-slug-from-keyword-entity";
import {
  isValidEntitySapTitle,
  resolveEntitySapTitleFromTemplate,
} from "@/lib/local-analysis/entity-sap-title-agent";

describe("sap brand and brevity", () => {
  it("fuzzy-matches collapsed brand in GSC queries", () => {
    expect(gscQueryMatchesTradingName("neodigital", "Neo Digital")).toBe(true);
    expect(gscQueryMatchesTradingName("neo digital seo", "Neo Digital")).toBe(true);
    expect(gscQueryMatchesTradingName("local seo services", "Neo Digital")).toBe(false);
  });

  it("title-cases SAP headlines regardless of keyword casing", () => {
    expect(formatSapHeadlineTitleCase("marketing Near Laurier Heights, Edmonton")).toBe(
      "Marketing Near Laurier Heights, Edmonton",
    );
    expect(formatSapHeadlineTitleCase("local seo services Near Wîhkwêntôwin, Edmonton")).toContain(
      "Local SEO Services",
    );
  });
  it("strips KWB and LLP from service phrases", () => {
    expect(
      stripTradingNameFromPhrase("kwb llp tax preparation", "KWB Chartered Professional Accountants"),
    ).toBe("tax preparation");
  });

  it("detects trading name tokens in titles", () => {
    expect(
      tradingNameAppearsInText("KWB LLP Near Alberta Avenue, Edmonton", "KWB Chartered Professional Accountants"),
    ).toBe(true);
    expect(
      tradingNameAppearsInText("Tax Preparation Near Alberta Avenue, Edmonton", "KWB Chartered Professional Accountants"),
    ).toBe(false);
  });

  it("shortens place labels for SAP titles", () => {
    expect(shortPlaceLabelForSapTitle("Alberta Legislature Building, Edmonton, AB")).toBe(
      "Alberta Legislature Building, Edmonton",
    );
  });

  it("builds compact slugs for long keywords", () => {
    const slug = buildSapSlugFromKeywordEntity(
      "CRA review letter assistance and tax representation",
      "Alberta Sheriffs Branch, Edmonton",
    );
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.split("-").length).toBeLessThanOrEqual(8);
  });
});

describe("entity SAP title brevity", () => {
  it("rejects brand in title validation", () => {
    expect(
      isValidEntitySapTitle(
        "KWB Near Alberta Avenue, Edmonton",
        "tax preparation",
        "Alberta Avenue, Edmonton",
        "KWB Chartered Professional Accountants",
      ),
    ).toBe(false);
  });

  it("template fallback strips brand and truncates", () => {
    const title = resolveEntitySapTitleFromTemplate(
      "kwb llp business accountants",
      "Alberta Legislature Building, Edmonton, AB",
      "{keyword} Near {entity}",
      "KWB Chartered Professional Accountants",
    );
    expect(title.toLowerCase()).not.toContain("kwb");
    expect(title.length).toBeLessThanOrEqual(58);
    expect(limitServiceWords("a b c d e f", 4)).toBe("a b c d");
    expect(truncateAtWordBoundary("one two three four five six", 12)).toBe("one two");
  });
});
