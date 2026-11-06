import { describe, expect, it } from "vitest";
import {
  applyManualContentCalendarTools,
  assignContentCalendarLandingPages,
} from "@/lib/social/content-creator-manual-tools";
import { createIdleContentCalendarRow } from "@/lib/social/content-creator-types";
import type { PpcWpPageContext } from "@/lib/ppc/google-ads-types";

function page(url: string, title: string): PpcWpPageContext {
  return { url, title, excerpt: "", metaDescription: "", keyword: "" };
}

describe("assignContentCalendarLandingPages", () => {
  it("round-robin assigns landing pages for pages source", () => {
    const rows = assignContentCalendarLandingPages(
      [createIdleContentCalendarRow(), createIdleContentCalendarRow()],
      [
        page("https://example.com/a", "A"),
        page("https://example.com/b", "B"),
      ],
      "pages",
    );
    expect(rows[0]?.landingPageUrl).toBe("https://example.com/a");
    expect(rows[1]?.landingPageUrl).toBe("https://example.com/b");
  });

  it("random assigns from the pool", () => {
    const rows = assignContentCalendarLandingPages(
      [createIdleContentCalendarRow()],
      [
        page("https://example.com/a", "A"),
        page("https://example.com/b", "B"),
      ],
      "random",
    );
    expect(["https://example.com/a", "https://example.com/b"]).toContain(rows[0]?.landingPageUrl);
  });
});

describe("applyManualContentCalendarTools", () => {
  it("assigns landing pages without auto schedule or events", () => {
    const rows = applyManualContentCalendarTools(
      [createIdleContentCalendarRow(), createIdleContentCalendarRow()],
      {
        landingPages: [page("https://example.com/blog/a", "A")],
        landingPageSource: "posts",
      },
    );
    expect(rows[0]?.date).toBeUndefined();
    expect(rows[0]?.dayOfWeek).toBeUndefined();
    expect(rows[0]?.events).toBeUndefined();
    expect(rows[0]?.landingPageUrl).toBe("https://example.com/blog/a");
  });

  it("replaces excluded careers landing pages", () => {
    const rows = applyManualContentCalendarTools(
      [
        {
          ...createIdleContentCalendarRow(),
          landingPageUrl: "https://neodigital.ca/careers/",
        },
      ],
      {
        landingPages: [page("https://neodigital.ca/website-design/", "Website Design")],
        landingPageSource: "pages",
      },
    );
    expect(rows[0]?.landingPageUrl).toBe("https://neodigital.ca/website-design/");
  });

  it("preserves user-provided events and imported dates", () => {
    const rows = applyManualContentCalendarTools(
      [
        {
          ...createIdleContentCalendarRow(),
          events: "Site launch promo",
          date: "8/12/2026",
          dayOfWeek: "Wednesday",
        },
      ],
      {
        landingPages: [],
        landingPageSource: "random",
      },
    );
    expect(rows[0]?.events).toBe("Site launch promo");
    expect(rows[0]?.date).toBe("8/12/2026");
    expect(rows[0]?.dayOfWeek).toBe("Wednesday");
  });
});
