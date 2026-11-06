import { describe, expect, it } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import {
  formatPageLocalContextPromptBlock,
  resolvePageLocalContext,
  validateIllustrativeScenarioGeo,
} from "@/lib/content-optimization/page-local-context";

const edmontonSite: WordPressSite = {
  id: "bm",
  name: "Blind Magic",
  siteUrl: "https://blindmagic.example",
  username: "u",
  appPassword: "p",
  connectedAt: 0,
  locations: [
    {
      id: "loc1",
      name: "HQ",
      address: "123 Main",
      phone: "",
      city: "Edmonton",
      state: "AB",
      zip: "T5J 0A1",
      isDefault: true,
    },
  ],
};

describe("resolvePageLocalContext", () => {
  it("strips Edmonton from product keyword on standard posts", () => {
    const ctx = resolvePageLocalContext({
      keyword: "Duette Cellular Shades Edmonton",
      site: edmontonSite,
    });
    expect(ctx.primaryCity).toBe("Edmonton, AB");
    expect(ctx.serviceTopic).toBe("Duette Cellular Shades");
    expect(ctx.placeEntity).toBe("");
    expect(ctx.prosePlaceLabel).toBe("Edmonton, AB");
  });

  it("resolves SAP entity and service topic", () => {
    const ctx = resolvePageLocalContext({
      keyword: "Blinds Lacombe Park St Albert",
      site: edmontonSite,
      entity: "Lacombe Park, St. Albert, AB",
    });
    expect(ctx.primaryCity).toBe("Edmonton, AB");
    expect(ctx.placeEntity).toBe("Lacombe Park, St. Albert, AB");
    expect(ctx.prosePlaceLabel).toBe("Lacombe Park, St. Albert");
    expect(ctx.serviceTopic.toLowerCase()).not.toContain("lacombe");
  });
});

describe("formatPageLocalContextPromptBlock", () => {
  it("includes primary city and service topic mandate", () => {
    const block = formatPageLocalContextPromptBlock(
      resolvePageLocalContext({
        keyword: "Duette Cellular Shades Edmonton",
        site: edmontonSite,
      }),
    );
    expect(block).toContain("Primary service city");
    expect(block).toContain("Edmonton, AB");
    expect(block).toContain("Duette Cellular Shades");
    expect(block).toContain("never a city");
    expect(block).toContain("must use the primary service city only");
  });

  it("forbids inventing a city when the site has none", () => {
    const block = formatPageLocalContextPromptBlock(
      resolvePageLocalContext({
        keyword: "hunter douglas vs alta",
        site: {
          id: "lb",
          name: "Lindsey Blinds",
          siteUrl: "https://lindseyblindsetc.com",
          username: "u",
          appPassword: "p",
          connectedAt: 0,
        },
      }),
    );
    expect(block).toContain("National article");
    expect(block).toContain("inventing a city");
    expect(block).not.toContain("must use the primary service city only");
  });
});

describe("validateIllustrativeScenarioGeo", () => {
  const ctx = resolvePageLocalContext({
    keyword: "Duette Cellular Shades Edmonton",
    site: edmontonSite,
  });

  it("accepts Edmonton nursery scenario", () => {
    expect(() =>
      validateIllustrativeScenarioGeo(
        "Choosing Duette Cellular Shades for an Edmonton nursery",
        ctx,
      ),
    ).not.toThrow();
  });

  it("rejects product-as-place phrasing", () => {
    expect(() =>
      validateIllustrativeScenarioGeo("Choosing shades for a nursery in Duette", ctx),
    ).toThrow(/service topic.*place/i);
  });

  it("accepts a product decision that does not spell the profile city", () => {
    expect(() =>
      validateIllustrativeScenarioGeo(
        "Should Eleanor prioritize Alta cost savings or Hunter Douglas features?",
        ctx,
      ),
    ).not.toThrow();
  });

  it("rejects an invented city on a national article", () => {
    const national = resolvePageLocalContext({
      keyword: "hunter douglas vs alta",
      site: {
        id: "lb",
        name: "Lindsey Blinds",
        siteUrl: "https://lindseyblindsetc.com",
        username: "u",
        appPassword: "p",
        connectedAt: 0,
      },
    });
    expect(() =>
      validateIllustrativeScenarioGeo(
        "As a Naples, Florida homeowner, how do I choose shades for my home office?",
        national,
      ),
    ).toThrow(/invented a place/i);
    expect(() =>
      validateIllustrativeScenarioGeo(
        "How do I choose between Hunter Douglas and Alta for a home office?",
        national,
      ),
    ).not.toThrow();
    expect(() =>
      validateIllustrativeScenarioGeo(
        "As a homeowner, how do I choose in Hunter Douglas vs Alta for a home office?",
        national,
      ),
    ).not.toThrow();
  });
});
