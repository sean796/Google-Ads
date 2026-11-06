import { describe, expect, it } from "vitest";
import type { Location, WordPressSite } from "@/components/integrations/types";
import { selectCompetitorPlacesForRun } from "@/lib/competitor-research/filter-connected-site-competitors";
import {
  buildMapsSearchKeyword,
  parseOrganicSerpPlacesFromJson,
  resolveProfileMapsGeo,
} from "@/lib/competitor-research/discover-competitor-places-from-dfs";
import { profileGeoToDataForSeoLocationName } from "@/lib/competitor-research/dfs-profile-location-name";

function siteWithLocation(partial: Partial<Location>): WordPressSite {
  return {
    id: "s1",
    name: "Acme Blinds",
    siteUrl: "https://acme.example.com",
    username: "u",
    appPassword: "p",
    connectedAt: 0,
    locations: [
      {
        id: "loc1",
        name: "Main",
        address: "1 Main St",
        city: "Edmonton",
        state: "AB",
        zip: "T5K 0A1",
        phone: "",
        isDefault: true,
        country: "Canada",
        ...partial,
      },
    ],
  };
}

describe("resolveProfileMapsGeo", () => {
  it("reads city and region from Integrations profile location", () => {
    const geo = resolveProfileMapsGeo(siteWithLocation({}));
    expect(geo.city).toBe("Edmonton");
    expect(geo.region).toBe("AB");
    expect(geo.cityRegionLabel).toContain("Edmonton");
    expect(geo.countryCode).toBe("CA");
  });

  it("throws when profile has no city or region", () => {
    expect(() =>
      resolveProfileMapsGeo(
        siteWithLocation({ city: "", state: "" }),
      ),
    ).toThrow(/Integrations profile/i);
  });
});

describe("profileGeoToDataForSeoLocationName (from profile)", () => {
  it("matches Integrations Edmonton profile", () => {
    const geo = resolveProfileMapsGeo(siteWithLocation({}));
    expect(profileGeoToDataForSeoLocationName(geo)).toBe("Edmonton,Alberta,Canada");
  });
});

describe("buildMapsSearchKeyword", () => {
  it("combines service keyword with city label", () => {
    expect(buildMapsSearchKeyword("custom blinds", "Edmonton, AB")).toBe("custom blinds Edmonton, AB");
  });
});

describe("parseOrganicSerpPlacesFromJson", () => {
  const fixture = {
    tasks: [
      {
        status_code: 20000,
        result: [
          {
            items: [
              {
                type: "local_pack",
                title: "Budget Blinds Edmonton",
                url: "https://www.budgetblinds.com/westedmonton/",
                domain: "www.budgetblinds.com",
              },
              {
                type: "organic",
                title: "Competitor One Blinds",
                url: "https://competitor-one.example.com/services",
                description: "Custom blinds",
              },
              {
                type: "organic",
                title: "Competitor One Blinds",
                url: "https://competitor-one.example.com/about",
                description: "Duplicate host",
              },
              {
                type: "organic",
                title: "Competitor Two Window Coverings",
                url: "https://www.competitor-two.example.com/",
                description: "Shutters and blinds",
              },
            ],
          },
        ],
      },
    ],
  };

  it("extracts ranked places by domain with host dfsKeyword and dedupes", () => {
    const places = parseOrganicSerpPlacesFromJson(fixture, 10);
    expect(places).toHaveLength(3);
    expect(places[0]?.businessName).toBe("Budget Blinds Edmonton");
    expect(places[0]?.websiteHostname).toBe("budgetblinds.com");
    expect(places[1]?.businessName).toBe("Competitor One Blinds");
    expect(places[1]?.rank).toBe(2);
    expect(places[1]?.dfsKeyword).toBe("host:competitor-one.example.com");
    expect(places[2]?.dfsKeyword).toBe("host:competitor-two.example.com");
  });

  it("excludes connected site when selecting run places", () => {
    const site = siteWithLocation({});
    site.siteUrl = "https://competitor-one.example.com";
    const places = parseOrganicSerpPlacesFromJson(fixture, 10, site);
    expect(places.map((p) => p.websiteHostname)).not.toContain("competitor-one.example.com");
    expect(places.some((p) => p.businessName.includes("Competitor Two"))).toBe(true);
    const capped = selectCompetitorPlacesForRun(places, site, 5);
    expect(capped.every((p) => p.websiteHostname !== "competitor-one.example.com")).toBe(true);
  });
});
