import { describe, expect, it } from "vitest";
import type { WordPressPostingOptions } from "@/lib/bulk-auto-generate";
import type { WordPressSite } from "@/components/IntegrationsTab";
import {
  applyRowSitemapToPosting,
  filterPromptBulkSitemapBucketsByScopes,
  inferBulkSitemapModeFromRows,
  parseBulkRowSitemapCell,
  pickSitemapTypeFromRow,
  resolveRowSitemapType,
  defaultBulkSitemapMode,
  resolveSiteSitemapMode,
  resolveUploadSitemapType,
  seedCustomRowSitemaps,
  overviewSitemapSourceToUploadConfig,
  resolveBulkEditorialScopeTag,
} from "@/lib/bulk/bulk-sitemap-mode";

describe("parseBulkRowSitemapCell", () => {
  it("normalizes common aliases", () => {
    expect(parseBulkRowSitemapCell("Posts")).toBe("post");
    expect(parseBulkRowSitemapCell("entity")).toBe("entity");
    expect(parseBulkRowSitemapCell("SAP")).toBe("entity");
    expect(parseBulkRowSitemapCell("")).toBeUndefined();
    expect(parseBulkRowSitemapCell("unknown")).toBeUndefined();
  });
});

describe("pickSitemapTypeFromRow", () => {
  it("reads sitemap header aliases", () => {
    expect(pickSitemapTypeFromRow({ sitemap: "entity" })).toBe("entity");
    expect(pickSitemapTypeFromRow({ post_destination: "posts" })).toBe("post");
  });
});

describe("resolveUploadSitemapType", () => {
  it("sends empty entity rows to posts even when Entity is selected", () => {
    expect(resolveUploadSitemapType("entity", "")).toBe("post");
    expect(resolveUploadSitemapType("entity", "  ")).toBe("post");
    expect(resolveUploadSitemapType("entity", "N/A")).toBe("post");
    expect(resolveUploadSitemapType("entity", undefined)).toBe("post");
  });

  it("keeps entity destination when the row has an entity", () => {
    expect(resolveUploadSitemapType("entity", "Plum Coulee")).toBe("entity");
    expect(resolveUploadSitemapType("post", "Plum Coulee")).toBe("post");
  });
});

describe("resolveRowSitemapType", () => {
  it("uses site mode when not custom and the row has an entity", () => {
    expect(resolveRowSitemapType("post", { sitemap_type: "entity", entity: "Winkler" }, "entity")).toBe("post");
    expect(resolveRowSitemapType("entity", { sitemap_type: "post", entity: "Winkler" }, "post")).toBe("entity");
  });

  it("never uses the entity sitemap when the entity cell is empty", () => {
    expect(resolveRowSitemapType("entity", { sitemap_type: "entity" }, "entity")).toBe("post");
    expect(resolveRowSitemapType("entity", { entity: "" }, "entity")).toBe("post");
    expect(resolveRowSitemapType("custom", { sitemap_type: "entity" }, "entity")).toBe("post");
  });

  it("uses row value in custom mode with fallback when the row has an entity", () => {
    expect(resolveRowSitemapType("custom", { sitemap_type: "entity", entity: "Winkler" }, "post")).toBe("entity");
    expect(resolveRowSitemapType("custom", {}, "post")).toBe("post");
  });
});

describe("defaultBulkSitemapMode", () => {
  it("defaults to posts until a CSV with entities is uploaded", () => {
    expect(defaultBulkSitemapMode()).toBe("post");
  });
});

describe("resolveSiteSitemapMode", () => {
  it("defaults to posts when sitemap type is unset", () => {
    expect(resolveSiteSitemapMode({}, new Set(["s1"]), true)).toBe("post");
  });

  it("keeps an explicit site config", () => {
    expect(resolveSiteSitemapMode({ s1: { sitemapType: "entity" } }, new Set(["s1"]))).toBe(
      "entity",
    );
  });
});

