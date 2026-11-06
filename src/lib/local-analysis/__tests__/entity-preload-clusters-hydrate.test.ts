import { describe, expect, it, vi } from "vitest";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import {
  countBlankEntityKeywordRows,
  fillEntitySlotKeywordsFromGsc,
  keywordTargetsFromPreloadedSapRows,
} from "@/lib/local-analysis/entity-preload-clusters-hydrate";
import { finalizeEntitySapRowsForAdGroups } from "@/lib/local-analysis/sap-entity-ad-groups";

vi.mock("@/lib/local-analysis/entity-site-warm-cache", () => ({
  ensureEntitySiteWarmCache: vi.fn(),
  ensureEntitySiteWarmInventory: vi.fn(async () => {}),
  gscAllQueriesFromWarmBundle: vi.fn(() => [
    { query: "blinds near me", clicks: 1, impressions: 10 },
  ]),
  gscQueriesFromWarmBundleForSapBudget: vi.fn(() => []),
}));

vi.mock("@/lib/local-analysis/entity-sap-row-keyword-fill", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/local-analysis/entity-sap-row-keyword-fill")>();
  return {
    ...actual,
    fillEntitySapRowKeywordsFromInventoryAndGsc: vi.fn(async ({ rows }: { rows: CSVRow[] }) =>
      rows.map((row, i) => ({ ...row, keyword: row.keyword || `kw-${i}` })),
    ),
  };
});

import {
  ensureEntitySiteWarmCache,
  gscAllQueriesFromWarmBundle,
} from "@/lib/local-analysis/entity-site-warm-cache";
import { fillEntitySapRowKeywordsFromInventoryAndGsc } from "@/lib/local-analysis/entity-sap-row-keyword-fill";

function row(entity: string, keyword = ""): CSVRow {
  return { entity, keyword, title: "" };
}

const mockSite = {
  id: "site-1",
  name: "Test",
  siteUrl: "https://example.com",
  username: "u",
  appPassword: "p",
  connectedAt: 0,
} as const;

type WarmBundle = Awaited<ReturnType<typeof ensureEntitySiteWarmCache>>;

function warmBundle(overrides: Partial<WarmBundle> = {}): WarmBundle {
  return {
    siteId: "site-1",
    credentialsKey: "site-1",
    fetchedAt: 0,
    inventory: {
      totalRows: 10,
      links: [],
      buckets: {
        pages: { json: "", rowCount: 0 },
        posts: { json: "", rowCount: 0 },
        sap: { json: "", rowCount: 0 },
      },
      sources: [],
      errors: {},
      postsMetadata: [],
    },
    gsc: {
      queries: [],
      dateRange: { startDate: "2026-01-01", endDate: "2026-03-31" },
    },
    counts: { inventoryTotal: 10, pages: 0, posts: 0, sap: 0, gscQueries: 0 },
    ...overrides,
  };
}

describe("keywordTargetsFromPreloadedSapRows", () => {
  it("builds one target per ad group with correct sapPages", () => {
    const rows = finalizeEntitySapRowsForAdGroups([
      row("Southland Mall, Winkler, MB"),
      row("Southland Mall, Winkler, MB"),
      row("Southland Mall, Winkler, MB"),
      row("Mountain Ave, Winkler, MB"),
      row("Mountain Ave, Winkler, MB"),
      row("Mountain Ave, Winkler, MB"),
    ]);
    let n = 0;
    const targets = keywordTargetsFromPreloadedSapRows(rows, () => `t-${++n}`);
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.entityHint).sort()).toEqual(
      ["Mountain Ave, Winkler, MB", "Southland Mall, Winkler, MB"].sort(),
    );
    expect(targets.every((t) => t.sapPages === 3)).toBe(true);
    expect(targets.every((t) => t.clusterRole === "seed")).toBe(true);
  });
});

describe("countBlankEntityKeywordRows", () => {
  it("counts entity rows missing keywords", () => {
    expect(countBlankEntityKeywordRows([row("A"), row("B", "k")])).toBe(1);
  });
});

