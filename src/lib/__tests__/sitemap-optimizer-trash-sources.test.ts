import { describe, expect, it } from "vitest";
import {
  collectMergeSourcePosts,
  numericIdFromPostRow,
  postTypeFromCollection,
} from "@/lib/sitemap-optimizer/trash-merge-source-posts";
import { buildContentSheetRows } from "@/lib/sitemap-optimizer/build-content-sheet-rows";
import type { SitemapOptimizerRunResult } from "@/lib/sitemap-optimizer/types";

const sampleResultBase: Omit<SitemapOptimizerRunResult, "contentSheet"> = {
  rows: [
    {
      postId: "wp:10",
      id: 10,
      url: "https://example.com/a/",
      collection: "posts",
      title: "A",
      keyword: "",
      meta: "",
      contentSnippet: "",
      gscQueries: [],
      gscFetched: false,
    },
    {
      postId: "wp:11",
      id: 11,
      url: "https://example.com/b/",
      collection: "posts",
      title: "B",
      keyword: "",
      meta: "",
      contentSnippet: "",
      gscQueries: [],
      gscFetched: false,
    },
  ],
  clusters: {
    clusters: [
      {
        clusterId: "c1",
        label: "g",
        intent: "mixed",
        memberPostIds: ["wp:10", "wp:11"],
        confidence: "high",
        rationale: "",
      },
    ],
    singletons: [],
  },
  merges: [
    {
      clusterId: "c1",
      recommendedTitle: "Merged",
      recommendedPrimaryKeyword: "kw",
      recommendedMeta: "",
      combinedOutline: [],
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

describe("numericIdFromPostRow", () => {
  it("uses row.id when present", () => {
    expect(numericIdFromPostRow(sampleResult.rows[0]!)).toBe(10);
  });

  it("parses wp:n postId when id missing", () => {
    expect(
      numericIdFromPostRow({
        ...sampleResult.rows[0]!,
        id: undefined,
        postId: "wp:42",
      }),
    ).toBe(42);
  });

  it("returns null for slug ids", () => {
    expect(
      numericIdFromPostRow({
        ...sampleResult.rows[0]!,
        postId: "slug:hello",
        id: undefined,
      }),
    ).toBeNull();
  });
});

describe("postTypeFromCollection", () => {
  it("maps posts and pages", () => {
    expect(postTypeFromCollection("posts")).toEqual({
      postType: "post",
      postTypeEndpoint: "posts",
    });
    expect(postTypeFromCollection("pages")).toEqual({
      postType: "page",
      postTypeEndpoint: "pages",
    });
    expect(postTypeFromCollection("service-area")).toEqual({
      postType: "service-area",
      postTypeEndpoint: "service-area",
    });
  });
});

describe("collectMergeSourcePosts", () => {
  it("returns unique source rows for merge groups", () => {
    const sources = collectMergeSourcePosts(sampleResult);
    expect(sources).toHaveLength(2);
    expect(sources.map((r) => r.postId).sort()).toEqual(["wp:10", "wp:11"]);
  });
});
