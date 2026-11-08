import { describe, expect, it } from "vitest";
import { buildContentSheetRows } from "@/lib/sitemap-optimizer/build-content-sheet-rows";
import {
  buildSitemapOptimizerContentSheetRedirectCsvCsv,
  buildSitemapOptimizerContentSheetRedirectCsvWideCsv,
} from "@/lib/sitemap-optimizer/build-content-sheet-pulse-redirects";
import type { SitemapOptimizerRunResult } from "@/lib/sitemap-optimizer/types";

const base: Omit<SitemapOptimizerRunResult, "contentSheet"> = {
  rows: [
    {
      postId: "wp:1",
      url: "https://example.com/blog/old-post/",
      collection: "posts",
      title: "Old Post",
      keyword: "old",
      meta: "old meta",
      contentSnippet: "",
      gscQueries: [],
      gscFetched: true,
    },
  ],
  clusters: { clusters: [], singletons: ["wp:1"] },
  merges: [],
  gscMissCount: 0,
  dateRange: { startDate: "2026-04-01", endDate: "2026-05-01" },
  analyzedAt: "2026-05-01T00:00:00.000Z",
};

describe("build-content-sheet-pulse-redirect", () => {
  it("exports rank math row per content sheet entry", () => {
    const proposals = [
      {
        postId: "wp:1",
        action: "refresh" as const,
        proposedTitle: "Better Post Title",
        proposedPrimaryKeyword: "better post",
        proposedMeta: "New meta description for the page.",
        priority: "high" as const,
        rationale: "improve",
      },
    ];
    const contentSheet = buildContentSheetRows({
      rows: base.rows,
      clusters: base.clusters,
      merges: base.merges,
      standaloneProposals: proposals,
    });
    const result: SitemapOptimizerRunResult = { ...base, contentSheet };
    const { csv, rowCount } = buildSitemapOptimizerContentSheetRedirectCsvCsv(result);
    expect(rowCount).toBe(1);
    expect(csv).toContain("blog/old-post/");
    expect(csv).toContain("destination");
    const wide = buildSitemapOptimizerContentSheetRedirectCsvWideCsv(result);
    expect(wide).toContain("old_url");
    expect(wide).toContain("proposed_title");
    expect(wide).toContain("Better Post Title");
  });
});
