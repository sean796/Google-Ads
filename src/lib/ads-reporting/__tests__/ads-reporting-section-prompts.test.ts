import { describe, expect, it } from "vitest";
import {
  buildAdsUserMessageForSection,
  getAdsReportingSectionSystemPrompt,
} from "@/lib/ads-reporting/ads-reporting-section-prompts";

describe("ads-reporting-section-prompts", () => {
  it("forbids extra H2s and quoted keywords", () => {
    const prompt = getAdsReportingSectionSystemPrompt("campaign_performance", "mom");
    expect(prompt).toContain("Do not output any ## heading");
    expect(prompt).toContain("never wrap campaign names, keywords, or search terms in quotation marks");
    expect(prompt).toContain("Never bold spend, clicks, impressions, conversions");
    expect(prompt).toContain("The only all-caps words are acronyms: CPA, CPC, CTR");
    expect(prompt).toContain("sentence case");
  });

  it("requires a keyword-level table in Search Terms", () => {
    const prompt = getAdsReportingSectionSystemPrompt("search_terms", "mom");
    expect(prompt).toContain("required keyword-level GFM table");
    expect(prompt).toContain("Ads-keywords-MoM.csv");
    expect(prompt).toContain("Do not write a keyword paragraph");
    expect(prompt).toContain("Do not quote keywords");
  });

  it("tells the section call not to write Target H2", () => {
    const user = buildAdsUserMessageForSection({
      siteName: "Acme",
      siteUrl: "https://acme.example",
      outline: { executiveSummary: "Spend rose.", topOpportunities: [], sections: [] },
      plan: {
        id: "search_terms",
        h2Title: "Search Terms",
        kind: "search_terms",
        ragQuery: "keyword",
      },
      retrievedContext: "Keyword,Spend",
      compareLabel: "August 1, 2026 to August 31, 2026 vs July 1–31, 2026",
    });
    expect(user).toContain("already applied, do not write it");
    expect(user).toContain("Do not output any ## heading");
    expect(user).toContain("Bold those names in prose only");
    expect(user).toContain("pipe table cells must be plain text");
    expect(user).toContain("Never bold spend, clicks, impressions, conversions");
    expect(user).toContain("Only CPA, CPC, and CTR stay in all caps");
  });
});
