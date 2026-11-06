import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildContentSheetRows } from "@/lib/sitemap-optimizer/build-content-sheet-rows";
import { runSitemapOptimizerApprovePlan } from "@/lib/sitemap-optimizer/sitemap-optimizer-approve-plan";
import type {
  SitemapOptimizerClusterResult,
  SitemapOptimizerMergeRecommendation,
  SitemapOptimizerPostRow,
  SitemapOptimizerRunResult,
} from "@/lib/sitemap-optimizer/types";
import type { WordPressSite } from "@/components/integrations/types";

const trashMock = vi.fn();

vi.mock("@/lib/sitemap-optimizer/trash-merge-source-posts", () => ({
  collectMergeSourcePosts: vi.fn(() => [{ postId: "wp:1" }, { postId: "wp:2" }]),
  trashMergeSourcePosts: (...args: unknown[]) => trashMock(...args),
}));

const sampleRows: SitemapOptimizerPostRow[] = [
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
];

const sampleClusters: SitemapOptimizerClusterResult = {
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
  singletons: [] as string[],
};

const sampleMerges: SitemapOptimizerMergeRecommendation[] = [
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
    lockedDestinationUrl: "https://example.com/blog/merged-guide/",
  },
];

const sampleResultBase = {
  rows: sampleRows,
  clusters: sampleClusters,
  merges: sampleMerges,
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

const site: WordPressSite = {
  id: "site-1",
  name: "Example",
  siteUrl: "https://example.com",
  username: "user",
  appPassword: "pass",
  connectedAt: 0,
};

describe("runSitemapOptimizerApprovePlan", () => {
  beforeEach(() => {
    trashMock.mockReset();
    trashMock.mockResolvedValue({
      trashed: 2,
      failed: 0,
      skipped: 0,
      errors: [],
    });
  });

  it("downloads redirect and content sheet before trash, without publishing", async () => {
    const phaseOrder: string[] = [];
    const redirectDownload = vi.fn();
    const contentDownload = vi.fn();

    const summary = await runSitemapOptimizerApprovePlan({
      site,
      result: sampleResult,
      triggerRedirectDownload: redirectDownload,
      triggerContentSheetDownload: contentDownload,
      onPhaseProgress: (p) => phaseOrder.push(p.phase),
    });

    expect(redirectDownload).toHaveBeenCalledTimes(1);
    expect(contentDownload).toHaveBeenCalledTimes(1);
    expect(trashMock).toHaveBeenCalledTimes(1);
    expect(summary.trashed).toBe(2);

    const redirectIdx = phaseOrder.indexOf("redirects");
    const contentIdx = phaseOrder.indexOf("content_sheet");
    const trashIdx = phaseOrder.indexOf("trash");
    const doneIdx = phaseOrder.indexOf("done");
    expect(redirectIdx).toBeGreaterThanOrEqual(0);
    expect(contentIdx).toBeGreaterThan(redirectIdx);
    expect(trashIdx).toBeGreaterThan(contentIdx);
    expect(doneIdx).toBeGreaterThan(trashIdx);
    expect(phaseOrder).not.toContain("publish");

    expect(trashMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      redirectDownload.mock.invocationCallOrder[0],
    );
    expect(trashMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      contentDownload.mock.invocationCallOrder[0],
    );
  });

  it("throws when merges exist but redirect export is empty", async () => {
    const sameDest = "https://example.com/blog/merged-guide/";
    const noRedirectResult: SitemapOptimizerRunResult = {
      ...sampleResult,
      rows: sampleResult.rows.map((r) => ({ ...r, url: sameDest })),
      contentSheet: sampleResult.contentSheet.map((row) => ({
        ...row,
        sourceUrl: sameDest,
        legacySourceUrl: sameDest,
        proposedDestinationUrl: sameDest,
      })),
      merges: sampleResult.merges,
    };

    await expect(
      runSitemapOptimizerApprovePlan({
        site,
        result: noRedirectResult,
        triggerRedirectDownload: vi.fn(),
        triggerContentSheetDownload: vi.fn(),
      }),
    ).rejects.toThrow(/No redirect rows/i);

    expect(trashMock).not.toHaveBeenCalled();
  });
});
