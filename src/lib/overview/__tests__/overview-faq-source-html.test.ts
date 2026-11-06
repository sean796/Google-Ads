import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import { createEmptyOverviewRow } from "@/lib/overview/overview-row-helpers";

const getWordPressPostContent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/wordpress-api/posts", () => ({
  getWordPressPostContent,
}));

import {
  fetchLiveWordPressPostBodyForRow,
  isTruncatedFaqSourceBody,
  pickBestFaqSourceHtml,
  resolveFaqHarnessSourceHtmlFromCache,
} from "@/lib/overview/overview-faq-source-html";

describe("pickBestFaqSourceHtml", () => {
  it("prefers full article over answer-only cache even when answer block is longer", () => {
    expect(
      pickBestFaqSourceHtml(
        `<h2 id="answer">Answer</h2><p>${"Short answer paragraph. ".repeat(10)}</p>`,
        `<h2>Overview</h2><p>Section.</p><h2>Details</h2><p>${"Full article body. ".repeat(5)}</p>`,
      ),
    ).toContain("Overview");
    expect(
      pickBestFaqSourceHtml(
        `<h2 id="answer">Answer</h2><p>${"Short answer paragraph. ".repeat(10)}</p>`,
        `<h2>Overview</h2><p>Section.</p><h2>Details</h2><p>${"Full article body. ".repeat(5)}</p>`,
      ),
    ).toContain("Details");
  });
});

describe("isTruncatedFaqSourceBody", () => {
  it("flags answer-only bodies", () => {
    expect(isTruncatedFaqSourceBody(`<h2 id="answer">Answer</h2><p>Only answer.</p>`)).toBe(true);
    expect(
      isTruncatedFaqSourceBody(
        `<h2>Overview</h2><p>Body</p><h2>Details</h2><p>More</p>`,
      ),
    ).toBe(false);
  });
});

describe("resolveFaqHarnessSourceHtmlFromCache", () => {
  it("uses full inventory when grid cache is answer-only", () => {
    const url = "https://example.com/cra-mail-in/";
    const html = resolveFaqHarnessSourceHtmlFromCache({
      row: {
        ...createEmptyOverviewRow(url),
        postContent: `<h2 id="answer">Answer</h2><p>Answer only.</p>`,
      },
      site: {
        id: "wp-1",
        siteUrl: "https://example.com",
      } as WordPressSite,
      sitemapSource: "posts",
      getInventoryMatchForUrl: () => ({
        row: {
          id: 1,
          url,
          fields: {
            title: "",
            meta: "",
            keyword: "",
            content: `<h2>Overview</h2><p>${"Full CRA article body. ".repeat(30)}</p>`,
          },
        },
        subtype: "post" as const,
      }),
    });
    expect(html).toContain("Full CRA article body.");
  });
});

describe("fetchLiveWordPressPostBodyForRow", () => {
  beforeEach(() => {
    getWordPressPostContent.mockReset();
  });

  it("returns live WordPress content for bound post id", async () => {
    getWordPressPostContent.mockResolvedValue({
      posts: [
        {
          id: 42,
          content: "<!-- wp:heading --><h2>Overview</h2><!-- /wp:heading -->",
        },
      ],
    });

    const site = {
      id: "wp-1",
      siteUrl: "https://example.com",
      username: "user",
      appPassword: "pass",
    } as WordPressSite;
    const row = {
      ...createEmptyOverviewRow("https://example.com/blog/cra-mail-in-policy/"),
      postId: 42,
      postType: "post",
    };

    const html = await fetchLiveWordPressPostBodyForRow(site, row);
    expect(html).toContain("Overview");
    expect(getWordPressPostContent).toHaveBeenCalledOnce();
  });
});
