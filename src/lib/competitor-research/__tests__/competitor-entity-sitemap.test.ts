import { describe, expect, it } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import {
  requireEntitySitemapUrlForRow,
  resolveEntityEndpointForRow,
  resolveEntitySitemapUrlForRow,
} from "@/lib/competitor-research/competitor-entity-sitemap";

const baseSite = {
  id: "1",
  name: "Blind Magic",
  siteUrl: "https://blindmagic.com",
  username: "u",
  appPassword: "p",
  entitySitemapUrl: "https://blindmagic.com/service-area-sitemap.xml",
  competitorEntitySitemapUrl: "https://blindmagic.com/competitor-sitemap.xml",
  connectedAt: 0,
} satisfies WordPressSite;

describe("competitor-entity-sitemap", () => {
  it("routes competitor rows to competitor sitemap URL and endpoint", () => {
    const row = { keyword: "competitor - Highend Blinds Inc" };
    expect(resolveEntitySitemapUrlForRow(baseSite, row)).toBe(
      "https://blindmagic.com/competitor-sitemap.xml",
    );
    expect(resolveEntityEndpointForRow(baseSite, row, "entity")).toBe("competitor");
  });

  it("routes SAP rows to entity sitemap URL", () => {
    const row = { keyword: "blinds" };
    expect(resolveEntitySitemapUrlForRow(baseSite, row)).toBe(
      "https://blindmagic.com/service-area-sitemap.xml",
    );
    expect(resolveEntityEndpointForRow(baseSite, row, "entity")).toBe("service-area");
  });

  it("throws when competitor sitemap URL is missing", () => {
    const site = { ...baseSite, competitorEntitySitemapUrl: undefined };
    expect(() =>
      requireEntitySitemapUrlForRow(site, { keyword: "competitor - Acme" }),
    ).toThrow(/Competitor sitemap URL/);
  });
});
