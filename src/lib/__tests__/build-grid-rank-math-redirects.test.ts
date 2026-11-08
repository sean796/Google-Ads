import { describe, expect, it } from "vitest";
import {
  buildGridPublishContracts,
  buildGridRedirectCsvExportCsv,
  buildGridRedirectCsvRedirectRows,
} from "@/lib/sitemap-optimizer/build-grid-pulse-redirect-redirects";
import type {
  SitemapOptimizerClusterResult,
  SitemapOptimizerMergeRecommendation,
  SitemapOptimizerPostRow,
  SitemapOptimizerRunResult,
} from "@/lib/sitemap-optimizer/types";

const gridRow = (index: number, url: string): SitemapOptimizerPostRow => ({
  postId: `csv:${index}`,
  url,
  collection: "grid_csv",
  title: "topic page",
  keyword: "",
  meta: "",
  contentSnippet: "",
  gscQueries: [],
  gscFetched: true,
});

function makeGridResult(
  rows: SitemapOptimizerPostRow[],
  clusters: SitemapOptimizerClusterResult,
  merges: SitemapOptimizerMergeRecommendation[],
): SitemapOptimizerRunResult {
  return {
    rows,
    clusters,
    merges,
    contentSheet: [],
    gscMissCount: 0,
    dateRange: { startDate: "2025-01-01", endDate: "2025-01-31" },
    analyzedAt: "2025-01-01T00:00:00.000Z",
    runMode: "grid_csv",
    gridMaxUrlsPerPost: 5,
  };
}

