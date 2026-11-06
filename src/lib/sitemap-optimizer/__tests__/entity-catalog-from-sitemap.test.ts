import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import { fetchEntityCatalogFromSitemap } from "@/lib/sitemap-optimizer/entity-catalog-from-sitemap";

vi.mock("@/lib/wordpress-api", () => ({
  parseSitemap: vi.fn(),
}));

import { parseSitemap } from "@/lib/wordpress-api";

const site = {
  id: "s1",
  siteUrl: "https://example.com",
  entitySitemapUrl: "https://example.com/service-area-sitemap.xml",
  username: "u",
  appPassword: "p",
} as WordPressSite;

describe("fetchEntityCatalogFromSitemap", () => {
  beforeEach(() => {
    vi.mocked(parseSitemap).mockReset();
  });

  it("maps sitemap loc URLs to inventory rows without REST pagination", async () => {
    vi.mocked(parseSitemap).mockResolvedValue({
      urls: [
        "https://example.com/service-area/jensen-beach-fl/",
        "https://example.com/service-area/stuart-fl/",
      ],
      type: "urlset",
    });

    const res = await fetchEntityCatalogFromSitemap(site, "service-area");
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(parseSitemap).toHaveBeenCalledTimes(1);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]?.url).toBe("https://example.com/service-area/jensen-beach-fl/");
    expect(res.rows[0]?.title).toBe("Jensen Beach Fl");
    expect(res.rows[0]?.postId).toBe("slug:jensen-beach-fl");
    expect(res.rows[0]?.collection).toBe("service-area");
  });

  it("errors when entity sitemap URL is missing", async () => {
    const res = await fetchEntityCatalogFromSitemap(
      { ...site, entitySitemapUrl: "" },
      "service-area",
    );
    expect(res.ok).toBe(false);
    if (res.ok === true) return;
    expect(res.error).toMatch(/entity sitemap/i);
    expect(parseSitemap).not.toHaveBeenCalled();
  });
});
