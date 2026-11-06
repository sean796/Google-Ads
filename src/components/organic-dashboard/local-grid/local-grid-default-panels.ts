import type { WordPressSite } from "@/components/integrations/types";
import { createFallbackWorkspace } from "@/lib/local-grid-studio/local-grid-workspace-persist";
import type { LocalGridWorkspacePanel } from "@/lib/local-grid-studio/local-grid-workspace-panels";

export function createDefaultPanelsForSite(
  site: WordPressSite | undefined,
  defaultSiteId: string,
  createId: () => string,
): { panels: LocalGridWorkspacePanel[]; activePanelId: string } {
  const kw = site?.primaryLocalKeyword?.trim() || "blinds near me";
  const locs =
    site?.locations && site.locations.length > 0
      ? site.locations
      : site?.napInfo?.locations ?? [];
  if (locs.length === 0) {
    return createFallbackWorkspace(defaultSiteId, createId);
  }
  const panels: LocalGridWorkspacePanel[] = locs.map((loc, idx) => {
    const addr = [loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(", ");
    return {
      id: `grid_${defaultSiteId}_loc_${idx + 1}`,
      siteId: defaultSiteId,
      layoutLocked: false,
      layoutSnapshot: {
        keyword: kw,
        centerLat: 53.5461,
        centerLng: -113.4938,
        scanSize: "7x7",
        shape: "circle",
        distance: 3,
        distanceMeasure: "mile",
        activeBusiness: {
          key: `biz:${defaultSiteId}:loc:${idx + 1}`,
          business: loc.name || site?.napInfo?.name || site?.name || "",
          address: addr,
          placeId: site?.gbpLocationId?.trim() || "",
          cid: site?.gbpLocationId?.trim() || "",
          websiteUrl: (site?.productionSiteUrl || site?.siteUrl || "").trim(),
          primaryCategory: "",
          secondaryCategories: "",
          rating: null,
          reviews: null,
          latitude: null,
          longitude: null,
        },
        activeScanId: null,
      },
    };
  });
  return {
    panels,
    activePanelId: panels[0]!.id,
  };
}