describe("fillEntitySlotKeywordsFromGsc", () => {
  it("throws when OpenRouter key is missing", async () => {
    await expect(
      fillEntitySlotKeywordsFromGsc({
        site: mockSite,
        apiKey: "",
        model: "m",
        siteName: "Test",
        siteUrl: "https://example.com",
        rows: [row("Southland Mall, Winkler, MB")],
        gridLocations: ["Winkler"],
      }),
    ).rejects.toThrow(/OpenRouter/i);
  });

  it("throws when GSC queries are empty", async () => {
    vi.mocked(gscAllQueriesFromWarmBundle).mockReturnValueOnce([]);
    vi.mocked(ensureEntitySiteWarmCache).mockResolvedValue(
      warmBundle({
        error: "Google Search Console returned no keywords for this site.",
      }),
    );

    await expect(
      fillEntitySlotKeywordsFromGsc({
        site: mockSite,
        apiKey: "key",
        model: "m",
        siteName: "Test",
        siteUrl: "https://example.com",
        rows: [row("Southland Mall, Winkler, MB")],
        gridLocations: ["Winkler"],
      }),
    ).rejects.toThrow(/Google Search Console returned no keywords/i);
  });

  it("returns filled rows when warm cache and fill succeed", async () => {
    vi.mocked(ensureEntitySiteWarmCache).mockResolvedValue(
      warmBundle({
        inventory: {
          totalRows: 10,
          links: [
            {
              href: "https://example.com/p",
              filename: "inventory.txt",
              rowCount: 1,
              source: "pages",
              label: "Page",
            },
          ],
          buckets: {
            pages: { json: "", rowCount: 0 },
            posts: { json: "", rowCount: 0 },
            sap: { json: "", rowCount: 0 },
          },
          sources: [],
          errors: {},
          postsMetadata: [],
        },
        gsc: {
          queries: [{ query: "blinds", clicks: 1, impressions: 10, ctr: 0.1, position: 5 }],
          dateRange: { startDate: "2026-01-01", endDate: "2026-03-31" },
        },
      }),
    );

    const { rows } = await fillEntitySlotKeywordsFromGsc({
      site: mockSite,
      apiKey: "key",
      model: "m",
      siteName: "Test",
      siteUrl: "https://example.com",
      rows: finalizeEntitySapRowsForAdGroups([
        row("Southland Mall, Winkler, MB"),
        row("Southland Mall, Winkler, MB"),
      ]),
      gridLocations: ["Winkler"],
    });

    expect(rows.every((r) => r.keyword?.trim())).toBe(true);
    expect(fillEntitySapRowKeywordsFromInventoryAndGsc).toHaveBeenCalled();
  });

  it("passes clientAudienceContextMarkdown to keyword fill", async () => {
    vi.mocked(ensureEntitySiteWarmCache).mockResolvedValue(
      warmBundle({
        gsc: {
          queries: [{ query: "tax preparation", clicks: 1, impressions: 10, ctr: 0.1, position: 5 }],
          dateRange: { startDate: "2026-01-01", endDate: "2026-03-31" },
        },
      }),
    );

    await fillEntitySlotKeywordsFromGsc({
      site: mockSite,
      apiKey: "key",
      model: "m",
      siteName: "KWB LLP",
      siteUrl: "https://example.com",
      rows: [row("Sherwood Park, AB")],
      gridLocations: ["Sherwood Park, AB"],
      clientAudienceContextMarkdown: "**Services:** tax preparation, bookkeeping",
    });

    expect(fillEntitySapRowKeywordsFromInventoryAndGsc).toHaveBeenCalledWith(
      expect.objectContaining({
        clientAudienceContextMarkdown: "**Services:** tax preparation, bookkeeping",
      }),
    );
  });

  it("returns rows from keyword fill without a second collision pass", async () => {
    vi.mocked(ensureEntitySiteWarmCache).mockResolvedValue(
      warmBundle({
        gsc: {
          queries: [{ query: "blinds near me", clicks: 1, impressions: 10, ctr: 0.1, position: 5 }],
          dateRange: { startDate: "2026-01-01", endDate: "2026-03-31" },
        },
      }),
    );

    vi.mocked(fillEntitySapRowKeywordsFromInventoryAndGsc).mockResolvedValueOnce([
      row("Southland Mall, Winkler, MB", "blinds southland mall winkler mb"),
    ]);

    const result = await fillEntitySlotKeywordsFromGsc({
      site: mockSite,
      apiKey: "key",
      model: "m",
      siteName: "Test",
      siteUrl: "https://example.com",
      rows: [row("Southland Mall, Winkler, MB")],
      gridLocations: ["Winkler"],
    });

    expect(result.rows[0]?.keyword?.trim()).toBe("blinds southland mall winkler mb");
  });
});
