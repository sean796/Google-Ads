import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";

vi.mock("@/lib/wordpress-api/connection", () => ({
  BACKEND_API_BASE: "",
  backendApiUrl: (path: string) => `/api${path.startsWith("/") ? path : `/${path}`}`,
}));

vi.mock("@/lib/wordpress-api", () => ({
  getSiteInventoryBulk: vi.fn(),
}));

vi.mock("@/lib/overview/overview-sap-entity-inventory", () => ({
  fetchOverviewSapInventoryFromEntitySitemap: vi.fn(),
}));

vi.mock("@/lib/sitemap-optimizer/entity-compression-profile", () => ({
  entityEndpointFromSite: (site: { entitySitemapUrl?: string }) =>
    site.entitySitemapUrl?.trim() ? "service-area" : "",
}));

vi.mock("@/lib/overview/sap-peer-market-select", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/overview/sap-peer-market-select")
  >();
  return {
    ...actual,
    resolveMarketCityForPlaceEntity: vi.fn(),
  };
});

function makeSite(overrides: Partial<WordPressSite> & { id: string }): WordPressSite {
  return {
    name: overrides.id,
    siteUrl: `https://${overrides.id}.example.com`,
    username: "user",
    appPassword: "pass",
    ...overrides,
  } as WordPressSite;
}

const target = makeSite({
  id: "target",
  siteUrl: "https://target.example.com",
  entitySitemapUrl: "https://target.example.com/service-area-sitemap.xml",
});

const edmontonPeer = makeSite({
  id: "edmonton-peer",
  entitySitemapUrl: "https://edmonton-peer.example.com/service-area-sitemap.xml",
  napInfo: { locations: [{ city: "Edmonton", address: "123 St" }] },
} as Partial<WordPressSite> & { id: string });

const calgaryPeer = makeSite({
  id: "calgary-peer",
  entitySitemapUrl: "https://calgary-peer.example.com/service-area-sitemap.xml",
  napInfo: { locations: [{ city: "Calgary", address: "456 Ave" }] },
} as Partial<WordPressSite> & { id: string });

const targetClone = makeSite({
  id: "target-clone",
  siteUrl: "https://target.example.com",
  entitySitemapUrl: "https://target.example.com/service-area-sitemap.xml",
  napInfo: { locations: [{ city: "Edmonton", address: "789 St" }] },
} as Partial<WordPressSite> & { id: string });

