import { describe, expect, it, vi, beforeEach } from "vitest";
import { rewriteBlogPassageSection } from "@/lib/overview/overview-blog-passage-sections";

vi.mock("@/lib/openrouter-agent-category-api", () => ({
  callAgentCategoryOpenRouterChat: vi.fn(),
}));

import { callAgentCategoryOpenRouterChat } from "@/lib/openrouter-agent-category-api";

beforeEach(() => {
  vi.mocked(callAgentCategoryOpenRouterChat).mockReset();
});

const section = {
  id: "passage-h2-0",
  index: 0,
  h2OpenTag: "<h2>",
  title: "Legacy Heading",
  bodyHtml: "<p>Legacy body copy about the section topic.</p>",
};

describe("rewriteBlogPassageSection malformed model output", () => {
  it("rejects invalid JSON with the passage section label", async () => {
    vi.mocked(callAgentCategoryOpenRouterChat).mockResolvedValue({
      raw: null,
      content: "not json at all",
    });

    await expect(
      rewriteBlogPassageSection({
        mode: "header",
        section,
        siblingTitles: [],
        articleTitle: "Article Title",
        focusKeyword: "focus keyword",
      }),
    ).rejects.toThrow(/Invalid passage section JSON:/);
  });

  it("rejects valid JSON with the wrong shape with the passage section label", async () => {
    vi.mocked(callAgentCategoryOpenRouterChat).mockResolvedValue({
      raw: null,
      content: JSON.stringify({ title: 42 }),
    });

    await expect(
      rewriteBlogPassageSection({
        mode: "header",
        section,
        siblingTitles: [],
        articleTitle: "Article Title",
        focusKeyword: "focus keyword",
      }),
    ).rejects.toThrow(/Invalid passage section JSON:/);
  });
});
