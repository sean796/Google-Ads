import { describe, expect, it } from "vitest";
import {
  applyCompetitorTitleFormat,
  suggestCompetitorTitleFormat,
  validateCompetitorComparisonTitle,
} from "@/lib/competitor-research/competitor-title-row-agent";

describe("validateCompetitorComparisonTitle", () => {
  const base = {
    keyword: "blinds",
    entity: "Platinum Blinds",
    connectedSiteName: "Blind Magic",
  };

  it("rejects competitor homepage pipe titles", () => {
    const err = validateCompetitorComparisonTitle(
      "Custom Blinds in Edmonton | Platinum Blinds For Your Space",
      base,
    );
    expect(err).toMatch(/homepage/i);
  });

  it("accepts connected-site-first comparison titles", () => {
    expect(
      validateCompetitorComparisonTitle(
        "Choosing blinds: what Blind Magic offers and how Platinum Blinds compares",
        base,
      ),
    ).toBeNull();
  });

  it("rejects competitor-first what-they-offer titles", () => {
    const err = validateCompetitorComparisonTitle(
      "Choosing Blinds: What Highend Blinds Inc Offers and Questions for Blind Magic",
      {
        keyword: "blinds",
        entity: "Highend Blinds Inc",
        connectedSiteName: "Blind Magic",
      },
    );
    expect(err).toMatch(/connected site|competitor offers/i);
  });

  it("rejects competitor name before connected site", () => {
    const err = validateCompetitorComparisonTitle(
      "Platinum Blinds vs blinds: what Blind Magic offers",
      base,
    );
    expect(err).toMatch(/before the competitor/i);
  });
});

describe("suggestCompetitorTitleFormat", () => {
  it("includes connected site token", () => {
    const fmt = suggestCompetitorTitleFormat("blinds", "Blind Magic");
    expect(fmt).toContain("{connectedSite}");
    expect(
      applyCompetitorTitleFormat(fmt, {
        keyword: "blinds",
        entity: "Platinum Blinds",
        connectedSiteName: "Blind Magic",
      }),
    ).toBe("Choosing blinds: what Blind Magic offers and how Platinum Blinds compares locally");
  });
});
