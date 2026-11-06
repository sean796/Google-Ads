import { describe, expect, it, vi, beforeEach } from "vitest";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";
import { createEmptyOverviewRow } from "@/lib/overview/overview-row-helpers";
import {
  applyInventoryPatchesToOverviewRows,
  buildOverviewSessionRowsFromWarmBulk,
  overviewInventoryRowsHaveDisplayMetadata,
  overviewSessionRowsDisplayReady,
  overviewSessionRowsHaveContent,
  overviewSessionRowsNeedContent,
  overviewSessionRowsMetadataReady,
  hydrateOverviewContentInBackground,
} from "@/lib/overview/overview-inventory-progressive-hydrate";

const fetchOverviewPageContentBatch = vi.fn();

vi.mock("@/lib/overview/overview-page-content-batch", () => ({
  fetchOverviewPageContentBatch: (...args: unknown[]) => fetchOverviewPageContentBatch(...args),
  sliceOverviewRowsByPage: (rows: unknown[]) => [rows],
}));

const site = {
  id: "wp-test",
  name: "Test",
  siteUrl: "https://example.com",
  username: "u",
  appPassword: "p",
} as WordPressSite;

describe("overviewSessionRowsMetadataReady", () => {
  it("returns false when rows lack titles", () => {
    const rows: OverviewRow[] = [
      { ...createEmptyOverviewRow("https://example.com/a/"), title: "" },
    ];
    expect(overviewSessionRowsMetadataReady(rows)).toBe(false);
  });

  it("returns true when every row has a title or page heading", () => {
    const rows: OverviewRow[] = [
      { ...createEmptyOverviewRow("https://example.com/a/"), title: "Post A" },
      { ...createEmptyOverviewRow("https://example.com/b/"), pageHeading: "Heading B" },
    ];
    expect(overviewSessionRowsMetadataReady(rows)).toBe(true);
  });
});

describe("overviewSessionRowsDisplayReady", () => {
  it("returns true when every row has title, keyword, and date", () => {
    const rows: OverviewRow[] = [
      {
        ...createEmptyOverviewRow("https://example.com/a/"),
        title: "Post A",
        focusKeyword: "widgets",
        wpDateGmt: "2024-01-01T00:00:00",
      },
    ];
    expect(overviewSessionRowsDisplayReady(rows)).toBe(true);
  });

  it("returns false when keyword is missing", () => {
    const rows: OverviewRow[] = [
      {
        ...createEmptyOverviewRow("https://example.com/a/"),
        title: "Post A",
        wpDateGmt: "2024-01-01T00:00:00",
      },
    ];
    expect(overviewSessionRowsDisplayReady(rows)).toBe(false);
  });
});

describe("overviewInventoryRowsHaveDisplayMetadata", () => {
  it("returns true when bulk rows have title, keyword, and date", () => {
    expect(
      overviewInventoryRowsHaveDisplayMetadata([
        {
          id: 1,
          url: "https://example.com/a/",
          slug: "a",
          collection: "posts",
          date_gmt: "2024-01-01T00:00:00",
          fields: { title: "Post A", meta: "", keyword: "widgets" },
        },
      ]),
    ).toBe(true);
  });

  it("returns false for url-only shells", () => {
    expect(
      overviewInventoryRowsHaveDisplayMetadata([
        {
          id: 0,
          url: "https://example.com/a/",
          slug: "",
          collection: "posts",
          fields: { title: "", meta: "", keyword: "" },
        },
      ]),
    ).toBe(false);
  });
});

describe("overviewSessionRowsHaveContent", () => {
  it("returns true when any row has postContent", () => {
    const rows: OverviewRow[] = [
      { ...createEmptyOverviewRow("https://example.com/a/"), postContent: "<p>body</p>" },
    ];
    expect(overviewSessionRowsHaveContent(rows)).toBe(true);
  });

  it("returns false when no row has postContent", () => {
    const rows: OverviewRow[] = [
      { ...createEmptyOverviewRow("https://example.com/a/"), title: "Only meta" },
    ];
    expect(overviewSessionRowsHaveContent(rows)).toBe(false);
  });
});

