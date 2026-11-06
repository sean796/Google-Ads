import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { runGbpPostCardPipeline } from "@/lib/gbp-post/gbp-post-card-pipeline";
import type { WordPressSite } from "@/components/integrations/types";

const sampleSite: WordPressSite = {
  id: "site-1",
  name: "Advance Blinds",
  siteUrl: "https://example.com",
  username: "user",
  appPassword: "pass",
  connectedAt: 0,
  gbpLocationId: "loc-1",
  enabled: true,
};

describe("runGbpPostCardPipeline preferredUrl", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        expect(body.preferredUrl).toBe("https://example.com/target-page");
        return new Response(
          JSON.stringify({
            success: true,
            blogPost: {
              blogPostUrl: "https://example.com/target-page",
              blogPostTitle: "Target Page",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes preferredUrl in pick-blog-post when landing page URL is set", async () => {
    await runGbpPostCardPipeline({
      site: sampleSite,
      keyword: "blinds",
      landingPageUrl: "https://example.com/target-page",
      openRouterApiKey: "test-key",
      sitemapSource: "pages",
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
