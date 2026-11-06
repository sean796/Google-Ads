import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import type { LoadBulkSitemapInventoryResult } from "@/lib/bulk/bulk-sitemap-inventory-session";
import { buildPostCreatorSafeChecklistRows } from "@/lib/post-creator/post-creator-safe-checklist";

const CANON_CHECKLIST =
  '1. Keyword: "plantation shutters cost", Entity: "", Title: "Plantation Shutters Cost Guide", Modifier: "", FeaturedImage: "y"\n' +
  '2. Keyword: "custom drapery trends", Entity: "", Title: "Custom Drapery Trends", Modifier: "", FeaturedImage: "y"\n' +
  '3. Keyword: "energy efficient blinds", Entity: "", Title: "Energy Efficient Blinds", Modifier: "", FeaturedImage: "y"';

const mockSite: WordPressSite = {
  id: "advance-blinds",
  name: "Advance Blinds",
  siteUrl: "https://advanceblinds.ca",
  username: "user",
  appPassword: "pass",
  connectedAt: 0,
};

function mockInventory(urls: string[]): LoadBulkSitemapInventoryResult {
  const json = urls.join("\n");
  return {
    links: [],
    buckets: {
      pages: { json: "", rowCount: 0 },
      posts: { json, rowCount: urls.length },
      sap: { json: "", rowCount: 0 },
    },
    totalRows: urls.length,
    sources: ["posts"],
    errors: {},
    postsMetadata: [],
  };
}

const inventoryLoad = vi.fn();
const streamChatCompletion = vi.fn();
const gscIdeation = vi.fn();

vi.mock("@/lib/api", () => ({
  loadApiKey: () => "test-openrouter-key",
  streamChatCompletion: (...args: unknown[]) => streamChatCompletion(...args),
}));

vi.mock("@/lib/openrouter-api-key-resolve", () => ({
  resolveOpenRouterApiKeyForHarness: async () => "test-openrouter-key",
}));

vi.mock("@/lib/bulk/prompt-bulk-site-kw-scrape", () => ({
  scrapePromptBulkSiteKwJson: async () => ({ keywordsJsonText: '{"gsc":[],"semrush":[]}' }),
}));

vi.mock("@/lib/post-creator/post-creator-inventory-ideation", () => ({
  runPostCreatorInventoryFirstIdeation: (...args: unknown[]) => gscIdeation(...args),
}));

vi.mock("@/components/integrations/storage", () => ({
  getStoredSites: () => [mockSite],
}));

vi.mock("@/lib/kb-for-bulk-ideas", () => ({
  loadKnowledgeBaseForBulkIdeas: () => ({ activeKnowledgeBaseText: "", knowledgeFiles: [] }),
}));

vi.mock("@/lib/post-creator/post-creator-inventory-bucket", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/post-creator/post-creator-inventory-bucket")>();
  return {
    ...actual,
    loadPostCreatorInventoryBuckets: (...args: unknown[]) => inventoryLoad(...args),
  };
});

describe("post-creator single-pass ideation", () => {
  beforeEach(() => {
    inventoryLoad.mockReset();
    streamChatCompletion.mockReset();
    gscIdeation.mockReset();

    gscIdeation.mockResolvedValue([
      { keyword: "a", title: "A", entity: "", featuredImage: "y" },
      { keyword: "b", title: "B", entity: "", featuredImage: "y" },
      { keyword: "c", title: "C", entity: "", featuredImage: "y" },
    ]);

    inventoryLoad.mockResolvedValue({
      inventory: mockInventory([
        "https://advanceblinds.ca/blog/window-treatments-types/",
        "https://advanceblinds.ca/blog/angled-window/",
      ]),
      bucketFiles: [],
    });

    streamChatCompletion.mockImplementation(async (opts: { onContentChunk?: (c: string) => void }) => {
      opts.onContentChunk?.(CANON_CHECKLIST);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads inventory bucket before OpenRouter ideation", async () => {
    const result = await buildPostCreatorSafeChecklistRows({
      site: mockSite,
      payload: { postCount: 3, keywordSource: "prompt" },
    });

    expect(inventoryLoad).toHaveBeenCalledTimes(1);
    expect(streamChatCompletion).toHaveBeenCalledTimes(1);
    expect(inventoryLoad.mock.invocationCallOrder[0]).toBeLessThan(
      streamChatCompletion.mock.invocationCallOrder[0]!,
    );
    expect(result.rows).toHaveLength(3);
  });

  it("uses manual keywords without OpenRouter", async () => {
    const result = await buildPostCreatorSafeChecklistRows({
      site: mockSite,
      payload: {
        postCount: 2,
        keywordSource: "manual",
        keywordValue: "plantation shutters",
      },
    });

    expect(streamChatCompletion).not.toHaveBeenCalled();
    expect(result.rows.map((r) => r.keyword)).toEqual([
      "plantation shutters 1",
      "plantation shutters 2",
    ]);
  });

  it("throws once when OpenRouter returns too few ideas", async () => {
    streamChatCompletion.mockImplementation(async (opts: { onContentChunk?: (c: string) => void }) => {
      opts.onContentChunk?.(
        '1. Keyword: "one idea", Entity: "", Title: "One Idea", Modifier: "", FeaturedImage: "y"',
      );
    });

    await expect(
      buildPostCreatorSafeChecklistRows({
        site: mockSite,
        payload: { postCount: 3, keywordSource: "prompt" },
      }),
    ).rejects.toThrow(/OpenRouter returned 1\/3 blog ideas/i);

    expect(streamChatCompletion).toHaveBeenCalledTimes(1);
  });

  it("GSC ideation uses exact postCount not a buffer multiplier", async () => {
    await buildPostCreatorSafeChecklistRows({
      site: mockSite,
      payload: { postCount: 3, keywordSource: "gsc" },
    });

    expect(gscIdeation).toHaveBeenCalledTimes(1);
    expect(gscIdeation.mock.calls[0]?.[0]?.postCount).toBe(3);
  });

  it("server preflight skips inventory reload", async () => {
    const inventory = mockInventory(["https://advanceblinds.ca/blog/existing/"]);
    await buildPostCreatorSafeChecklistRows({
      site: mockSite,
      payload: { postCount: 3, keywordSource: "gsc" },
      preflight: {
        inventory,
        bucketJson: inventory.buckets.posts?.json ?? "",
        siteKwJsonText: '{"gsc":["kw"],"semrush":[]}',
        bucketFiles: [],
      },
    });

    expect(inventoryLoad).not.toHaveBeenCalled();
    expect(gscIdeation).toHaveBeenCalledTimes(1);
  });
});
