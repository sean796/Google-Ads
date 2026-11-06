import { describe, expect, it } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import type { CSVRow } from "@/lib/bulk-auto-generate";
import { CONTENT_OPTIMIZER_BULK_PAGE_SIZE } from "@/lib/content-optimization/content-optimizer-bulk-page-size";
import {
  buildSitemapMergeBulkState,
  isEntityCompressionRunResult,
  minMembersForMergePublish,
  publishedLinkFromRowFiles,
  publishedLinksByUrlFromRows,
  resolveSitemapMergeSitemapType,
  sitemapRowUrlKey,
} from "@/lib/sitemap-optimizer/sitemap-merge-bulk-state";
import type { SitemapOptimizerRunResult } from "@/lib/sitemap-optimizer/types";

function wpPostFile(link: string): BulkGeneratedFile {
  return {
    id: "f1",
    rowIndex: 0,
    fileName: "wordpress-post-site-title-123.json",
    content: JSON.stringify({ link, postId: 99, title: "Test" }),
    mimeType: "application/json",
    status: "completed",
    timestamp: Date.now(),
    rowData: {
      keyword: "kw",
      title: "Test",
    },
  };
}

describe("sitemap-merge-bulk-state", () => {
  it("publishedLinkFromRowFiles extracts link from wordpress-post json", () => {
    const link = publishedLinkFromRowFiles([
      wpPostFile("https://example.com/service-area/winnipeg/"),
    ]);
    expect(link).toBe("https://example.com/service-area/winnipeg/");
  });

  it("resolveSitemapMergeSitemapType uses entity when entityPrimary and entity sitemap", () => {
    const site = {
      id: "1",
      name: "Site",
      siteUrl: "https://example.com",
      username: "u",
      appPassword: "p",
      connectedAt: 0,
      entitySitemapUrl: "https://example.com/service-area-sitemap.xml",
    } satisfies WordPressSite;
    expect(resolveSitemapMergeSitemapType(site, true)).toBe("entity");
    expect(resolveSitemapMergeSitemapType(site, false)).toBe("post");
    expect(resolveSitemapMergeSitemapType({ ...site, entitySitemapUrl: "" }, true)).toBe(
      "post",
    );
  });

  it("buildSitemapMergeBulkState maps files and row statuses", () => {
    const rows: CSVRow[] = [
      {
        keyword: "winnipeg blinds",
        title: "Winnipeg Blinds",
        destination_url: "https://example.com/service-area/winnipeg/",
        origin: "sitemap-merge",
      },
      {
        keyword: "river heights blinds",
        title: "River Heights",
        destination_url: "https://example.com/service-area/river-heights/",
        origin: "sitemap-merge",
      },
    ];
    const filesByRow = new Map<number, BulkGeneratedFile[]>([
      [0, [wpPostFile("https://example.com/service-area/winnipeg-live/")]],
    ]);
    const publishedLinks = new Map<number, string>([
      [0, "https://example.com/service-area/winnipeg-live/"],
    ]);

    const state = buildSitemapMergeBulkState({
      rows,
      currentRow: 1,
      totalRows: 2,
      publishing: true,
      status: "Generating content",
      harnessSections: [],
      harnessPlannedSectionCount: 4,
      filesByRow,
      urlHarnessSections: {},
      publishedLinksByRowIndex: publishedLinks,
    });

    expect(state).not.toBeNull();
    const dest0 = sitemapRowUrlKey(rows[0], 0);
    const dest1 = sitemapRowUrlKey(rows[1], 1);
    expect(state!.urlStatuses[dest0]).toBe("completed");
    expect(state!.urlStatuses[dest1]).toBe("optimizing");
    expect(state!.urlGeneratedFiles[dest0]?.some((f) => f.name.includes("wordpress-post"))).toBe(
      true,
    );

    const byUrl = publishedLinksByUrlFromRows(rows, publishedLinks);
    expect(byUrl[dest0]).toBe("https://example.com/service-area/winnipeg-live/");
  });

  it("buildSitemapMergeBulkState sets bulk pagination for large SAP runs", () => {
    const rows: CSVRow[] = Array.from({ length: 130 }, (_, i) => ({
      keyword: `kw-${i}`,
      title: `Title ${i}`,
      destination_url: `https://example.com/service-area/city-${i}/`,
      origin: "sitemap-merge",
    }));

    const state = buildSitemapMergeBulkState({
      rows,
      currentRow: 0,
      totalRows: 130,
      publishing: true,
      status: "Starting",
      harnessSections: [],
      harnessPlannedSectionCount: null,
      filesByRow: new Map(),
      urlHarnessSections: {},
      publishedLinksByRowIndex: new Map(),
    });

    expect(state?.bulkPageSize).toBe(CONTENT_OPTIMIZER_BULK_PAGE_SIZE);
    expect(state?.totalBulkPages).toBe(2);
    expect(state?.urls).toHaveLength(130);
  });

  it("detects entity compression runs from service-area inventory", () => {
    const result = {
      rows: [
        {
          postId: "wp:1",
          url: "https://example.com/service-area/a/",
          collection: "service-area",
          title: "A",
          keyword: "",
          meta: "",
          contentSnippet: "",
          gscQueries: [],
          gscFetched: true,
        },
      ],
      clusters: { clusters: [], singletons: [] },
      merges: [],
      contentSheet: [],
      gscMissCount: 0,
      dateRange: { startDate: "2026-01-01", endDate: "2026-02-01" },
      analyzedAt: "2026-02-01T00:00:00.000Z",
    } satisfies SitemapOptimizerRunResult;

    expect(isEntityCompressionRunResult(result)).toBe(true);
    expect(minMembersForMergePublish(result)).toBe(1);
  });
});
