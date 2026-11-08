import { describe, expect, it } from "vitest";
import { gscPagesToCsv } from "@/lib/gsc-reporting/gsc-reporting-fetch";
import { parseGscPagesCsv } from "@/lib/sitemap-optimizer/parse-gsc-pages-csv";

describe("parseGscPagesCsv", () => {
  it("parses Page header from gscPagesToCsv output", () => {
    const csv = gscPagesToCsv([
      {
        page: "https://example.com/a/",
        clicks: 2,
        impressions: 100,
        ctr: 0.02,
        position: 8.5,
      },
    ]);
    const parsed = parseGscPagesCsv(csv);
    expect(parsed.error).toBeUndefined();
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.page).toBe("https://example.com/a/");
    expect(parsed.rows[0]?.clicks).toBe(2);
    expect(parsed.rows[0]?.impressions).toBe(100);
    expect(parsed.rows[0]?.ctr).toBeCloseTo(0.02, 4);
    expect(parsed.rows[0]?.position).toBeCloseTo(8.5, 2);
  });

  it("parses URL header and CTR percent strings", () => {
    const csv = [
      "URL,Clicks,Impressions,CTR,Position",
      "https://www.example.com/post/,0,37,0%,28.73",
    ].join("\n");
    const parsed = parseGscPagesCsv(csv);
    expect(parsed.error).toBeUndefined();
    expect(parsed.rows[0]?.impressions).toBe(37);
    expect(parsed.rows[0]?.ctr).toBe(0);
    expect(parsed.rows[0]?.position).toBeCloseTo(28.73, 2);
  });

  it("dedupes duplicate page URLs keeping last row", () => {
    const csv = [
      "Page,Clicks,Impressions,CTR,Position",
      "https://example.com/x/,1,10,10%,5",
      "https://example.com/x,2,20,20%,6",
    ].join("\n");
    const parsed = parseGscPagesCsv(csv);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.clicks).toBe(2);
  });

  it("returns error when Page column missing", () => {
    const parsed = parseGscPagesCsv("Clicks,Impressions\n1,2");
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.error).toMatch(/Page or URL/i);
  });

  it("parses redirect grid CSV using new_url as canonical page", () => {
    const csv = [
      "group,upload_row,topic_tag,geo_tag,tag_label,old_url,new_url,id,source,matching,destination,type,category,status,ignore",
      '1,8,cloud_accounting,,Cloud Accounting,https://www.kwbllp.com/2023/08/10/old-slug/,https://www.kwbllp.com/2023/08/10/cloud-accounting-migration/,1,old-slug,exact,cloud-accounting-migration/,301,,active,',
    ].join("\n");
    const parsed = parseGscPagesCsv(csv);
    expect(parsed.error).toBeUndefined();
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.page).toBe(
      "https://www.kwbllp.com/blog/cloud-accounting-migration/",
    );
    expect(parsed.blogDestinationsNormalized).toBe(1);
    expect(parsed.rows[0]?.redirectFromUrl).toBe("2023/08/10/old-slug/");
    expect(parsed.rows[0]?.gridTopicTag).toBe("cloud_accounting");
    expect(parsed.rows[0]?.gridTagLabel).toBe("Cloud Accounting");
    expect(parsed.rows[0]?.gridGroup).toBe(1);
    expect(parsed.rows[0]?.csvUploadRow).toBe(8);
  });

  it("parses Sheet4 old_url_optimized column and keeps rows sharing new_url", () => {
    const dest = "https://www.kwbllp.com/blog/auto-repair-profitability/";
    const csv = [
      "group,upload_row,topic_tag,geo_tag,tag_label,old_url_optimized_0 Clicks,new_url,id,source,matching,destination,type,category,status,ignore",
      `1,207,auto_repair_profitability,,Auto Repair Profit Accelerator,https://www.kwbllp.com/blog/auto-repair-profit-accelerator/,${dest},1,blog/auto-repair-profit-accelerator/,exact,blog/auto-repair-profitability/,301,,active,`,
      `1,297,auto_repair_profitability,,Auto Repair Profit Improvement,https://www.kwbllp.com/blog/auto-repair-profit-improvement/,${dest},2,blog/auto-repair-profit-improvement/,exact,blog/auto-repair-profitability/,301,,active,`,
      `1,353,auto_repair_profitability,,Auto Repair Profit,https://www.kwbllp.com/blog/auto-repair-profit/,${dest},3,blog/auto-repair-profit/,exact,blog/auto-repair-profitability/,301,,active,`,
    ].join("\n");
    const parsed = parseGscPagesCsv(csv);
    expect(parsed.error).toBeUndefined();
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows.every((r) => r.page === dest)).toBe(true);
    expect(parsed.rows[0]?.redirectFromUrl).toContain("auto-repair-profit-accelerator");
    expect(parsed.rows.every((r) => r.gridGroup === 1)).toBe(true);
  });

  it("parses Sheet2 Top pages + new_url redirect map with GSC metrics", () => {
    const csv = [
      "Top pages,new_url,Clicks,Impressions,CTR,Position",
      "https://www.kwbllp.com/2022/10/12/canadian-digital-adoption-program-advisor/,https://www.kwbllp.com/blog/canadian-digital-adoption-program/,0,7525,0%,44.12",
      "https://www.kwbllp.com/blog/auto-repair-profit/,https://www.kwbllp.com/blog/auto-repair-profitability/,0,500,0%,35",
      "https://www.kwbllp.com/blog/auto-repair-profit-improvement/,https://www.kwbllp.com/blog/auto-repair-profitability/,0,400,0%,40",
    ].join("\n");
    const parsed = parseGscPagesCsv(csv);
    expect(parsed.error).toBeUndefined();
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]?.redirectFromUrl).toContain("canadian-digital-adoption-program-advisor");
    expect(parsed.rows[0]?.page).toBe("https://www.kwbllp.com/blog/canadian-digital-adoption-program/");
    expect(parsed.rows[0]?.impressions).toBe(7525);
    expect(parsed.rows.every((r) => r.redirectFromUrl?.trim())).toBe(true);
  });

  it("normalizes root-level new_url to /blog/{slug}/", () => {
    const csv = [
      "Top pages,new_url,Clicks,Impressions,CTR,Position",
      "https://www.kwbllp.com/old-post/,https://www.kwbllp.com/quickbooks-optimization/,0,100,0%,10",
    ].join("\n");
    const parsed = parseGscPagesCsv(csv);
    expect(parsed.error).toBeUndefined();
    expect(parsed.rows[0]?.page).toBe("https://www.kwbllp.com/blog/quickbooks-optimization/");
    expect(parsed.blogDestinationsNormalized).toBe(1);
  });

  it("parses NEO Pulse redirect native source,destination redirect CSV", () => {
    const csv = [
      "id,source,matching,destination,type,category,status,ignore",
      "93,2024/04/01/canadian-interest-rates-q2-2024/,exact,blog/canadian-interest-rates-q2-2026/,301,,active,",
      "91,2024/05/27/canadian-interest-rates-q3-2024/,exact,blog/canadian-interest-rates-q3-2026/,301,,active,",
      "81,2024/09/03/canadian-interest-rates-q4-2024/,exact,blog/canadian-interest-rates-q4-2026/,301,,active,",
    ].join("\n");
    const parsed = parseGscPagesCsv(csv);
    expect(parsed.error).toBeUndefined();
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows.every((r) => r.redirectFromUrl?.includes("canadian-interest-rates"))).toBe(true);
    expect(parsed.rows[0]?.page).toContain("canadian-interest-rates-q2-2026");
  });

  it("parses traffic optimized old_url,new_url and keeps shortened new_url", () => {
    const csv = [
      "old_url,new_url,Clicks,Impressions,CTR,Position",
      "https://www.kwbllp.com/2025/01/27/canada-revenue-agency-new-reporting-rules-for-gig-workers/,https://www.kwbllp.com/blog/cra-gig-worker-reporting/,2694,107022,2.52%,6.29",
    ].join("\n");
    const parsed = parseGscPagesCsv(csv);
    expect(parsed.error).toBeUndefined();
    expect(parsed.rows[0]?.page).toBe("https://www.kwbllp.com/blog/cra-gig-worker-reporting/");
    expect(parsed.rows[0]?.redirectFromUrl).toContain("canada-revenue-agency");
  });
});
