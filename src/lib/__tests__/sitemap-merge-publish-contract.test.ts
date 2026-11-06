import { describe, expect, it } from "vitest";
import {
  buildMergePublishContracts,
  redirectRowsFromContracts,
} from "@/lib/sitemap-optimizer/sitemap-merge-publish-contract";
import { resolveMergeDestinationUrl } from "@/lib/sitemap-optimizer/sitemap-optimizer-download-csv";
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
      combinedOutline: ["Topic One"],
      whatToKeepFromEach: [],
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

describe("sitemap-merge-publish-contract", () => {
  const publishAt = "2026-05-20T12:00:00.000Z";

  it("uses lockedDestinationUrl from Rank Math import when set on the content sheet", () => {
    const locked = "https://example.com/blog/sheet-destination/";
    const result: SitemapOptimizerRunResult = {
      ...sampleResult,
      merges: [{ ...sampleResult.merges[0]!, lockedDestinationUrl: locked }],
      contentSheet: [
        {
          ...sampleResult.contentSheet[0]!,
          sourceUrl: locked,
          proposedDestinationUrl: locked,
        },
      ],
    };
    const contracts = buildMergePublishContracts(result, publishAt);
    expect(contracts[0]!.destinationUrl).toBe(locked);
    expect(contracts[0]!.slugSegment).toBe("sheet-destination");
  });

  it("blog slug and destination match redirect builder", () => {
    const contracts = buildMergePublishContracts(sampleResult, publishAt);
    expect(contracts).toHaveLength(1);
    const c = contracts[0]!;
    expect(c.slugSegment).toBe("merged-guide");
    expect(c.destinationUrl).toBe("https://example.com/blog/merged-guide/");
    expect(c.publishDateGmt).toBe(publishAt);

    const members = sampleResult.rows;
    expect(resolveMergeDestinationUrl(sampleResult.merges[0]!, members)).toBe(c.destinationUrl);

    const redirects = redirectRowsFromContracts(contracts, sampleResult);
    expect(redirects).toHaveLength(2);
    expect(redirects.every((r) => r.destination === c.destinationUrl)).toBe(true);
  });

  it("entity service-area runs publish single-member merge groups", () => {
    const url = "https://example.com/service-area/charleswood-blinds/";
    const row = {
      postId: "wp:charleswood",
      url,
      collection: "service-area",
      title: "Charleswood Blinds",
      keyword: "",
      meta: "",
      contentSnippet: "",
      gscQueries: [],
      gscFetched: true,
    };
    const merge = {
      clusterId: "entity-compress-0-1",
      recommendedTitle: "Charleswood window treatments",
      recommendedPrimaryKeyword: "blinds charleswood",
      recommendedMeta: "Local blinds in Charleswood.",
      lockedDestinationUrl: "https://example.com/service-area/charleswood-window-treatments/",
      combinedOutline: ["Overview"],
      whatToKeepFromEach: [],
      redirectOrCanonicalNote: "",
      priority: "medium" as const,
      confidence: "high" as const,
      rationale: "Entity brief",
    };
    const result: SitemapOptimizerRunResult = {
      entityPrimary: true,
      rows: [row],
      clusters: {
        clusters: [
          {
            clusterId: merge.clusterId,
            label: "Charleswood blinds",
            intent: "local",
            memberPostIds: [row.postId],
            confidence: "high" as const,
            rationale: "",
          },
        ],
        singletons: [],
      },
      merges: [merge],
      contentSheet: [],
      gscMissCount: 0,
      dateRange: { startDate: "2026-04-01", endDate: "2026-05-01" },
      analyzedAt: "2026-05-01T00:00:00.000Z",
    };

    const contracts = buildMergePublishContracts(result, publishAt);
    expect(contracts).toHaveLength(1);
    expect(contracts[0]!.destinationUrl).toContain("charleswood-window-treatments");
  });

  it("uses the analyzed content sheet for entity service-area publish", () => {
    const url = "https://intheshadeflorida.com/service-area/boynton-beach-blinds/";
    const row = {
      postId: "wp:boynton",
      url,
      collection: "service-area",
      title: "Boynton Beach Blinds",
      keyword: "",
      meta: "",
      contentSnippet: "",
      gscQueries: [],
      gscFetched: true,
    };
    const clusterId = "entity-singleton-wp:boynton";
    const destinationUrl = "https://intheshadeflorida.com/service-area/boynton-beach-window-coverings/";
    const result: SitemapOptimizerRunResult = {
      rows: [row],
      clusters: {
        clusters: [
          {
            clusterId,
            label: "Boynton Beach blinds",
            intent: "local",
            memberPostIds: [row.postId],
            confidence: "high" as const,
            rationale: "",
          },
        ],
        singletons: [],
      },
      merges: [],
      contentSheet: [
        {
          postId: row.postId,
          sourceUrl: destinationUrl,
          sourceTitle: "",
          action: "merge" as const,
          priority: "medium" as const,
          proposedTitle: "Boynton Beach Window Coverings",
          proposedPrimaryKeyword: "blinds boynton beach",
          proposedMeta: "Local blinds in Boynton Beach.",
          mergeClusterId: clusterId,
          mergeGroupLabel: "Boynton Beach blinds",
          mergeSourceCount: 1,
          proposedDestinationUrl: destinationUrl,
          modifier: "Consolidate local service-area page.",
        },
      ],
      gscMissCount: 0,
      dateRange: { startDate: "2026-04-01", endDate: "2026-05-01" },
      analyzedAt: "2026-05-01T00:00:00.000Z",
    };

    const contracts = buildMergePublishContracts(result, publishAt);
    expect(contracts).toHaveLength(1);
    expect(contracts[0]!.destinationUrl).toBe(destinationUrl);
  });
});
