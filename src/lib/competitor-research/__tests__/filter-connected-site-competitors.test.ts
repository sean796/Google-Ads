import { describe, expect, it } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import type { CompetitorGridPlaceRow } from "@/lib/competitor-research/local-dominator-grid-parse";
import {
  connectedSiteHostnames,
  filterPlacesExcludingConnectedSite,
  hostnameFromUrl,
  isConnectedSiteHostname,
  normalizeCompetitorHostname,
} from "@/lib/competitor-research/filter-connected-site-competitors";

function blindMagicSite(): WordPressSite {
  return {
    id: "site-1",
    name: "Blind Magic",
    siteUrl: "https://www.blindmagic.com",
    productionSiteUrl: "https://blindmagic.com",
  } as WordPressSite;
}

function place(overrides: Partial<CompetitorGridPlaceRow>): CompetitorGridPlaceRow {
  return {
    dfsKeyword: "cid:123",
    businessName: "Blind Magic Window Coverings",
    rank: 1,
    latitude: 53.5,
    longitude: -113.5,
    idLabel: "123",
    websiteHostname: null,
    ...overrides,
  };
}

describe("normalizeCompetitorHostname", () => {
  it("lowercases and strips www", () => {
    expect(normalizeCompetitorHostname("WWW.BlindMagic.COM")).toBe("blindmagic.com");
  });
});

describe("connectedSiteHostnames", () => {
  it("includes production and staging hostnames", () => {
    const hosts = connectedSiteHostnames(blindMagicSite());
    expect(hosts.has("blindmagic.com")).toBe(true);
    expect(hosts.size).toBeGreaterThanOrEqual(1);
  });
});

describe("isConnectedSiteHostname", () => {
  it("matches www and bare host", () => {
    const site = blindMagicSite();
    expect(isConnectedSiteHostname("www.blindmagic.com", site)).toBe(true);
    expect(isConnectedSiteHostname("blindmagic.com", site)).toBe(true);
    expect(isConnectedSiteHostname("competitor.com", site)).toBe(false);
  });
});

describe("filterPlacesExcludingConnectedSite", () => {
  it("drops rows when business name matches connected site", () => {
    const site = blindMagicSite();
    const places = [
      place({ websiteHostname: null }),
      place({
        dfsKeyword: "cid:456",
        businessName: "Budget Blinds",
        websiteHostname: "budgetblinds.com",
        rank: 2,
      }),
    ];
    const filtered = filterPlacesExcludingConnectedSite(places, site);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.businessName).toBe("Budget Blinds");
  });

  it("drops rows when CSV website matches connected site", () => {
    const site = blindMagicSite();
    const places = [
      place({ websiteHostname: hostnameFromUrl("https://blindmagic.com") }),
      place({
        dfsKeyword: "cid:456",
        businessName: "Budget Blinds",
        websiteHostname: "budgetblinds.com",
        rank: 2,
      }),
    ];
    const filtered = filterPlacesExcludingConnectedSite(places, site);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.businessName).toBe("Budget Blinds");
  });

  it("drops rows when resolved DFS hostname matches connected site", () => {
    const site = blindMagicSite();
    const places = [
      place({ dfsKeyword: "cid:111", businessName: "Self" }),
      place({ dfsKeyword: "cid:222", businessName: "Rival", rank: 2 }),
    ];
    const hostnameByDfsKeyword = new Map<string, string | null>([
      ["cid:111", "blindmagic.com"],
      ["cid:222", "rival.com"],
    ]);
    const filtered = filterPlacesExcludingConnectedSite(places, site, hostnameByDfsKeyword);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.businessName).toBe("Rival");
  });
});
