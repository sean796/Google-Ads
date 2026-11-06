import { describe, expect, it } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import { createEmptyOverviewRow } from "@/lib/overview/overview-row-helpers";
import { hydrateOverviewRowsFromPrefetchInventory } from "@/lib/overview/overview-row-scrape";

const site = {
  id: "wp-test",
  name: "Test",
  siteUrl: "https://example.com",
  username: "u",
  appPassword: "p",
} as WordPressSite;

describe("hydrateOverviewRowsFromPrefetchInventory", () => {
  it("fills title, meta, and focus keyword from prefetch inventory rows", () => {
    const row = createEmptyOverviewRow("https://example.com/5-reasons-to-upgrade/");
    const hydrated = hydrateOverviewRowsFromPrefetchInventory(
      [row],
      site,
      [
        {
          id: 42,
          url: "https://example.com/5-reasons-to-upgrade/",
          collection: "posts",
          slug: "5-reasons-to-upgrade",
          date_gmt: "2026-04-07T12:00:00",
          fields: {
            title: "Five Reasons To Upgrade",
            meta: "",
            excerpt: "Short meta excerpt for the post.",
            keyword: "reasons to upgrade",
          },
          acf: { keyword_focus: "reasons to upgrade" },
        },
      ],
    );

    expect(hydrated[0]?.title).toBe("Five Reasons To Upgrade");
    expect(hydrated[0]?.metaDescription).toBe("Short meta excerpt for the post.");
    expect(hydrated[0]?.focusKeyword).toBe("reasons to upgrade");
    expect(hydrated[0]?.postId).toBe(42);
  });

  it("leaves rows unchanged when prefetch is url-only shells", () => {
    const row = createEmptyOverviewRow("https://example.com/hello/");
    const hydrated = hydrateOverviewRowsFromPrefetchInventory(
      [row],
      site,
      [{ id: 0, url: "https://example.com/hello/", collection: "posts", slug: "", fields: { title: "", meta: "", keyword: "" } }],
    );
    expect(hydrated[0]?.title).toBe("");
  });
});
