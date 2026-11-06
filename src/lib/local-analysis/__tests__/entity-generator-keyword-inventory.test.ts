import { describe, expect, it } from "vitest";
import type { SiteInventoryBulkRow } from "@/lib/wordpress-api/types";
import {
  entityGeneratorKeywordInventoryCount,
  pickEntityGeneratorKeywordInventoryRows,
} from "@/lib/local-analysis/entity-generator-keyword-inventory";

const site = {
  id: "s1",
  siteUrl: "https://example.com",
  name: "Test",
  username: "user",
  appPassword: "pass",
  connectedAt: 0,
} as const;

function row(collection: string, title: string): SiteInventoryBulkRow {
  return {
    collection,
    url: `https://example.com/${collection}/${title}`,
    fields: { title, keyword: title.toLowerCase() },
  } as SiteInventoryBulkRow;
}

describe("pickEntityGeneratorKeywordInventoryRows", () => {
  it("prefers entity sitemap rows over posts", () => {
    const rows = [row("posts", "Blog A"), row("service-area", "SAP A"), row("posts", "Blog B")];
    const picked = pickEntityGeneratorKeywordInventoryRows(site, rows);
    expect(picked.map((r) => r.collection)).toEqual(["service-area"]);
  });

  it("falls back to posts when entity sitemap is empty", () => {
    const rows = [row("posts", "Blog A"), row("pages", "About")];
    const picked = pickEntityGeneratorKeywordInventoryRows(site, rows);
    expect(picked.map((r) => r.fields?.title)).toEqual(["Blog A"]);
  });
});

describe("entityGeneratorKeywordInventoryCount", () => {
  it("reports sap source when sap rows exist", () => {
    expect(
      entityGeneratorKeywordInventoryCount([row("service-area", "SAP A")], undefined),
    ).toEqual({ source: "sap", count: 1 });
  });

  it("uses posts bucket count when merged rows are empty", () => {
    expect(
      entityGeneratorKeywordInventoryCount([], {
        pages: { json: "", rowCount: 0 },
        posts: { json: "", rowCount: 5 },
        sap: { json: "", rowCount: 0 },
      }),
    ).toEqual({ source: "posts", count: 5 });
  });
});
