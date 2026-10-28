import { describe, expect, it } from "vitest";
import { createEmptyOverviewRow } from "@/lib/overview/overview-row-helpers";
import {
  bulkStudioRowPathLabel,
  metaDisplayTitle,
  overviewRowUrlPathLabel,
} from "@/lib/overview/overview-tab-display";

describe("overviewRowUrlPathLabel", () => {
  it("keeps full pathname for pages", () => {
    expect(
      overviewRowUrlPathLabel("https://example.com/service-area/camrose/", { source: "pages" }),
    ).toBe("/service-area/camrose/");
  });

  it("strips entity collection prefix for sap", () => {
    expect(
      overviewRowUrlPathLabel("https://example.com/service-area/camrose/", { source: "sap" }),
    ).toBe("/camrose/");
  });

  it("strips blog prefix for posts", () => {
    expect(
      overviewRowUrlPathLabel("https://example.com/blog/my-post/", { source: "posts" }),
    ).toBe("/my-post/");
  });

  it("bulkStudioRowPathLabel keeps aiSuggestedPath including /blog/", () => {
    expect(
      bulkStudioRowPathLabel({
        url: "https://example.com/blog/custom-blinds/",
        aiSuggestedPath: "/blog/custom-blinds-beltline-calgary/",
      }),
    ).toBe("/blog/custom-blinds-beltline-calgary/");
  });

  it("prefers post title and aiTitle over stale pageHeading", () => {
    const row = {
      ...createEmptyOverviewRow("https://blindmagic.com/blog/motorized-roller-blinds-benefits/"),
      title: "Advantages Of Motorised Roller Blinds For Light And Privacy",
      pageHeading: "Giving Back",
    };
    expect(metaDisplayTitle(row)).toBe(
      "Advantages Of Motorised Roller Blinds For Light And Privacy",
    );
  });
});
