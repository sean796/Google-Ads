import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import type { EntitySiteWarmBundle } from "@/lib/local-analysis/entity-site-warm-cache";
import {
  PROMPT_IDEAS_GSC_LIMIT,
  buildPromptBulkIdeasContextFromWarm,
  fetchPromptIdeasGscQueries,
  promptBulkIdeasContextIsReady,
} from "@/lib/bulk/prompt-bulk-ideas-context";

vi.mock("@/lib/competitor-research/competitor-gsc-queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/competitor-research/competitor-gsc-queries")>();
  return {
    ...actual,
    fetchCompetitorGscQueries: vi.fn(),
  };
});

const site: WordPressSite = {
  id: "site-1",
  name: "Example Co",
  siteUrl: "https://example.com",
  username: "u",
  appPassword: "p",
  enabled: true,
  connectionStatus: "success",
};

function warmBundle(overrides?: Partial<EntitySiteWarmBundle>): EntitySiteWarmBundle {
  const postsJson = JSON.stringify({
    source: "posts",
    posts: [
      {
        link: "https://example.com/blog/first-post/",
        slug: "first-post",
        title: "First Post",
      },
    ],
  });
  return {
    siteId: site.id,
    credentialsKey: "ck",
    fetchedAt: Date.now(),
    inventory: {
      buckets: {
        pages: { json: "[]", rowCount: 0 },
        posts: { json: postsJson, rowCount: 1 },
        sap: { json: "[]", rowCount: 0 },
      },
      links: [],
    },
    gsc: {
      queries: [],
      dateRange: { startDate: "2025-01-01", endDate: "2025-06-30" },
    },
    counts: {
      inventoryTotal: 1,
      pages: 0,
      posts: 1,
      sap: 0,
      gscQueries: 0,
    },
    ...overrides,
  };
}

function gscQueries(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    query: `keyword phrase ${i}`,
    clicks: 10 - i,
    impressions: 100,
    ctr: 0.1,
    position: 5,
  }));
}

describe("buildPromptBulkIdeasContextFromWarm", () => {
  it("caps GSC strings at PROMPT_IDEAS_GSC_LIMIT", () => {
    const ctx = buildPromptBulkIdeasContextFromWarm(site, warmBundle(), gscQueries(600));
    expect(ctx).not.toBeNull();
    expect(ctx!.gscKeywords.length).toBe(PROMPT_IDEAS_GSC_LIMIT);
    expect(ctx!.isReady).toBe(true);
  });

  it("is not ready when GSC is empty", () => {
    const ctx = buildPromptBulkIdeasContextFromWarm(site, warmBundle(), []);
    expect(ctx?.isReady).toBe(false);
  });

  it("is not ready when inventory total is zero even with GSC", () => {
    const bundle = warmBundle({
      counts: {
        inventoryTotal: 0,
        pages: 0,
        posts: 0,
        sap: 0,
        gscQueries: 5,
      },
    });
    expect(promptBulkIdeasContextIsReady(bundle, 5)).toBe(false);
    const ctx = buildPromptBulkIdeasContextFromWarm(site, bundle, gscQueries(5));
    expect(ctx?.isReady).toBe(false);
  });

  it("is not ready when bundle has error", () => {
    const bundle = warmBundle({ error: "GSC failed" });
    expect(promptBulkIdeasContextIsReady(bundle, 10)).toBe(false);
  });

  it("includes inventory JSON with posts bucket", () => {
    const ctx = buildPromptBulkIdeasContextFromWarm(site, warmBundle(), gscQueries(3));
    const parsed = JSON.parse(ctx!.siteInventoryJson) as {
      posts: { posts: Array<{ title: string }> };
    };
    expect(parsed.posts.posts[0]?.title).toBe("First Post");
  });
});

describe("fetchPromptIdeasGscQueries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests six-month range and row limit 500", async () => {
    const { fetchCompetitorGscQueries, getGscSixMonthCompetitorDateRange } = await import(
      "@/lib/competitor-research/competitor-gsc-queries"
    );
    const range = getGscSixMonthCompetitorDateRange();
    vi.mocked(fetchCompetitorGscQueries).mockResolvedValue({
      ok: true,
      queries: gscQueries(10),
      dateRange: range,
    });

    const rows = await fetchPromptIdeasGscQueries(site);
    expect(rows.length).toBe(10);
    expect(fetchCompetitorGscQueries).toHaveBeenCalledWith(
      expect.objectContaining({
        siteUrl: "https://example.com",
        startDate: range.startDate,
        endDate: range.endDate,
        rowLimit: PROMPT_IDEAS_GSC_LIMIT,
      }),
    );
  });
});
