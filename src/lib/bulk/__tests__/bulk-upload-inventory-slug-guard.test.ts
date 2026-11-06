import { describe, expect, it } from "vitest";
import {
  assertWordPressCreateKeptSlug,
  findUploadSlugConflict,
  reserveUploadSlug,
} from "@/lib/bulk/bulk-upload-inventory-slug-guard";
import type { WordPressSite } from "@/components/integrations/types";
import type { SiteInventoryBulkRow } from "@/lib/wordpress-api/types";

const site: WordPressSite = {
  id: "site-1",
  name: "Advance Blinds",
  siteUrl: "https://example.com",
  username: "u",
  appPassword: "p",
  connectedAt: 0,
};

function sapRow(slug: string, url?: string): SiteInventoryBulkRow {
  return {
    id: 5320,
    slug,
    url: url ?? `https://example.com/${slug}/`,
    collection: "service-area",
    fields: { title: "Plum Coulee page", meta: "", keyword: "" },
  };
}

describe("findUploadSlugConflict", () => {
  it("blocks slug that already exists in inventory (scheduled or published)", () => {
    const conflict = findUploadSlugConflict({
      site,
      slug: "advanced-window-coverings-plum-coulee-mb",
      inventoryRows: [sapRow("advanced-window-coverings-plum-coulee-mb")],
    });
    expect(conflict?.slug).toBe("advanced-window-coverings-plum-coulee-mb");
    expect(conflict?.reason).toContain("already exists");
    expect(conflict?.existingPostId).toBe(5320);
    expect(conflict?.existingUrl).toBe(
      "https://example.com/advanced-window-coverings-plum-coulee-mb/",
    );
  });

  it("matches slug from the URL path when the inventory slug field is empty", () => {
    const conflict = findUploadSlugConflict({
      site,
      slug: "blinds-old-naples-florida-fl",
      inventoryRows: [
        {
          id: 8812,
          slug: "",
          url: "https://lindseyblindsetc.com/blinds-old-naples-florida-fl/",
          collection: "posts",
          fields: { title: "Blinds Near Old Naples, Florida", meta: "", keyword: "" },
        },
      ],
    });
    expect(conflict?.existingPostId).toBe(8812);
    expect(conflict?.existingUrl).toContain("blinds-old-naples-florida-fl");
  });

  it("blocks slug reserved earlier in the same run", () => {
    const reserved = new Map<string, Set<string>>();
    reserveUploadSlug(reserved, site.id, "advanced-window-coverings-plum-coulee-mb");
    const conflict = findUploadSlugConflict({
      site,
      slug: "advanced-window-coverings-plum-coulee-mb",
      inventoryRows: [],
      reservedSlugs: reserved.get(site.id),
    });
    expect(conflict?.reason).toContain("this run");
  });

  it("allows a new slug when inventory and run reservations are clear", () => {
    const conflict = findUploadSlugConflict({
      site,
      slug: "advanced-window-coverings-winkler-mb",
      inventoryRows: [sapRow("advanced-window-coverings-plum-coulee-mb")],
    });
    expect(conflict).toBeNull();
  });
});

describe("assertWordPressCreateKeptSlug", () => {
  it("allows the requested slug", () => {
    expect(() =>
      assertWordPressCreateKeptSlug(
        "hunter-douglas-vs-alta",
        "https://lindseyblindsetc.com/blog/hunter-douglas-vs-alta/",
      ),
    ).not.toThrow();
  });

  it("rejects a numbered clone slug", () => {
    expect(() =>
      assertWordPressCreateKeptSlug(
        "hunter-douglas-vs-alta",
        "https://lindseyblindsetc.com/blog/hunter-douglas-vs-alta-2/",
      ),
    ).toThrow(/numbered slug/);
  });
});
