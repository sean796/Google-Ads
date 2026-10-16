import { describe, expect, it, vi, beforeEach } from "vitest";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import type { WordPressSite } from "@/components/integrations/types";
import {
  buildWpUploadEligibleRows,
  isOverviewRowDirtyForWpUpload,
  runOverviewWpUploadBatch,
} from "@/lib/overview/overview-wp-upload-batch";
import { overviewBulkScopeUrlKeysFromRows } from "@/lib/overview/overview-bulk-row-scope";
import type { OverviewBulkSeoApiItem } from "@/lib/overview/overview-bulk-seo-payload";

const bulkUpdateOverviewSeo = vi.fn();

vi.mock("@/lib/wordpress-api/meta", () => ({
  bulkUpdateOverviewSeo: (...args: unknown[]) => bulkUpdateOverviewSeo(...args),
}));

function testSite(): WordPressSite {
  return {
    id: "site-1",
    name: "Test",
    siteUrl: "https://example.com",
    username: "user",
    appPassword: "pass",
    connectedAt: Date.now(),
  } as WordPressSite;
}

function mockBulkOk(items: OverviewBulkSeoApiItem[]) {
  return {
    success: true,
    results: items.map((item, index) => ({
      postId: item.postId,
      index,
      ok: true,
      method: "batch_v1",
    })),
    okCount: items.length,
    total: items.length,
  };
}

