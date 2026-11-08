import { describe, expect, it } from "vitest";
import { buildRedirectCsvRedirectCsv } from "@/lib/pulse-redirect-redirect-csv";
import { buildContentSheetRows } from "@/lib/sitemap-optimizer/build-content-sheet-rows";
import {
  buildMergePublishContracts,
} from "@/lib/sitemap-optimizer/sitemap-merge-publish-contract";
import {
  formatRedirectCsvImportErrors,
  groupRedirectsByDestination,
  matchSourcesToInventory,
  parseRedirectCsvRedirectCsv,
} from "@/lib/sitemap-optimizer/sitemap-optimizer-redirect-csv-import";
import type {
  SitemapOptimizerClusterResult,
  SitemapOptimizerMergeRecommendation,
  SitemapOptimizerPostRow,
  SitemapOptimizerRunResult,
} from "@/lib/sitemap-optimizer/types";

const inventory: SitemapOptimizerPostRow[] = [
  {
    postId: "wp:1",
    url: "https://example.com/blog/old-a/",
    collection: "posts",
    title: "Old A",
    keyword: "old a",
    meta: "",
    contentSnippet: "",
    gscQueries: [],
    gscFetched: false,
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
    gscFetched: false,
  },
];

describe("sitemap-optimizer-redirectcsv-import", () => {
  it("parses NEO Pulse redirect redirect header and groups by destination", () => {
    const csv = buildRedirectCsvRedirectCsv([
      { source: "blog/old-a/", destination: "https://example.com/blog/merged-guide/" },
      { source: "blog/old-b/", destination: "https://example.com/blog/merged-guide/" },
    ]);
    const parsed = parseRedirectCsvRedirectCsv(csv);
    expect(parsed.error).toBeUndefined();
    expect(parsed.rows).toHaveLength(2);

    const groups = groupRedirectsByDestination(parsed.rows);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.sources).toHaveLength(2);
  });

  it("does not treat 1:1 destinations as import errors when some groups matched", () => {
    // A merge group needs >= 2 members (SITEMAP_OPTIMIZER_MIN_MERGE_GROUP_SIZE);
    // a lone 1:1 destination lands in tooFewMembers but is not fatal when a group matched.
    const extra: SitemapOptimizerPostRow = {
      postId: "wp:3",
      url: "https://example.com/blog/old-c/",
      collection: "posts",
      title: "Old C",
      keyword: "old c",
      meta: "",
      contentSnippet: "",
      gscQueries: [],
      gscFetched: false,
    };
    const csv = buildRedirectCsvRedirectCsv([
      { source: "blog/old-a/", destination: "https://example.com/blog/merged-guide/" },
      { source: "blog/old-b/", destination: "https://example.com/blog/merged-guide/" },
      { source: "blog/old-c/", destination: "https://example.com/blog/dest-c/" },
    ]);
    const { rows } = parseRedirectCsvRedirectCsv(csv);
    const groups = groupRedirectsByDestination(rows);
    const match = matchSourcesToInventory(groups, [...inventory, extra]);
    expect(match.groups.length).toBeGreaterThan(0);
    expect(match.tooFewMembers.length).toBeGreaterThan(0);
    expect(formatRedirectCsvImportErrors(match)).toBeNull();
  });

  it("matches source paths to inventory rows", () => {
    const csv = buildRedirectCsvRedirectCsv([
      { source: "blog/old-a/", destination: "https://example.com/blog/merged-guide/" },
      { source: "blog/old-b/", destination: "https://example.com/blog/merged-guide/" },
    ]);
    const { rows } = parseRedirectCsvRedirectCsv(csv);
    const groups = groupRedirectsByDestination(rows);
    const match = matchSourcesToInventory(groups, inventory);
    expect(match.groups).toHaveLength(1);
    expect(match.groups[0]!.memberRows).toHaveLength(2);
    expect(match.unmatchedSources).toHaveLength(0);
  });

  it("locked destination on merge preserves exact sheet URL in contract", () => {
    const lockedDest = "https://example.com/blog/my-custom-slug/";
    const clusters: SitemapOptimizerClusterResult = {
        clusters: [
          {
            clusterId: "redirect-csv:test",
            label: "NEO Pulse redirect merge",
            intent: "consolidation",
            memberPostIds: ["wp:1", "wp:2"],
            confidence: "high",
            rationale: "",
          },
        ],
        singletons: [],
    };
    const merges: SitemapOptimizerMergeRecommendation[] = [
        {
          clusterId: "redirect-csv:test",
          recommendedTitle: "Custom Guide",
          recommendedPrimaryKeyword: "custom guide",
          recommendedMeta: "Meta text here for the merged article page.",
          combinedOutline: ["Section A"],
          whatToKeepFromEach: [],
          redirectOrCanonicalNote: "",
          priority: "high",
          confidence: "high",
          rationale: "",
          lockedDestinationUrl: lockedDest,
        },
    ];
    const result: SitemapOptimizerRunResult = {
      rows: inventory,
      clusters,
      merges,
      contentSheet: buildContentSheetRows({ rows: inventory, clusters, merges }),
      gscMissCount: 0,
      dateRange: { startDate: "2026-04-01", endDate: "2026-05-01" },
      analyzedAt: "2026-05-01T00:00:00.000Z",
    };

    const contracts = buildMergePublishContracts(result);
    expect(contracts).toHaveLength(1);
    expect(contracts[0]!.destinationUrl).toBe(lockedDest);
    expect(contracts[0]!.slugSegment).toBe("my-custom-slug");
  });
});
