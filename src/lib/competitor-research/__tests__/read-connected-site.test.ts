import { describe, expect, it } from "vitest";
import { readConnectedSiteProfile } from "@/lib/competitor-research/read-connected-site";
import type { WordPressSite } from "@/components/integrations/types";

describe("readConnectedSiteProfile", () => {
  it("does not require credentials or sitemap fetch", async () => {
    const site: WordPressSite = {
      id: "s1",
      name: "Blind Magic",
      siteUrl: "https://blindmagic.com/",
      username: "",
      appPassword: "",
      connectedAt: 0,
      industryVertical: "Window coverings",
      sitemaps: {
        mainSitemapUrl: "https://blindmagic.com/sitemap_index.xml",
        detectedAt: 0,
        type: "index",
        postMetadata: {
          posts: {
            posts: [
              {
                id: 1,
                slug: "custom-blinds",
                title: "Custom Blinds Edmonton",
                date_gmt: "2026-01-01",
                status: "publish",
                link: "https://blindmagic.com/custom-blinds/",
              },
            ],
            futureCount: 0,
            lastChecked: 0,
          },
        },
      },
    };

    const profile = await readConnectedSiteProfile(site);
    expect(profile.siteName).toBe("Blind Magic");
    expect(profile.samplePages).toHaveLength(1);
    expect(profile.samplePages[0]?.url).toContain("blindmagic.com");
    expect(profile.services).toContain("Window coverings");
  });
});
