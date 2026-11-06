import { describe, expect, it } from "vitest";
import { buildSitemapOptimizerCollectionOptions } from "@/lib/sitemap-optimizer/collection-options";
import { buildSitemapOptimizerToolbarClusters } from "@/lib/sitemap-optimizer/sitemap-optimizer-toolbar-clusters";
import { SITEMAP_OPTIMIZER_SAP_LABEL } from "@/lib/sitemap-optimizer/sitemap-optimizer-toolbar-copy";
import type { WordPressSite } from "@/components/integrations/types";

describe("buildSitemapOptimizerToolbarClusters", () => {
  it("returns no toolbar clusters (compression controls removed)", () => {
    expect(buildSitemapOptimizerToolbarClusters()).toEqual([]);
  });

  it("entity collection option label contains SAP", () => {
    const site = {
      id: "1",
      name: "Test",
      siteUrl: "https://example.com",
      username: "user",
      appPassword: "pass",
      connectedAt: 0,
      entitySitemapUrl: "https://example.com/service-area-sitemap.xml",
    } satisfies WordPressSite;
    const entity = buildSitemapOptimizerCollectionOptions(site).find((o) => o.key === "entity");
    expect(entity?.label).toContain(SITEMAP_OPTIMIZER_SAP_LABEL);
    expect(entity?.label).not.toContain("Entity");
  });
});
