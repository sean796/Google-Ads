import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { AiAllMetaCatalogRow } from "@/lib/overview/overview-ai-all-meta-batch-catalog";
import { normalizeOverviewKeywordUrlKey } from "@/lib/overview/overview-keyword-batch-parse";
import { OVERVIEW_AI_ALL_META_BATCH_SIZE } from "@/lib/overview/overview-ai-all-meta-batch-constants";
import {
  buildAiAllMetaEligibleRows,
  runOverviewAiAllMetaBatch,
} from "@/lib/overview/overview-ai-all-meta-batch";
import {
  buildMetaPagePingFromOverviewRow,
  pingOverviewPageForMeta,
} from "@/lib/overview/overview-ai-all-meta-page-ping";

vi.mock("@/lib/overview/overview-ai-all-meta-page-ping", () => ({
  buildMetaPagePingFromOverviewRow: vi.fn((row: OverviewRow) => ({
    ok: true,
    url: row.url,
    postId: 1,
    endpoint: "Session inventory / grid row (no API)",
    title: row.title || "Title",
    plainTextContent: row.postContent || "body",
    charCount: 4,
    postFieldsSeoResearch: row.seoResearch,
  })),
  pingOverviewPageForMeta: vi.fn(),
  formatPageApiPingArtifact: vi.fn(() => "ping artifact"),
}));

vi.mock("@/lib/overview/overview-ai-all-meta-harness-sections", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/overview/overview-ai-all-meta-harness-sections")>();
  return {
    ...actual,
    makeMetaHarnessStartPayloads: vi.fn(() => []),
  };
});

vi.mock("@/lib/overview/overview-ai-all-meta-harness-mutations", () => ({
  emitMetaHarnessPayloads: vi.fn(),
  finishMetaRowHarness: vi.fn(() => true),
  setMetaUrlStatus: vi.fn(),
}));

vi.mock("@/lib/overview/overview-faq-harness-run", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/overview/overview-faq-harness-run")>();
  return {
    ...actual,
    runFaqPairsForRow: vi.fn(async () => true),
  };
});

function makeRow(i: number): OverviewRow {
  return {
    url: `https://example.com/post-${i}/`,
    title: `Post ${i}`,
    metaDescription: "",
    aiTitle: "",
    aiMeta: "",
    aiSuggestedPath: "",
    status: "idle",
    focusKeyword: `keyword ${i}`,
    faq: "",
    dateModifier: "",
    seoResearch: "brief",
  };
}

function makeCatalogEntry(i: number): AiAllMetaCatalogRow {
  return {
    index: i,
    url: `https://example.com/post-${i}/`,
    focusKeyword: `keyword ${i}`,
    existingMeta: "meta",
    existingTitle: "title",
    seoResearchBrief: "brief",
    faqMode: "none",
    faqPairCount: 0,
    seedCount: 4,
    includeTitle: true,
  };
}

describe("runOverviewAiAllMetaBatch pagination", () => {
  const site = { id: "s1", name: "Site", siteUrl: "https://example.com" } as WordPressSite;
  let catalogChunkSizes: number[];
  let pageStateUpdates: number[];

  beforeEach(() => {
    catalogChunkSizes = [];
    pageStateUpdates = [];
  });

  it("processes 250 rows in pages of 100 with OpenRouter chunks at most 40", async () => {
    const rows = Array.from({ length: 250 }, (_, i) => makeRow(i));
    const catalog = rows.map((_, i) => makeCatalogEntry(i));
    const eligible = buildAiAllMetaEligibleRows(rows, catalog);

    const setBulkOptimizationState = vi.fn((updater: (prev: Record<string, unknown>) => unknown) => {
      const prev = {
        "s1-batch": {
          urls: rows.map((r) => r.url),
          urlStatuses: {},
        },
      };
      const next = updater(prev);
      const batch = (next as typeof prev)["s1-batch"] as { currentBulkPage?: number } | undefined;
      if (batch?.currentBulkPage) pageStateUpdates.push(batch.currentBulkPage);
    });

    await runOverviewAiAllMetaBatch({
      site,
      sitemapSource: "posts",
      getInventoryMatchForUrl: () => undefined,
      eligible,
      harnessSetters: {
        siteId: site.id,
        batchKey: "s1-batch",
        setBulkOptimizationState: setBulkOptimizationState as never,
        setOptimizationProgress: vi.fn(),
      },
      batchKey: "s1-batch",
      bulkAiFaqSeedCount: 4,
      faqDeps: {} as never,
      runAiAllMetaBatchForCatalog: async (chunk) => {
        catalogChunkSizes.push(chunk.length);
        const map = new Map<string, { metaDescription: string; aiMeta: string }>();
        for (const entry of chunk) {
          map.set(normalizeOverviewKeywordUrlKey(entry.url), {
            metaDescription: "A long enough meta description for testing keyword match here.",
            aiMeta: "A long enough meta description for testing keyword match here.",
          });
        }
        return map;
      },
      updateRow: vi.fn(),
      isCancelled: () => false,
    });

    expect(Math.max(...catalogChunkSizes)).toBeLessThanOrEqual(OVERVIEW_AI_ALL_META_BATCH_SIZE);
    expect(pageStateUpdates).toEqual([1, 2, 3]);
    expect(catalogChunkSizes.reduce((a, b) => a + b, 0)).toBe(250);
    expect(vi.mocked(pingOverviewPageForMeta)).not.toHaveBeenCalled();
  });

  it("buildMetaPagePingFromOverviewRow uses grid fields without API", () => {
    const row = makeRow(0);
    row.postContent = "<p>Hello world</p>";
    row.seoResearch = '{"intent":"info"}';
    const ping = buildMetaPagePingFromOverviewRow(row);
    expect(ping.endpoint).toContain("Session inventory");
    expect(ping.plainTextContent).toContain("Hello world");
    expect(ping.postFieldsSeoResearch).toBe('{"intent":"info"}');
  });
});