describe("runOverviewWpUploadBatch", () => {
  beforeEach(() => {
    bulkUpdateOverviewSeo.mockReset();
  });

  it("batches meta-only rows into one Pulse request up to 25 items and attaches proof files", async () => {
    const rowCount = 3;
    const rows: OverviewRow[] = [];
    const bindings: Record<string, OverviewBinding> = {};

    for (let i = 0; i < rowCount; i += 1) {
      const url = `https://example.com/post-${i}/`;
      rows.push({
        url,
        title: `Title ${i}`,
        metaDescription: `Meta ${i}`,
        aiTitle: "",
        aiMeta: "",
        status: "idle",
        focusKeyword: `kw ${i}`,
      });
      bindings[url] = { postId: 1000 + i, subtype: "post" };
    }

    const eligible = buildWpUploadEligibleRows(rows, bindings, overviewBulkScopeUrlKeysFromRows(rows));
    expect(eligible).toHaveLength(rowCount);

    bulkUpdateOverviewSeo.mockImplementation(
      async (_siteUrl, _user, _pass, items: OverviewBulkSeoApiItem[]) => mockBulkOk(items),
    );

    let bulkState: Record<string, { urlGeneratedFiles?: Record<string, Array<{ name: string }>> }> = {};
    const setBulkOptimizationState = vi.fn((updater: (prev: Record<string, unknown>) => unknown) => {
      if (typeof updater === "function") {
        bulkState = updater(bulkState as Record<string, unknown>) as typeof bulkState;
      }
    });
    const setOptimizationProgress = vi.fn((updater: (prev: Record<string, unknown>) => unknown) => {
      if (typeof updater === "function") {
        updater({});
      }
    });

    const site = testSite();
    const batchKey = `${site.id}-batch`;
    const stats = await runOverviewWpUploadBatch({
      site,
      eligible,
      batchKey,
      harnessSetters: {
        siteId: site.id,
        batchKey,
        setBulkOptimizationState,
        setOptimizationProgress,
      },
    });

    expect(bulkUpdateOverviewSeo).toHaveBeenCalledTimes(1);
    expect(bulkUpdateOverviewSeo.mock.calls[0]![3]).toHaveLength(3);
    expect(stats.stats.okCount).toBe(rowCount);
    expect(stats.stats.failCount).toBe(0);
    const proofFiles = bulkState[batchKey]?.urlGeneratedFiles?.["https://example.com/post-0/"] ?? [];
    expect(proofFiles.some((f) => f.name === "wordpress.json")).toBe(true);
  });

  it("filters out unchanged rows when 0 are selected, and includes selected rows when selection is non-empty", () => {
    const unchangedUrl = "https://example.com/unchanged/";
    const changedUrl = "https://example.com/changed/";
    const rows: OverviewRow[] = [
      {
        url: unchangedUrl,
        title: "Unchanged Title",
        metaDescription: "Unchanged Meta",
        aiTitle: "",
        aiMeta: "",
        status: "idle",
        focusKeyword: "unchanged title",
      },
      {
        url: changedUrl,
        title: "Old Title",
        metaDescription: "Meta",
        aiTitle: "New AI Title",
        aiMeta: "",
        status: "idle",
        focusKeyword: "changed kw",
      },
    ];
    const bindings: Record<string, OverviewBinding> = {
      [unchangedUrl]: { postId: 10, subtype: "post" },
      [changedUrl]: { postId: 11, subtype: "post" },
    };
    const getInventoryMatchForUrl = (url: string) =>
      url === unchangedUrl
        ? {
            row: {
              id: 10,
              fields: {
                title: "Unchanged Title",
                excerpt: "Unchanged Meta",
                keyword: "unchanged title",
              },
              acf: { keyword_focus: "unchanged title" },
            },
            subtype: "post" as const,
          }
        : undefined;

    expect(
      isOverviewRowDirtyForWpUpload(rows[0]!, getInventoryMatchForUrl(unchangedUrl)),
    ).toBe(false);
    expect(
      isOverviewRowDirtyForWpUpload(rows[1]!, getInventoryMatchForUrl(changedUrl)),
    ).toBe(true);

    const eligibleWhenZeroSelected = buildWpUploadEligibleRows(
      rows,
      bindings,
      overviewBulkScopeUrlKeysFromRows(rows),
      null,
      {
        selectedUrlKeys: new Set(),
        getInventoryMatchForUrl,
      },
    );
    expect(eligibleWhenZeroSelected.map((e) => e.row.url)).toEqual([changedUrl]);

    const selectedKeys = overviewBulkScopeUrlKeysFromRows([rows[0]!]);
    const eligibleWhenSelected = buildWpUploadEligibleRows(
      rows,
      bindings,
      selectedKeys,
      null,
      {
        selectedUrlKeys: selectedKeys,
        getInventoryMatchForUrl,
      },
    );
    expect(eligibleWhenSelected.map((e) => e.row.url)).toEqual([unchangedUrl]);
  });

  it("includes post body in bulk-update payload for content rows", async () => {
    const url = "https://example.com/post-with-overview/";
    const rows: OverviewRow[] = [
      {
        url,
        title: "Title",
        metaDescription: "Meta",
        aiTitle: "",
        aiMeta: "",
        status: "idle",
        focusKeyword: "kw",
        postContentOptimized: "<h2>Overview</h2><p>Body</p>",
      },
    ];
    const bindings: Record<string, OverviewBinding> = {
      [url]: { postId: 42, subtype: "post" },
    };
    const eligible = buildWpUploadEligibleRows(rows, bindings, overviewBulkScopeUrlKeysFromRows(rows));
    expect(eligible).toHaveLength(1);
    expect(eligible[0]?.bundle.item.postContent?.length).toBeGreaterThan(0);

    bulkUpdateOverviewSeo.mockImplementation(
      async (_siteUrl, _user, _pass, items: OverviewBulkSeoApiItem[]) => mockBulkOk(items),
    );

    const site = testSite();
    const batchKey = `${site.id}-batch`;
    const stats = await runOverviewWpUploadBatch({
      site,
      eligible,
      batchKey,
      harnessSetters: {
        siteId: site.id,
        batchKey,
        setBulkOptimizationState: vi.fn(),
        setOptimizationProgress: vi.fn(),
      },
    });

    expect(bulkUpdateOverviewSeo).toHaveBeenCalledTimes(1);
    const items = bulkUpdateOverviewSeo.mock.calls[0]![3] as OverviewBulkSeoApiItem[];
    expect(items[0]?.postContent).toContain("<h2>Overview</h2>");
    expect(stats.stats.okCount).toBe(1);
    expect(stats.stats.failCount).toBe(0);
  });

  it("uses resolveBinding when bindings map is empty but inventory match exists", () => {
    const url = "https://example.com/service-area/phoenix/";
    const rows: OverviewRow[] = [
      {
        url,
        title: "Phoenix window treatments",
        metaDescription: "",
        aiTitle: "",
        aiMeta: "",
        status: "idle",
        focusKeyword: "phoenix window treatments",
      },
    ];
    const eligible = buildWpUploadEligibleRows(rows, {}, overviewBulkScopeUrlKeysFromRows(rows), null, {
      resolveBinding: () => ({ postId: 77, subtype: "service-area" }),
    });
    expect(eligible).toHaveLength(1);
    expect(eligible[0]?.bundle.item.postTypeEndpoint).toBe("service-area");
  });
});
