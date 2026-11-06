import { describe, expect, it } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import { createEmptyOverviewRow } from "@/lib/overview/overview-row-helpers";
import {
  applyHarnessHtmlPatchesToRows,
  buildOverviewAnswerCatalogFromCache,
  buildOverviewHarnessCatalogWithHtml,
  resolveHarnessRowHtmlFromSources,
} from "@/lib/overview/overview-harness-page-catalog";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

const site = {
  id: "wp-test",
  name: "Test",
  siteUrl: "https://example.com",
  username: "u",
  appPassword: "p",
} as WordPressSite;

describe("buildOverviewHarnessCatalogWithHtml", () => {
  it("loads SAP entity HTML from row cache", async () => {
    const url = "https://example.com/plumbing-edmonton/";
    const rows = [
      {
        ...createEmptyOverviewRow(url),
        title: "Plumbing Edmonton",
        focusKeyword: "plumbing edmonton",
        postContentOptimized: "<h2>Services</h2><p>Body</p>",
      },
    ];

    const { catalog, rowHtmlByIndex } = await buildOverviewHarnessCatalogWithHtml({
      site,
      rows,
      indices: [0],
      sitemapSource: "sap",
      bindings: {},
      getInventoryMatchForUrl: () => undefined,
      bulkScopeUrlKeys: new Set([normalizePageUrlKey(url)]),
    });

    expect(rowHtmlByIndex[0]).toContain("Services");
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.pageKind).toBe("entity");
    expect(catalog[0]?.html).toContain("Services");
  });

  it("marks post rows as post page kind", async () => {
    const url = "https://example.com/blog/post/";
    const rows = [
      {
        ...createEmptyOverviewRow(url),
        postContentOptimized: "<h2>Intro</h2><p>Post body</p>",
      },
    ];

    const postsSite = {
      id: "wp-posts",
      name: "Posts only",
      siteUrl: "https://example.com",
    } as WordPressSite;

    const { catalog } = await buildOverviewHarnessCatalogWithHtml({
      site: postsSite,
      rows,
      indices: [0],
      sitemapSource: "posts",
      bindings: {},
      getInventoryMatchForUrl: () => undefined,
      bulkScopeUrlKeys: new Set([normalizePageUrlKey(url)]),
    });

    expect(catalog[0]?.pageKind).toBe("post");
  });

  it("keeps a cache row even when HTML is empty", async () => {
    const url = "https://example.com/blog/empty/";
    const rows = [createEmptyOverviewRow(url)];
    const catalog = buildOverviewAnswerCatalogFromCache({
      site,
      rows,
      indices: [0],
      sitemapSource: "posts",
      getInventoryMatchForUrl: () => undefined,
      bulkScopeUrlKeys: new Set([normalizePageUrlKey(url)]),
    });
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.html).toBe("");
  });

  it("prefers grid postContent over FAQ-only inventory snapshot", () => {
    const url = "https://example.com/cra-mail-in/";
    const html = resolveHarnessRowHtmlFromSources({
      row: {
        ...createEmptyOverviewRow(url),
        postContent: "<h2>Cost factors</h2><p>Full CRA article body.</p>",
        postContentOptimized: `<h2 id="answer">Answer</h2><p>Answer only.</p>`,
      },
      site,
      sitemapSource: "posts",
      getInventoryMatchForUrl: () => ({
        row: {
          id: 1,
          url,
          fields: {
            title: "",
            meta: "",
            keyword: "",
            content: `<h2 id="answer">Answer</h2><div class="flo-faq"><h2 id="faq">FAQ</h2></div>`,
          },
        },
        subtype: "post" as const,
      }),
      index: 0,
    });
    expect(html).toContain("Full CRA article body");
    expect(html).toContain("Cost factors");
  });

  it("prefers scraped postContent over answer-only postContentOptimized", () => {
    const url = "https://example.com/blog/repair/";
    const rows = [
      {
        ...createEmptyOverviewRow(url),
        postContent: "<h2>Cost Factors</h2><p>Full original post.</p>",
        postContentOptimized: `<h2 id="answer">Answer</h2><p>Only answer.</p>`,
      },
    ];
    const catalog = buildOverviewAnswerCatalogFromCache({
      site,
      rows,
      indices: [0],
      sitemapSource: "posts",
      getInventoryMatchForUrl: () => undefined,
      bulkScopeUrlKeys: new Set([normalizePageUrlKey(url)]),
    });
    expect(catalog[0]?.html).toContain("Full original post");
    expect(catalog[0]?.html).toContain("Cost Factors");
  });
});

describe("applyHarnessHtmlPatchesToRows", () => {
  it("writes postContentOptimized on matched indices", () => {
    const patches: Partial<Record<number, { postContentOptimized?: string }>> = {};
    const updateRow = (index: number, patch: Partial<Record<string, string>>) => {
      patches[index] = patch;
    };

    applyHarnessHtmlPatchesToRows({
      rowHtmlByIndex: { 2: "<p>SAP body</p>" },
      updateRow,
    });

    expect(patches[2]?.postContentOptimized).toBe("<p>SAP body</p>");
  });
});
