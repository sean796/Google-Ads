import { describe, expect, it } from "vitest";
import {
  overviewRowSlugChangePlan,
  verifyWordPressSlugMatchesPlan,
  wpSlugFromAiSuggestedPath,
} from "@/lib/overview/overview-change-post-url";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";

function row(partial: Partial<OverviewRow>): OverviewRow {
  return {
    url: "https://kwbllp.com/blog/should-physicians-incorporate-what-still-works-and-what-doesnt/",
    title: "",
    metaDescription: "",
    aiTitle: "",
    aiMeta: "",
    status: "idle",
    ...partial,
  };
}

describe("wpSlugFromAiSuggestedPath", () => {
  it("uses the last segment when parent prefix is included", () => {
    expect(wpSlugFromAiSuggestedPath("blog/physician-incorporate/")).toBe("physician-incorporate");
  });

  it("extracts need-a-holding-company from cyan blog path", () => {
    expect(wpSlugFromAiSuggestedPath("blog/need-a-holding-company/")).toBe("need-a-holding-company");
  });
});

describe("overviewRowSlugChangePlan", () => {
  it("plans slug change when suggested path differs from current URL", () => {
    const plan = overviewRowSlugChangePlan(
      row({ aiSuggestedPath: "blog/physician-incorporate/" }),
    );
    expect(plan.needed).toBe(true);
    expect(plan.slug).toBe("physician-incorporate");
    expect(plan.newUrl).toBe("https://kwbllp.com/blog/physician-incorporate/");
  });

  it("still plans slug push when row.url already shows the suggested destination", () => {
    const plan = overviewRowSlugChangePlan(
      row({
        url: "https://kwbllp.com/blog/need-a-holding-company/",
        aiSuggestedPath: "blog/need-a-holding-company/",
      }),
    );
    expect(plan.needed).toBe(true);
    expect(plan.slug).toBe("need-a-holding-company");
    expect(plan.newUrl).toBe("https://kwbllp.com/blog/need-a-holding-company/");
  });
});

describe("verifyWordPressSlugMatchesPlan", () => {
  it("fails when live slug still differs from cyan target", () => {
    const plan = overviewRowSlugChangePlan(
      row({
        url: "https://kwbllp.com/blog/do-you-still-need-a-holding-company/",
        aiSuggestedPath: "blog/need-a-holding-company/",
      }),
    );
    const result = verifyWordPressSlugMatchesPlan(
      "https://kwbllp.com/blog/do-you-still-need-a-holding-company/",
      plan,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/need-a-holding-company/);
  });

  it("passes when live permalink matches cyan destination", () => {
    const plan = overviewRowSlugChangePlan(
      row({
        url: "https://kwbllp.com/blog/do-you-still-need-a-holding-company/",
        aiSuggestedPath: "blog/need-a-holding-company/",
      }),
    );
    const result = verifyWordPressSlugMatchesPlan(
      "https://kwbllp.com/blog/need-a-holding-company/",
      plan,
    );
    expect(result.ok).toBe(true);
  });

  it("passes for scheduled/draft preview permalinks (?p=ID) when confirmedSlug matches plan", () => {
    const plan = overviewRowSlugChangePlan(
      row({
        url: "https://blindswest.com/blog/custom-blinds-calgary/",
        aiSuggestedPath: "/blog/custom-blinds-calgary/",
      }),
    );
    const result = verifyWordPressSlugMatchesPlan(
      "https://blindswest.com/?p=5554",
      plan,
      "custom-blinds-calgary",
    );
    expect(result.ok).toBe(true);
  });
});
