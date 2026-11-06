import { describe, expect, it } from "vitest";
import {
  areNearDuplicateTopics,
  computeTopicGroupKeysForRedirectMap,
  pickCanonicalDestinationUrl,
  topicTokenSetForRow,
} from "@/lib/sitemap-optimizer/grid-cannibalization-family";
import {
  clusterRedirectMapForOneToOne,
  clusterOneRowPerUpload,
} from "@/lib/sitemap-optimizer/grid-prefilled-group-cluster";
import { applyGridOutputPolicies } from "@/lib/sitemap-optimizer/grid-output-policies";
import { buildDeterministicGridBrief } from "@/lib/sitemap-optimizer/grid-deterministic-brief";
import type { SitemapOptimizerPostRow } from "@/lib/sitemap-optimizer/types";

function redirectRow(args: {
  id: string;
  oldUrl: string;
  newUrl: string;
  title?: string;
  uploadRow: number;
}): SitemapOptimizerPostRow {
  const slugTitle =
    args.title ??
    args.newUrl.split("/").filter(Boolean).pop()?.replace(/-/g, " ") ??
    "";
  return {
    postId: args.id,
    url: args.newUrl,
    gridRedirectFromUrl: args.oldUrl,
    uploadRowIndex: args.uploadRow,
    collection: "grid_csv",
    title: slugTitle,
    keyword: "",
    meta: "",
    contentSnippet: "",
    gscQueries: [],
    gscFetched: true,
  };
}

describe("areNearDuplicateTopics", () => {
  it("merges alberta tax bracket keyword variants", () => {
    const a = redirectRow({
      id: "csv:1",
      oldUrl: "https://www.kwbllp.com/old/a/",
      newUrl: "https://www.kwbllp.com/blog/2026-alberta-tax-brackets/",
      title: "2026 alberta tax brackets",
      uploadRow: 1,
    });
    const b = redirectRow({
      id: "csv:2",
      oldUrl: "https://www.kwbllp.com/old/b/",
      newUrl: "https://www.kwbllp.com/blog/2026-canadian-alberta-tax-brackets/",
      title: "2026 canadian alberta tax brackets",
      uploadRow: 2,
    });
    const c = redirectRow({
      id: "csv:3",
      oldUrl: "https://www.kwbllp.com/old/c/",
      newUrl: "https://www.kwbllp.com/blog/alberta-tax-brackets-2026/",
      title: "alberta tax brackets 2026",
      uploadRow: 3,
    });
    expect(areNearDuplicateTopics(a, b)).toBe(true);
    expect(areNearDuplicateTopics(a, c)).toBe(true);
    expect(areNearDuplicateTopics(b, c)).toBe(true);
  });

  it("merges quarterly slug variants via shared slug prefix", () => {
    const q1 = redirectRow({
      id: "csv:1",
      oldUrl: "https://www.kwbllp.com/old/q1/",
      newUrl: "https://www.kwbllp.com/blog/canadian-interest-rates-q1-2026/",
      uploadRow: 1,
    });
    const q3 = redirectRow({
      id: "csv:3",
      oldUrl: "https://www.kwbllp.com/old/q3/",
      newUrl: "https://www.kwbllp.com/blog/canadian-interest-rates-q3-2026/",
      uploadRow: 3,
    });
    expect(areNearDuplicateTopics(q1, q3)).toBe(true);
  });

  it("merges SWOT slug variants via shared slug prefix", () => {
    const a = redirectRow({
      id: "csv:10",
      oldUrl: "https://www.kwbllp.com/old/a/",
      newUrl: "https://www.kwbllp.com/blog/swot-analysis-business-goals/",
      uploadRow: 10,
    });
    const b = redirectRow({
      id: "csv:11",
      oldUrl: "https://www.kwbllp.com/old/b/",
      newUrl: "https://www.kwbllp.com/blog/swot-analysis-clinic-success/",
      uploadRow: 11,
    });
    expect(areNearDuplicateTopics(a, b)).toBe(true);
  });

  it("does not merge unrelated tax topics", () => {
    const brackets = redirectRow({
      id: "csv:1",
      oldUrl: "https://www.kwbllp.com/old/a/",
      newUrl: "https://www.kwbllp.com/blog/alberta-tax-brackets-2026/",
      title: "alberta tax brackets 2026",
      uploadRow: 1,
    });
    const deductions = redirectRow({
      id: "csv:2",
      oldUrl: "https://www.kwbllp.com/old/b/",
      newUrl: "https://www.kwbllp.com/blog/canadian-business-tax-deductions/",
      title: "canadian business tax deductions",
      uploadRow: 2,
    });
    expect(areNearDuplicateTopics(brackets, deductions)).toBe(false);
  });

  it("merges bare trust reporting variants", () => {
    const a = redirectRow({
      id: "csv:1",
      oldUrl: "https://www.kwbllp.com/old/a/",
      newUrl: "https://www.kwbllp.com/blog/bare-trust-reporting-2026/",
      title: "bare trust reporting 2026",
      uploadRow: 1,
    });
    const b = redirectRow({
      id: "csv:2",
      oldUrl: "https://www.kwbllp.com/old/b/",
      newUrl: "https://www.kwbllp.com/blog/bare-trust-reporting-rules/",
      title: "bare trust reporting rules",
      uploadRow: 2,
    });
    expect(areNearDuplicateTopics(a, b)).toBe(true);
  });
});

