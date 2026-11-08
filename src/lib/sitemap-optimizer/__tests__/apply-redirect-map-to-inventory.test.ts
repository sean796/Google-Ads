import { describe, expect, it } from "vitest";
import {
  applyRedirectMapToInventory,
  buildRedirectMapPipelineRows,
  isPrefilledRedirectGridUpload,
  isRedirectGridUpload,
} from "@/lib/sitemap-optimizer/apply-redirect-map-to-inventory";
import type { GscParsedPageRow } from "@/lib/sitemap-optimizer/parse-gsc-pages-csv";
import type { SitemapOptimizerPostRow } from "@/lib/sitemap-optimizer/types";

describe("applyRedirectMapToInventory", () => {
  it("remaps inventory url to new_url and keeps old as gridRedirectFromUrl", () => {
    const inventory: SitemapOptimizerPostRow[] = [
      {
        postId: "wp:10773",
        url: "https://www.kwbllp.com/2026/04/02/integrated-financial-and-tax-planning-for-medical-professionals-3/",
        collection: "posts",
        title: "Old title",
        keyword: "",
        meta: "",
        contentSnippet: "",
        gscQueries: [],
        gscFetched: true,
      },
    ];
    const upload = [
      {
        page: "https://www.kwbllp.com/blog/tax-financial-planning/",
        redirectFromUrl:
          "https://www.kwbllp.com/2026/04/02/integrated-financial-and-tax-planning-for-medical-professionals-3/",
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
      },
    ];
    const { rows, matchedCount } = applyRedirectMapToInventory(inventory, upload);
    expect(matchedCount).toBe(1);
    expect(rows[0]?.url).toBe("https://www.kwbllp.com/blog/tax-financial-planning/");
    expect(rows[0]?.gridRedirectFromUrl).toContain("integrated-financial-and-tax-planning");
  });

  it("matches NEO Pulse redirect relative source paths to full WordPress inventory URLs", () => {
    const inventory: SitemapOptimizerPostRow[] = [
      {
        postId: "wp:93",
        url: "https://www.kwbllp.com/2024/04/01/canadian-interest-rates-q2-2024/",
        collection: "posts",
        title: "Canadian Interest Rates Q2 2024",
        keyword: "",
        meta: "",
        contentSnippet: "",
        gscQueries: [],
        gscFetched: true,
      },
    ];
    const upload = [
      {
        page: "https://www.kwbllp.com/blog/canadian-interest-rates-q2-2026/",
        redirectFromUrl: "2024/04/01/canadian-interest-rates-q2-2024/",
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
      },
    ];
    const { rows, matchedCount } = applyRedirectMapToInventory(inventory, upload);
    expect(matchedCount).toBe(1);
    expect(rows[0]?.url).toContain("canadian-interest-rates-q2-2026");
  });

  it("builds all CSV rows when legacy sources do not match live inventory", () => {
    const inventory: SitemapOptimizerPostRow[] = [
      {
        postId: "wp:1",
        url: "https://kwbllp.com/blog/canada-arctic-investment/",
        collection: "posts",
        title: "Already migrated",
        keyword: "",
        meta: "",
        contentSnippet: "",
        gscQueries: [],
        gscFetched: true,
      },
    ];
    const upload: GscParsedPageRow[] = [
      {
        page: "https://kwbllp.com/blog/canada-arctic-investment/",
        redirectFromUrl: "blog/canadas-35-billion-arctic-investment/",
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
      },
      {
        page: "https://kwbllp.com/blog/alberta-bill-11-impacts-your-business/",
        redirectFromUrl: "blog/albertas-bill-11/",
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
      },
    ];
    const { rows, linkedCount, uploadRowCount } = buildRedirectMapPipelineRows(inventory, upload);
    expect(uploadRowCount).toBe(2);
    expect(rows).toHaveLength(2);
    expect(linkedCount).toBe(0);
    expect(rows[0]?.gridRedirectFromUrl).toBe("blog/canadas-35-billion-arctic-investment/");
    expect(rows[0]?.url).toBe("https://kwbllp.com/blog/canada-arctic-investment/");
  });
});

describe("isPrefilledRedirectGridUpload", () => {
  const dest = "https://www.kwbllp.com/blog/auto-repair-profitability/";

  const sheet4Row = (oldUrl: string, uploadRow: number): GscParsedPageRow => ({
    page: dest,
    redirectFromUrl: oldUrl,
    clicks: 1,
    impressions: 10,
    ctr: 0.1,
    position: 5,
    gridGroup: 1,
    gridTopicTag: "auto_repair_profitability",
    gridTagLabel: "Auto Repair Profit",
    csvUploadRow: uploadRow,
  });

  it("returns true when every redirect grid row has a CSV group", () => {
    const upload = [
      sheet4Row("https://www.kwbllp.com/blog/auto-repair-profit-accelerator/", 207),
      sheet4Row("https://www.kwbllp.com/blog/auto-repair-profit-improvement/", 297),
      sheet4Row("https://www.kwbllp.com/blog/auto-repair-profit/", 353),
    ];
    expect(isRedirectGridUpload(upload)).toBe(true);
    expect(isPrefilledRedirectGridUpload(upload)).toBe(true);
  });

  it("returns false when any row lacks gridGroup", () => {
    const upload = [
      sheet4Row("https://www.kwbllp.com/blog/auto-repair-profit/", 353),
      { ...sheet4Row("https://www.kwbllp.com/blog/auto-repair-profit-improvement/", 297), gridGroup: undefined },
    ];
    expect(isRedirectGridUpload(upload)).toBe(true);
    expect(isPrefilledRedirectGridUpload(upload)).toBe(false);
  });
});