function stubResolveFetch(urls: Record<number, string>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/wordpress/resolve-featured-media")) {
        return {
          ok: true,
          json: async () => ({ success: true, urls }),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
}

describe("searchPeerFeaturedImage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { clearPeerFeaturedImageSearchCache } = await import(
      "@/lib/overview/sap-peer-featured-image-search"
    );
    clearPeerFeaturedImageSearchCache();
  });

  it("entity mode: city-filters before download and only loads entity collections", async () => {
    const { resolveMarketCityForPlaceEntity } = await import(
      "@/lib/overview/sap-peer-market-select"
    );
    const { fetchOverviewSapInventoryFromEntitySitemap } = await import(
      "@/lib/overview/overview-sap-entity-inventory"
    );
    const { getSiteInventoryBulk } = await import("@/lib/wordpress-api");
    vi.mocked(resolveMarketCityForPlaceEntity).mockResolvedValue("Edmonton");
    vi.mocked(fetchOverviewSapInventoryFromEntitySitemap).mockResolvedValue({
      rows: [
        {
          url: "https://edmonton-peer.example.com/alberta-avenue-edmonton/",
          slug: "alberta-avenue-edmonton",
          fields: { title: "Alberta Avenue Edmonton", meta: "", keyword: "" },
          featuredMediaId: 55,
        },
      ],
      errors: {},
    } as never);
    stubResolveFetch({ 55: "https://edmonton-peer.example.com/wp-content/uploads/aa.jpg" });

    const { searchPeerFeaturedImage } = await import(
      "@/lib/overview/sap-peer-featured-image-search"
    );
    const result = await searchPeerFeaturedImage({
      sites: [edmontonPeer, calgaryPeer, targetClone],
      excludeSite: target,
      mode: "entity",
      placeEntity: "Alberta Avenue Edmonton",
      apiKey: "test-key",
    });

    // Calgary peer never downloaded (city filter before load); blog loader untouched.
    expect(vi.mocked(fetchOverviewSapInventoryFromEntitySitemap)).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(fetchOverviewSapInventoryFromEntitySitemap).mock.calls[0]![0].id,
    ).toBe("edmonton-peer");
    expect(vi.mocked(getSiteInventoryBulk)).not.toHaveBeenCalled();

    expect(result.hit).not.toBeNull();
    expect(result.hit!.sourceSiteUrl).toBe(edmontonPeer.siteUrl);
    expect(result.hit!.imageUrl).toContain("aa.jpg");
    expect(result.csvFile?.name).toBe("peer-featured-library-sap.csv");
    expect(result.csvFile?.content).toContain("alberta-avenue-edmonton");
  });

  it("entity mode: never searches the target site (same URL, different id)", async () => {
    const { resolveMarketCityForPlaceEntity } = await import(
      "@/lib/overview/sap-peer-market-select"
    );
    const { fetchOverviewSapInventoryFromEntitySitemap } = await import(
      "@/lib/overview/overview-sap-entity-inventory"
    );
    vi.mocked(resolveMarketCityForPlaceEntity).mockResolvedValue("Edmonton");
    vi.mocked(fetchOverviewSapInventoryFromEntitySitemap).mockResolvedValue({
      rows: [],
      errors: {},
    } as never);
    stubResolveFetch({});

    const { searchPeerFeaturedImage } = await import(
      "@/lib/overview/sap-peer-featured-image-search"
    );
    const result = await searchPeerFeaturedImage({
      sites: [targetClone],
      excludeSite: target,
      mode: "entity",
      placeEntity: "Alberta Avenue Edmonton",
      apiKey: "test-key",
    });

    expect(vi.mocked(fetchOverviewSapInventoryFromEntitySitemap)).not.toHaveBeenCalled();
    expect(result.hit).toBeNull();
  });

  it("blog mode: only loads posts collections and matches keywords ignoring order", async () => {
    const { getSiteInventoryBulk } = await import("@/lib/wordpress-api");
    const { fetchOverviewSapInventoryFromEntitySitemap } = await import(
      "@/lib/overview/overview-sap-entity-inventory"
    );
    vi.mocked(getSiteInventoryBulk).mockResolvedValue({
      site: { url: "" },
      rows: [
        {
          collection: "posts",
          url: "https://edmonton-peer.example.com/custom-blinds-edmonton/",
          slug: "custom-blinds-edmonton",
          fields: {
            title: "Edmonton Custom Blinds Guide",
            meta: "",
            keyword: "edmonton custom blinds",
          },
          featuredMediaId: 77,
        },
        {
          collection: "posts",
          url: "https://edmonton-peer.example.com/no-image/",
          slug: "no-image",
          fields: { title: "Custom Blinds Edmonton", meta: "", keyword: "custom blinds edmonton" },
        },
      ],
    } as never);
    stubResolveFetch({ 77: "https://edmonton-peer.example.com/wp-content/uploads/blinds.jpg" });

    const { searchPeerFeaturedImage } = await import(
      "@/lib/overview/sap-peer-featured-image-search"
    );
    const result = await searchPeerFeaturedImage({
      sites: [edmontonPeer, targetClone],
      excludeSite: target,
      mode: "blog",
      keyword: "custom blinds edmonton",
    });

    expect(vi.mocked(fetchOverviewSapInventoryFromEntitySitemap)).not.toHaveBeenCalled();
    expect(vi.mocked(getSiteInventoryBulk)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getSiteInventoryBulk).mock.calls[0]![3]).toMatchObject({
      collections: ["posts"],
    });

    expect(result.hit).not.toBeNull();
    expect(result.hit!.mediaId).toBe(77);
    expect(result.hit!.score).toBe(3);
    expect(result.csvFile?.name).toBe("peer-featured-library-blogs.csv");
  });

  it("blog mode: returns no hit when keywords do not overlap enough", async () => {
    const { getSiteInventoryBulk } = await import("@/lib/wordpress-api");
    vi.mocked(getSiteInventoryBulk).mockResolvedValue({
      site: { url: "" },
      rows: [
        {
          collection: "posts",
          url: "https://edmonton-peer.example.com/roof-repair/",
          slug: "roof-repair",
          fields: { title: "Roof Repair", meta: "", keyword: "roof repair toronto" },
          featuredMediaId: 88,
        },
      ],
    } as never);
    stubResolveFetch({ 88: "https://edmonton-peer.example.com/wp-content/uploads/roof.jpg" });

    const { searchPeerFeaturedImage } = await import(
      "@/lib/overview/sap-peer-featured-image-search"
    );
    const result = await searchPeerFeaturedImage({
      sites: [edmontonPeer],
      excludeSite: target,
      mode: "blog",
      keyword: "custom blinds edmonton",
    });

    expect(result.hit).toBeNull();
  });
});
