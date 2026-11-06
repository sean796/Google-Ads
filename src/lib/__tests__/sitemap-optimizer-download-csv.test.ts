import { describe, expect, it } from "vitest";
import {
  buildMergeContentModifier,
  buildSitemapOptimizerContentUploadCsv,
  buildSitemapOptimizerRankMathRedirectCsv,
  resolveMergeDestinationUrl,
} from "@/lib/sitemap-optimizer/sitemap-optimizer-download-csv";
import { buildSitemapOptimizerContentSheetCsv } from "@/lib/sitemap-optimizer/sitemap-optimizer-export";
import { buildContentSheetRows } from "@/lib/sitemap-optimizer/build-content-sheet-rows";
import type { SitemapOptimizerRunResult } from "@/lib/sitemap-optimizer/types";

const sampleResultBase: Omit<SitemapOptimizerRunResult, "contentSheet"> = {
  rows: [
    {
      postId: "wp:1",
      url: "https://example.com/blog/old-a/",
      collection: "posts",
      title: "Old A",
      keyword: "old a",
      meta: "",
      contentSnippet: "",
      gscQueries: [],
      gscFetched: true,
    },
    {
      postId: "wp:2",
      url: "https://example.com/blog/old-b/",
      collection: "posts",
      title: "Old B",
      keyword: "old b",
      meta: "",
      contentSnippet: "",
      gscQueries: [],
      gscFetched: true,
    },
  ],
  clusters: {
    clusters: [
      {
        clusterId: "c1",
        label: "Group",
        intent: "informational",
        memberPostIds: ["wp:1", "wp:2"],
        confidence: "high",
        rationale: "",
      },
    ],
    singletons: ["wp:99"],
  },
  merges: [
    {
      clusterId: "c1",
      recommendedTitle: "New Merged Guide",
      recommendedPrimaryKeyword: "merged guide",
      recommendedMeta: "Meta for merged page.",
      combinedOutline: ["Topic One", "Topic Two"],
      whatToKeepFromEach: [
        { url: "https://example.com/blog/old-a/", title: "Old A", bullets: ["Keep stat A"] },
        { url: "https://example.com/blog/old-b/", title: "Old B", bullets: ["Keep stat B"] },
      ],
      redirectOrCanonicalNote: "",
      priority: "high",
      confidence: "high",
      rationale: "",
    },
  ],
  gscMissCount: 0,
  dateRange: { startDate: "2026-04-01", endDate: "2026-05-01" },
  analyzedAt: "2026-05-01T00:00:00.000Z",
};

const sampleResult: SitemapOptimizerRunResult = {
  ...sampleResultBase,
  contentSheet: buildContentSheetRows({
    rows: sampleResultBase.rows,
    clusters: sampleResultBase.clusters,
    merges: sampleResultBase.merges,
  }),
};

describe("sitemap-optimizer-download-csv", () => {
  it("content upload csv matches bulk-auto-generate template plus destination_url", () => {
    const publishAt = "2026-05-20T12:00:00.000Z";
    const csv = buildSitemapOptimizerContentUploadCsv(sampleResult, publishAt);
    const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
    // Production: SITEMAP_CONTENT_SHEET_EXPORT_COLUMNS = bulk template + destination_url.
    expect(lines[0]).toBe(
      "keyword,entity,title,modifier,featuredImage,publish_date_gmt,sitemap_type,meta_description,target_slug,wikipedia_url,wikipedia_title,destination_url",
    );
    expect(lines[0]).not.toContain("prompt_modifier");
    expect(lines).toHaveLength(2);
    expect(csv).toContain(publishAt);
    expect(csv).toContain("Topic One");
    expect(csv).toContain("Search intent:");
    expect(csv).not.toContain("wp:99");
    const dataLine = lines[1] ?? "";
    expect(dataLine).toMatch(/^"?merged guide"?,,?"?New Merged Guide"?,/);
    expect(dataLine).toContain(",y,");
    expect(dataLine).toMatch(/https:\/\/example\.com\/blog\/merged-guide\/$/);
  });

  it("rank math csv redirects old urls to new slug under same parent path", () => {
    const { csv, rowCount } = buildSitemapOptimizerRankMathRedirectCsv(sampleResult);
    expect(rowCount).toBe(2);
    expect(csv).toContain("blog/old-a/");
    expect(csv).toContain("https://example.com/blog/merged-guide/");
    expect(csv).not.toContain("wp:99");
  });

  it("resolveMergeDestinationUrl keeps blog permalink prefix", () => {
    const merge = sampleResult.merges[0]!;
    const members = sampleResult.rows;
    expect(resolveMergeDestinationUrl(merge, members)).toBe(
      "https://example.com/blog/merged-guide/",
    );
  });

  it("buildMergeContentModifier lists intent, H2 sections, and topics without merge copy", () => {
    const mod = buildMergeContentModifier(sampleResult.merges[0]!);
    expect(mod).toContain("Search intent:");
    expect(mod).toContain("merged guide");
    expect(mod).toContain("Required H2 sections:");
    expect(mod).toContain("Topic One");
    expect(mod).toContain("Topics to address:");
    expect(mod).toContain("Keep stat A");
    expect(mod).not.toContain("Consolidated");
    expect(mod).not.toContain("replacing");
    expect(mod).not.toContain("Old A");
  });

  it("buildSitemapOptimizerContentSheetCsv matches bulk template with modifier content", () => {
    const csv = buildSitemapOptimizerContentSheetCsv(sampleResult);
    const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
    expect(lines[0]).toBe(
      "keyword,entity,title,modifier,featuredImage,publish_date_gmt,sitemap_type,meta_description,target_slug,wikipedia_url,wikipedia_title,destination_url",
    );
    expect(lines.length).toBe(1 + sampleResult.contentSheet.length);
    expect(csv).toContain("Search intent:");
    expect(csv).toContain("Required H2 sections:");
    expect(csv).toContain("merged guide");
    expect(csv).toContain("New Merged Guide");
    const mergeRow = sampleResult.contentSheet.find((r) => r.action === "merge");
    expect(mergeRow?.modifier).toBe(buildMergeContentModifier(sampleResult.merges[0]!));
  });
});