describe("build-grid-pulse-redirect-redirects", () => {
  it("emits one redirect per row and at most K unique destinations", () => {
    const rows = [
      gridRow(0, "https://example.com/old-a/"),
      gridRow(1, "https://example.com/old-b/"),
      gridRow(2, "https://example.com/old-c/"),
    ];
    const clusters: SitemapOptimizerClusterResult = {
      clusters: [
        {
          clusterId: "grid-macro-1",
          label: "A",
          intent: "mixed",
          memberPostIds: ["csv:0", "csv:1"],
          confidence: "high",
          rationale: "",
        },
        {
          clusterId: "grid-macro-2",
          label: "B",
          intent: "mixed",
          memberPostIds: ["csv:2"],
          confidence: "high",
          rationale: "",
        },
      ],
      singletons: [],
    };
    const merges: SitemapOptimizerMergeRecommendation[] = [
      {
        clusterId: "grid-macro-1",
        recommendedTitle: "Combined A",
        recommendedPrimaryKeyword: "combined a",
        recommendedMeta: "Meta for combined a post here with enough length.",
        combinedOutline: [],
        whatToKeepFromEach: [],
        redirectOrCanonicalNote: "",
        priority: "high",
        confidence: "high",
        rationale: "",
      },
      {
        clusterId: "grid-macro-2",
        recommendedTitle: "Solo C",
        recommendedPrimaryKeyword: "solo c",
        recommendedMeta: "Meta for solo c post here with enough length.",
        combinedOutline: [],
        whatToKeepFromEach: [],
        redirectOrCanonicalNote: "",
        priority: "medium",
        confidence: "medium",
        rationale: "",
      },
    ];
    const result = makeGridResult(rows, clusters, merges);
    const contracts = buildGridPublishContracts(result);
    expect(contracts).toHaveLength(2);

    const redirects = buildGridRedirectCsvRedirectRows(result);
    expect(redirects).toHaveLength(3);
    const uniqueDest = new Set(redirects.map((r) => r.destinationUrl));
    expect(uniqueDest.size).toBeLessThanOrEqual(3);
    const macro1Redirects = redirects.filter((r) =>
      r.destinationUrl.includes("combined-a") || r.destinationUrl.includes("combined"),
    );
    expect(macro1Redirects.length).toBeGreaterThanOrEqual(1);
  });

  it("uses the same mergeGroupId for every row with the same new_url", () => {
    const sharedKeyword = "optimizing quickbooks online";
    const rows = [
      gridRow(0, "https://example.com/old-a/"),
      gridRow(1, "https://example.com/old-b/"),
    ];
    const clusters: SitemapOptimizerClusterResult = {
      clusters: [
        {
          clusterId: "grid-a",
          label: "A",
          intent: "mixed",
          memberPostIds: ["csv:0"],
          confidence: "high",
          rationale: "",
        },
        {
          clusterId: "grid-b",
          label: "B",
          intent: "mixed",
          memberPostIds: ["csv:1"],
          confidence: "high",
          rationale: "",
        },
      ],
      singletons: [],
    };
    const sharedDest = "https://example.com/optimizing-quickbooks-online/";
    const merges: SitemapOptimizerMergeRecommendation[] = [
      {
        clusterId: "grid-a",
        recommendedTitle: "Title A",
        recommendedPrimaryKeyword: sharedKeyword,
        recommendedMeta: "Meta for title a post here with enough length.",
        lockedDestinationUrl: sharedDest,
        combinedOutline: [],
        whatToKeepFromEach: [],
        redirectOrCanonicalNote: "",
        priority: "high",
        confidence: "high",
        rationale: "",
      },
      {
        clusterId: "grid-b",
        recommendedTitle: "Title B",
        recommendedPrimaryKeyword: sharedKeyword,
        recommendedMeta: "Meta for title b post here with enough length.",
        lockedDestinationUrl: sharedDest,
        combinedOutline: [],
        whatToKeepFromEach: [],
        redirectOrCanonicalNote: "",
        priority: "high",
        confidence: "high",
        rationale: "",
      },
    ];
    const redirects = buildGridRedirectCsvRedirectRows(makeGridResult(rows, clusters, merges));
    expect(redirects).toHaveLength(2);
    expect(redirects[0]!.destinationUrl).toBe(redirects[1]!.destinationUrl);
    expect(redirects[0]!.mergeGroupId).toBe(redirects[1]!.mergeGroupId);
  });

  it("assigns unique mergeGroupId per row when gridMaxUrlsPerPost is 1", () => {
    const rows = [
      gridRow(0, "https://example.com/blog/shared-dest/"),
      gridRow(1, "https://example.com/blog/shared-dest/"),
    ];
    rows[0].gridRedirectFromUrl = "https://example.com/old-a/";
    rows[1].gridRedirectFromUrl = "https://example.com/old-b/";
    rows[0].uploadRowIndex = 1;
    rows[1].uploadRowIndex = 2;
    const sharedDest = "https://example.com/blog/shared-dest/";
    const clusters: SitemapOptimizerClusterResult = {
      clusters: [
        {
          clusterId: "grid-row-csv:0",
          label: "A",
          intent: "mixed",
          memberPostIds: ["csv:0"],
          confidence: "high",
          rationale: "",
        },
        {
          clusterId: "grid-row-csv:1",
          label: "B",
          intent: "mixed",
          memberPostIds: ["csv:1"],
          confidence: "high",
          rationale: "",
        },
      ],
      singletons: [],
    };
    const merges: SitemapOptimizerMergeRecommendation[] = [
      {
        clusterId: "grid-row-csv:0",
        recommendedTitle: "Title A",
        recommendedPrimaryKeyword: "a",
        recommendedMeta: "Meta for title a post here with enough length.",
        lockedDestinationUrl: sharedDest,
        combinedOutline: [],
        whatToKeepFromEach: [],
        redirectOrCanonicalNote: "",
        priority: "medium",
        confidence: "medium",
        rationale: "",
      },
      {
        clusterId: "grid-row-csv:1",
        recommendedTitle: "Title B",
        recommendedPrimaryKeyword: "b",
        recommendedMeta: "Meta for title b post here with enough length.",
        lockedDestinationUrl: sharedDest,
        combinedOutline: [],
        whatToKeepFromEach: [],
        redirectOrCanonicalNote: "",
        priority: "medium",
        confidence: "medium",
        rationale: "",
      },
    ];
    const result = makeGridResult(rows, clusters, merges);
    result.gridMaxUrlsPerPost = 1;
    const redirects = buildGridRedirectCsvRedirectRows(result);
    expect(redirects).toHaveLength(2);
    expect(redirects[0]!.mergeGroupId).toBe(1);
    expect(redirects[1]!.mergeGroupId).toBe(2);
  });

  it("export CSV includes group and upload_row before NEO Pulse redirect columns", () => {
    const rows = [gridRow(0, "https://example.com/old-a/"), gridRow(1, "https://example.com/old-b/")];
    rows[0].uploadRowIndex = 10;
    rows[1].uploadRowIndex = 11;
    const clusters: SitemapOptimizerClusterResult = {
      clusters: [
        {
          clusterId: "grid-macro-1",
          label: "A",
          intent: "mixed",
          memberPostIds: ["csv:0", "csv:1"],
          confidence: "high",
          rationale: "",
        },
      ],
      singletons: [],
    };
    const merges: SitemapOptimizerMergeRecommendation[] = [
      {
        clusterId: "grid-macro-1",
        recommendedTitle: "Combined A",
        recommendedPrimaryKeyword: "combined a",
        recommendedMeta: "Meta for combined a post here with enough length.",
        combinedOutline: [],
        whatToKeepFromEach: [],
        redirectOrCanonicalNote: "",
        priority: "high",
        confidence: "high",
        rationale: "",
      },
    ];
    const csv = buildGridRedirectCsvExportCsv(makeGridResult(rows, clusters, merges));
    const [header, line1] = csv.split("\n");
    expect(header.startsWith("group,upload_row,topic_tag,geo_tag,tag_label,old_url,new_url,")).toBe(
      true,
    );
    expect(line1?.startsWith("1,10,")).toBe(true);
  });
});
