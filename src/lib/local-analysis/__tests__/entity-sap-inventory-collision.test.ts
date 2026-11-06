import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SiteInventoryBulkRow } from "@/lib/wordpress-api/types";

vi.mock("@/lib/content-brand-ai-gate", () => ({
  aiFilterAllowedBrandTexts: vi.fn(async ({ candidates }: { candidates: string[] }) => candidates),
  aiRejectBrandOrBlockedTexts: vi.fn(async () => []),
}));

import {
  buildEntitySapOccupancy,
  collectBlockedForEntity,
  entityKeywordPairKey,
  findEntitySapRowCollision,
  parseEntityFromSapTitle,
  resolveEntitySapRowCollisionsViaOpenRouter,
  reserveEntitySapSlug,
} from "@/lib/local-analysis/entity-sap-inventory-collision";
import { buildSapSlugFromKeywordEntity } from "@/lib/sap-slug-from-keyword-entity";

const PLUM_COLEE_ENTITY = "Plum Coulee, MB";
const EXISTING_TITLE = "Advanced Window Coverings Near Plum Coulee, MB";
const EXISTING_KEYWORD = "advanced window coverings plum coulee mb";
const EXISTING_SLUG = "advanced-window-coverings-plum-coulee-mb";

function plumCouleeInventoryRow(): SiteInventoryBulkRow {
  return {
    id: 5320,
    slug: EXISTING_SLUG,
    url: `https://example.com/${EXISTING_SLUG}/`,
    collection: "service-area",
    fields: {
      title: EXISTING_TITLE,
      meta: "",
      keyword: EXISTING_KEYWORD,
    },
    acf: { keyword_focus: EXISTING_KEYWORD },
  };
}

describe("entity-sap-inventory-collision", () => {
  it("parseEntityFromSapTitle extracts entity from Near pattern", () => {
    expect(parseEntityFromSapTitle(EXISTING_TITLE)).toBe(PLUM_COLEE_ENTITY);
  });

  it("buildEntitySapOccupancy indexes Plum Coulee existing page", () => {
    const occupancy = buildEntitySapOccupancy([plumCouleeInventoryRow()]);
    expect(occupancy.slugKeys.has(EXISTING_SLUG)).toBe(true);
    const blocked = collectBlockedForEntity(occupancy, PLUM_COLEE_ENTITY);
    expect(blocked.existingPages).toHaveLength(1);
    expect(blocked.titles).toContain(EXISTING_TITLE.toLowerCase());
  });

  it("findEntitySapRowCollision blocks duplicate keyword for same entity", () => {
    const occupancy = buildEntitySapOccupancy([plumCouleeInventoryRow()]);
    const collision = findEntitySapRowCollision(
      {
        keyword: EXISTING_KEYWORD,
        entity: PLUM_COLEE_ENTITY,
        titleTemplate: "{keyword} Near {entity}",
      },
      occupancy,
    );
    expect(collision).not.toBeNull();
    expect(collision?.kind).toBe("slug");
  });

  it("findEntitySapRowCollision blocks duplicate predicted title", () => {
    const occupancy = buildEntitySapOccupancy([plumCouleeInventoryRow()]);
    const collision = findEntitySapRowCollision(
      {
        keyword: EXISTING_KEYWORD,
        entity: PLUM_COLEE_ENTITY,
        titleTemplate: "{keyword} Near {entity}",
      },
      occupancy,
    );
    expect(collision?.kind).toMatch(/keyword|title|slug/);
  });

  it("alternate keyword produces unique slug for Plum Coulee", () => {
    const occupancy = buildEntitySapOccupancy([plumCouleeInventoryRow()]);
    const altKeyword = "motorized blinds plum coulee mb";
    const altSlug = buildSapSlugFromKeywordEntity(altKeyword, PLUM_COLEE_ENTITY);
    expect(altSlug).not.toBe(EXISTING_SLUG);
    expect(
      findEntitySapRowCollision(
        { keyword: altKeyword, entity: PLUM_COLEE_ENTITY, titleTemplate: "{keyword} Near {entity}" },
        occupancy,
      ),
    ).toBeNull();
  });

  it("reservedSlugsInRun blocks within-run duplicate slug in the same ad group", () => {
    const occupancy = buildEntitySapOccupancy([]);
    const reserved = new Set<string>();
    const keyword = "custom blinds plum coulee mb";
    reserveEntitySapSlug(reserved, keyword, PLUM_COLEE_ENTITY);
    const slug = buildSapSlugFromKeywordEntity(keyword, PLUM_COLEE_ENTITY);
    expect(slug).toBeTruthy();
    const collision = findEntitySapRowCollision(
      { keyword, entity: PLUM_COLEE_ENTITY },
      occupancy,
      reserved,
    );
    expect(collision?.kind).toBe("slug");
  });

  it("allows the same keyword in different ad groups", () => {
    const occupancy = buildEntitySapOccupancy([]);
    const keyword = "custom blinds plum coulee mb";
    const reservedGroupA = new Set<string>();
    reserveEntitySapSlug(reservedGroupA, keyword, PLUM_COLEE_ENTITY);
    const collisionInOtherGroup = findEntitySapRowCollision(
      { keyword, entity: PLUM_COLEE_ENTITY },
      occupancy,
      new Set<string>(),
    );
    expect(collisionInOtherGroup).toBeNull();
  });

  it("entityKeywordPairKey treats same GSC base + different entity as different pairs", () => {
    expect(entityKeywordPairKey("blinds near me", "Schanzenfeld, MB")).not.toBe(
      entityKeywordPairKey("blinds near me", "Transcona, Winnipeg, MB"),
    );
  });

  it("entityKeywordPairKey treats different service + same entity as different pairs", () => {
    expect(entityKeywordPairKey("roman shades schanzenfeld mb", "Schanzenfeld, MB")).not.toBe(
      entityKeywordPairKey("roller blinds schanzenfeld mb", "Schanzenfeld, MB"),
    );
  });

  describe("resolveEntitySapRowCollisionsViaOpenRouter", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          json: async () => ({
            ok: true,
            content: JSON.stringify({ keyword: "motorized blinds" }),
            raw: {
              choices: [{ message: { content: JSON.stringify({ keyword: "motorized blinds" }) } }],
            },
          }),
        })),
      );
    });

    afterEach(() => {
      vi.stubGlobal("fetch", originalFetch);
    });

    it("replaces colliding keyword with OpenRouter variation", async () => {
      const occupancy = buildEntitySapOccupancy([plumCouleeInventoryRow()]);
      const rows = [{ entity: PLUM_COLEE_ENTITY, keyword: EXISTING_KEYWORD, title: "" }];
      const resolved = await resolveEntitySapRowCollisionsViaOpenRouter({
        apiKey: "test-key",
        model: "test-model",
        siteName: "Blind Dealer",
        siteUrl: "https://example.com",
        rows,
        occupancy,
        gscKeywords: ["motorized blinds", "roman shades"],
        seedKeywords: [""],
        gridLocations: [],
        titleTemplate: "{keyword} Near {entity}",
      });
      expect(resolved[0]?.keyword).toContain("motorized blinds");
      expect(
        findEntitySapRowCollision(
          {
            keyword: resolved[0]!.keyword!,
            entity: PLUM_COLEE_ENTITY,
            titleTemplate: "{keyword} Near {entity}",
          },
          occupancy,
        ),
      ).toBeNull();
    });
  });
});
