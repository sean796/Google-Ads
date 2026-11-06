import { describe, expect, it } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import { resolveMultiSiteRowActivityIso } from "@/lib/content-optimization/multi-site-last-completed-at";
import {
  resolvePostSitemapSyncedAtIso,
  resolveSitemapSyncedAtIsoForMode,
} from "@/lib/content-optimization/multi-site-sitemap-synced-at";

const baseSite = {
  id: "site-1",
  name: "Test",
  siteUrl: "https://example.com",
  username: "u",
  appPassword: "p",
  connectedAt: 0,
} satisfies WordPressSite;

describe("multi-site row activity date", () => {
  it("uses sitemap detectedAt for post mode", () => {
    const detectedAt = Date.parse("2026-06-26T12:00:00.000Z");
    const site: WordPressSite = {
      ...baseSite,
      sitemaps: {
        mainSitemapUrl: "https://example.com/sitemap_index.xml",
        detectedAt,
        type: "index",
        childSitemaps: ["https://example.com/post-sitemap.xml"],
      },
    };
    const iso = resolvePostSitemapSyncedAtIso(site, "https://example.com/post-sitemap.xml");
    expect(iso).toBe(new Date(detectedAt).toISOString());
  });

  it("prefers newer scrape lastChecked over older detectedAt", () => {
    const site: WordPressSite = {
      ...baseSite,
      sitemaps: {
        mainSitemapUrl: "https://example.com/sitemap_index.xml",
        detectedAt: Date.parse("2026-05-06T12:00:00.000Z"),
        type: "index",
        postMetadata: {
          "https://example.com/post-sitemap.xml": {
            posts: [],
            futureCount: 0,
            lastChecked: Date.parse("2026-06-26T15:00:00.000Z"),
          },
        },
      },
    };
    const iso = resolvePostSitemapSyncedAtIso(site, "https://example.com/post-sitemap.xml");
    expect(iso).toBe("2026-06-26T15:00:00.000Z");
  });

  it("combines sitemap sync, optimization, and manual row dates", () => {
    const site: WordPressSite = {
      ...baseSite,
      sitemaps: {
        mainSitemapUrl: "https://example.com/sitemap_index.xml",
        detectedAt: Date.parse("2026-06-26T10:00:00.000Z"),
        type: "index",
      },
    };
    const optimized = { post: "2026-05-06T08:00:00.000Z" };
    const manual = { post: "2026-07-01T12:00:00.000Z" };
    const iso = resolveMultiSiteRowActivityIso(
      optimized,
      manual,
      "post",
      site,
      "https://example.com/post-sitemap.xml",
    );
    expect(iso).toBe("2026-07-01T12:00:00.000Z");
  });

  it("uses sitemap detectedAt when it is newest", () => {
    const site: WordPressSite = {
      ...baseSite,
      sitemaps: {
        mainSitemapUrl: "https://example.com/sitemap_index.xml",
        detectedAt: Date.parse("2026-06-26T10:00:00.000Z"),
        type: "index",
      },
    };
    const optimized = { post: "2026-05-06T08:00:00.000Z" };
    const iso = resolveMultiSiteRowActivityIso(
      optimized,
      undefined,
      "post",
      site,
      "https://example.com/post-sitemap.xml",
    );
    expect(iso).toBe("2026-06-26T10:00:00.000Z");
  });

  it("uses entity mode when entity URL is configured", () => {
    const detectedAt = Date.parse("2026-06-20T09:00:00.000Z");
    const site: WordPressSite = {
      ...baseSite,
      entitySitemapUrl: "https://example.com/service-area-sitemap.xml",
      sitemaps: {
        mainSitemapUrl: "https://example.com/sitemap_index.xml",
        detectedAt,
        type: "index",
      },
    };
    const iso = resolveSitemapSyncedAtIsoForMode(site, "entity", null);
    expect(iso).toBe(new Date(detectedAt).toISOString());
  });

  it("shows post optimization date when row is set to entity", () => {
    const site: WordPressSite = { ...baseSite };
    const optimized = { post: "2026-05-06T08:00:00.000Z" };
    const iso = resolveMultiSiteRowActivityIso(
      optimized,
      undefined,
      "entity",
      site,
      "https://example.com/post-sitemap.xml",
    );
    expect(iso).toBe("2026-05-06T08:00:00.000Z");
  });

  it("shows manual post date when row is set to entity", () => {
    const site: WordPressSite = { ...baseSite };
    const manual = { post: "2026-05-21T12:00:00.000Z" };
    const iso = resolveMultiSiteRowActivityIso(undefined, manual, "entity", site, null);
    expect(iso).toBe("2026-05-21T12:00:00.000Z");
  });
});