describe("overviewSessionRowsNeedContent", () => {
  it("returns true when a row lacks postContent", () => {
    const rows: OverviewRow[] = [
      { ...createEmptyOverviewRow("https://example.com/a/"), title: "A", postContent: "<p>x</p>" },
      { ...createEmptyOverviewRow("https://example.com/b/"), title: "B" },
    ];
    expect(overviewSessionRowsNeedContent(rows)).toBe(true);
  });

  it("returns false when every row has postContent", () => {
    const rows: OverviewRow[] = [
      { ...createEmptyOverviewRow("https://example.com/a/"), postContent: "<p>a</p>" },
    ];
    expect(overviewSessionRowsNeedContent(rows)).toBe(false);
  });
});

describe("applyInventoryPatchesToOverviewRows", () => {
  it("hydrates title and keyword from inventory match", () => {
    const rows: OverviewRow[] = [createEmptyOverviewRow("https://example.com/post/")];
    const patched = applyInventoryPatchesToOverviewRows(
      rows,
      site,
      "posts",
      { "https://example.com/post/": { postId: 7, subtype: "post" } },
      (_s, url) => ({
        row: {
          id: 7,
          url,
          slug: "post",
          fields: { title: "My Post", meta: "Desc", keyword: "widgets" },
        },
        subtype: "post",
      }),
    );
    expect(patched[0]?.title).toBe("My Post");
    expect(patched[0]?.focusKeyword).toBe("my post");
    expect(patched[0]?.status).toBe("idle");
  });
});

describe("buildOverviewSessionRowsFromWarmBulk", () => {
  it("builds overview rows with title and keyword from bulk inventory", () => {
    const rows = buildOverviewSessionRowsFromWarmBulk(site, "posts", [
      {
        id: 1,
        url: "https://example.com/a/",
        slug: "a",
        collection: "posts",
        date_gmt: "2024-01-01T00:00:00",
        fields: { title: "Post A", meta: "", keyword: "widgets" },
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("Post A");
    expect(rows[0]?.focusKeyword).toBe("post a");
  });
});

describe("hydrateOverviewContentInBackground", () => {
  beforeEach(() => {
    fetchOverviewPageContentBatch.mockReset();
  });

  it("merges batch patches and respects stale generation guard", async () => {
    fetchOverviewPageContentBatch.mockResolvedValue({
      ok: true,
      contentRows: [
        {
          id: 1,
          url: "https://example.com/a/",
          slug: "a",
          fields: { title: "A", meta: "", keyword: "", content: "<p>body a</p>" },
        },
      ],
      patches: new Map([
        [
          "https://example.com/a/",
          { postContent: "<p>body a</p>", postId: 1 },
        ],
      ]),
      includeIds: [1],
    });

    const rows: OverviewRow[] = [
      { ...createEmptyOverviewRow("https://example.com/a/"), title: "A", postId: 1 },
    ];
    const onRowsUpdated = vi.fn();
    let generation = 1;

    await hydrateOverviewContentInBackground({
      site,
      source: "posts",
      rows,
      generation,
      isStaleLoad: (g) => g !== generation,
      bindingMap: { "https://example.com/a/": { postId: 1, subtype: "post" } },
      getInventoryMatchForUrl: () => undefined,
      mergeInventoryContentForSource: vi.fn(),
      onRowsUpdated,
    });

    expect(fetchOverviewPageContentBatch).toHaveBeenCalledTimes(1);
    expect(onRowsUpdated).toHaveBeenCalledTimes(1);
    expect(onRowsUpdated.mock.calls[0]?.[0]?.[0]?.postContent).toBe("<p>body a</p>");

    generation = 2;
    onRowsUpdated.mockClear();
    fetchOverviewPageContentBatch.mockClear();

    await hydrateOverviewContentInBackground({
      site,
      source: "posts",
      rows,
      generation: 1,
      isStaleLoad: (g) => g !== generation,
      bindingMap: {},
      getInventoryMatchForUrl: () => undefined,
      mergeInventoryContentForSource: vi.fn(),
      onRowsUpdated,
    });

    expect(fetchOverviewPageContentBatch).not.toHaveBeenCalled();
    expect(onRowsUpdated).not.toHaveBeenCalled();
  });
});
