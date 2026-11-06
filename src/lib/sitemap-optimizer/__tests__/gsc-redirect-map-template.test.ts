import { describe, expect, it } from "vitest";
import {
  buildGscRedirectMapTemplateCsv,
  isRedirectMapUpload,
} from "@/lib/sitemap-optimizer/gsc-redirect-map-template";
import type { GscParsedPageRow } from "@/lib/sitemap-optimizer/parse-gsc-pages-csv";

describe("gsc-redirect-map-template", () => {
  it("builds Sheet2-style template headers", () => {
    const csv = buildGscRedirectMapTemplateCsv();
    expect(csv).toContain("Top pages,new_url,Clicks,Impressions,CTR,Position");
    expect(csv).toContain("auto-repair-profitability");
  });

  it("detects redirect map uploads", () => {
    const withRedirect: GscParsedPageRow[] = [
      {
        page: "https://example.com/new/",
        redirectFromUrl: "https://example.com/old/",
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
      },
    ];
    const withoutRedirect: GscParsedPageRow[] = [
      {
        page: "https://example.com/a/",
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
      },
    ];
    expect(isRedirectMapUpload(withRedirect)).toBe(true);
    expect(isRedirectMapUpload(withoutRedirect)).toBe(false);
  });
});