describe("computeTopicGroupKeysForRedirectMap", () => {
  it("assigns one group key to alberta bracket variants", () => {
    const rows = [
      redirectRow({
        id: "csv:1",
        oldUrl: "https://www.kwbllp.com/old/a/",
        newUrl: "https://www.kwbllp.com/blog/2026-alberta-tax-brackets/",
        title: "2026 alberta tax brackets",
        uploadRow: 1,
      }),
      redirectRow({
        id: "csv:2",
        oldUrl: "https://www.kwbllp.com/old/b/",
        newUrl: "https://www.kwbllp.com/blog/2026-canadian-alberta-tax-brackets/",
        title: "2026 canadian alberta tax brackets",
        uploadRow: 2,
      }),
      redirectRow({
        id: "csv:3",
        oldUrl: "https://www.kwbllp.com/old/c/",
        newUrl: "https://www.kwbllp.com/blog/alberta-tax-brackets-2026/",
        title: "alberta tax brackets 2026",
        uploadRow: 3,
      }),
    ];
    const keys = computeTopicGroupKeysForRedirectMap(rows);
    expect(keys.get("csv:1")).toBe(keys.get("csv:2"));
    expect(keys.get("csv:2")).toBe(keys.get("csv:3"));
  });
});

describe("clusterRedirectMapForOneToOne", () => {
  it("merges near-duplicate topics into one cluster and canonical new_url", () => {
    const rows = [
      redirectRow({
        id: "csv:1",
        oldUrl: "https://www.kwbllp.com/old/a/",
        newUrl: "https://www.kwbllp.com/blog/2026-alberta-tax-brackets/",
        title: "2026 alberta tax brackets",
        uploadRow: 1,
      }),
      redirectRow({
        id: "csv:2",
        oldUrl: "https://www.kwbllp.com/old/b/",
        newUrl: "https://www.kwbllp.com/blog/2026-canadian-alberta-tax-brackets/",
        title: "2026 canadian alberta tax brackets",
        uploadRow: 2,
      }),
      redirectRow({
        id: "csv:3",
        oldUrl: "https://www.kwbllp.com/old/c/",
        newUrl: "https://www.kwbllp.com/blog/alberta-tax-brackets-2026/",
        title: "alberta tax brackets 2026",
        uploadRow: 3,
      }),
    ];

    const { clusters, rows: outRows } = clusterRedirectMapForOneToOne(rows);
    expect(clusters.clusters).toHaveLength(1);
    expect(clusters.clusters[0]?.memberPostIds).toHaveLength(3);
    expect(new Set(outRows.map((r) => r.url)).size).toBe(1);
    expect(pickCanonicalDestinationUrl(outRows)).toBe(outRows[0]?.url);
  });

  it("merges four quarterly URLs into one cluster", () => {
    const rows = [1, 2, 3, 4].map((q) =>
      redirectRow({
        id: `csv:${q}`,
        oldUrl: `https://www.kwbllp.com/old/q${q}/`,
        newUrl: `https://www.kwbllp.com/blog/canadian-interest-rates-q${q}-2026/`,
        uploadRow: q,
      }),
    );

    const { clusters, rows: outRows } = clusterRedirectMapForOneToOne(rows);
    expect(clusters.clusters).toHaveLength(1);
    expect(new Set(outRows.map((r) => r.url)).size).toBe(1);
  });
});

describe("applyGridOutputPolicies", () => {
  it("keeps one-row-per-upload clusters separate in 1:1 redirect-map mode", () => {
    const rows = [
      redirectRow({
        id: "csv:1",
        oldUrl: "https://www.kwbllp.com/old/a/",
        newUrl: "https://www.kwbllp.com/blog/2026-alberta-tax-brackets/",
        title: "2026 alberta tax brackets",
        uploadRow: 1,
      }),
      redirectRow({
        id: "csv:2",
        oldUrl: "https://www.kwbllp.com/old/b/",
        newUrl: "https://www.kwbllp.com/blog/2026-canadian-alberta-tax-brackets/",
        title: "2026 canadian alberta tax brackets",
        uploadRow: 2,
      }),
    ];
    const clusters = clusterOneRowPerUpload(rows);
    const rowMap = new Map(rows.map((r) => [r.postId, r]));
    const merges = clusters.clusters.map((c) => buildDeterministicGridBrief(c, rowMap)!);

    const { contentSheet, clusters: outClusters } = applyGridOutputPolicies({
      rows,
      clusters,
      merges,
      gridMaxUrlsPerPost: 1,
      analyzedAt: "2026-06-01T00:00:00.000Z",
    });

    expect(outClusters.clusters).toHaveLength(2);
    expect(contentSheet).toHaveLength(2);
  });
});

describe("topicTokenSetForRow", () => {
  it("strips years and stop words from titles", () => {
    const row = redirectRow({
      id: "csv:1",
      oldUrl: "https://www.kwbllp.com/old/",
      newUrl: "https://www.kwbllp.com/blog/alberta-tax-brackets-2026/",
      title: "Alberta Tax Brackets 2026: Your Essential Guide",
      uploadRow: 1,
    });
    const tokens = topicTokenSetForRow(row);
    expect(tokens.has("alberta")).toBe(true);
    expect(tokens.has("tax")).toBe(true);
    expect(tokens.has("brackets")).toBe(true);
    expect(tokens.has("2026")).toBe(false);
    expect(tokens.has("essential")).toBe(false);
  });
});