describe("applyRowSitemapToPosting", () => {
  it("overrides sitemapType on posting and sites", () => {
    const site = { id: "s1", name: "Test" } as WordPressSite;
    const posting: WordPressPostingOptions = {
      enabled: true,
      site,
      sitemapType: "post",
      frequency: "daily",
      startDate: new Date(),
      startTime: "09:00",
      totalRows: 1,
      sites: [{ site, sitemapType: "post" }],
    };
    const next = applyRowSitemapToPosting(posting, "entity");
    expect(next?.sitemapType).toBe("entity");
    expect(next?.sites?.[0]?.sitemapType).toBe("entity");
  });
});

describe("inferBulkSitemapModeFromRows", () => {
  it("returns post when no explicit column and no entities", () => {
    expect(inferBulkSitemapModeFromRows([{ keyword: "a", title: "A" }])).toEqual({
      mode: "post",
      rows: [{ keyword: "a", title: "A" }],
    });
  });

  it("returns entity when rows have entity values and no sitemap column", () => {
    expect(
      inferBulkSitemapModeFromRows([{ keyword: "a", title: "A", entity: "Old Naples" }]).mode,
    ).toBe("entity");
  });

  it("returns post when entity cells are empty or N/A", () => {
    expect(
      inferBulkSitemapModeFromRows([
        { keyword: "a", title: "A", entity: "" },
        { keyword: "b", title: "B", entity: "N/A" },
      ]).mode,
    ).toBe("post");
  });

  it("returns entity when all rows have entities even if sitemap says post", () => {
    const rows = [
      { keyword: "a", title: "A", entity: "Old Naples", sitemap_type: "post" as const },
      { keyword: "b", title: "B", entity: "Park Shore", sitemap_type: "post" as const },
    ];
    expect(inferBulkSitemapModeFromRows(rows).mode).toBe("entity");
  });

  it("returns custom when mixed sitemap types and rows have entities", () => {
    const rows = [
      { keyword: "a", title: "A", entity: "Old Naples", sitemap_type: "entity" as const },
      { keyword: "b", title: "B", entity: "Park Shore", sitemap_type: "post" as const },
    ];
    expect(inferBulkSitemapModeFromRows(rows).mode).toBe("custom");
  });
});

describe("seedCustomRowSitemaps", () => {
  it("fills missing row sitemap_type", () => {
    const rows = seedCustomRowSitemaps(
      [{ keyword: "a", title: "A" }, { keyword: "b", title: "B", sitemap_type: "entity" }],
      "post",
    );
    expect(rows[0]?.sitemap_type).toBe("post");
    expect(rows[1]?.sitemap_type).toBe("entity");
  });
});

describe("filterPromptBulkSitemapBucketsByScopes", () => {
  const buckets = {
    pages: { json: "pages", rowCount: 2 },
    posts: { json: "posts", rowCount: 3 },
    sap: { json: "sap", rowCount: 4 },
  };

  it("returns all buckets when no scopes are selected", () => {
    expect(filterPromptBulkSitemapBucketsByScopes(buckets, [])).toEqual(buckets);
  });

  it("strictly filters to selected scopes only", () => {
    const filtered = filterPromptBulkSitemapBucketsByScopes(buckets, ["pages"]);
    expect(filtered.pages.rowCount).toBe(2);
    expect(filtered.posts.rowCount).toBe(0);
    expect(filtered.sap.rowCount).toBe(0);
  });
});

describe("overviewSitemapSourceToUploadConfig", () => {
  it("maps dock source to WP upload target", () => {
    expect(overviewSitemapSourceToUploadConfig("posts")).toEqual({
      sitemapType: "post",
      wordpressRestEndpoint: "posts",
    });
    expect(overviewSitemapSourceToUploadConfig("pages")).toEqual({
      sitemapType: "post",
      wordpressRestEndpoint: "pages",
    });
    expect(overviewSitemapSourceToUploadConfig("sap")).toEqual({
      sitemapType: "entity",
      wordpressRestEndpoint: "posts",
    });
  });
});

describe("resolveBulkEditorialScopeTag", () => {
  it("uses entity mode when sitemapType is entity without scopeTags", () => {
    expect(resolveBulkEditorialScopeTag({ sitemapType: "entity" })).toBe("entities");
  });

  it("prefers explicit scopeTags over sitemapType", () => {
    expect(
      resolveBulkEditorialScopeTag({ sitemapType: "entity", scopeTags: ["posts"] }),
    ).toBe("posts");
  });
});
