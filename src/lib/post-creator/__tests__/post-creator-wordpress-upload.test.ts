import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";

const { createWordPressPost } = vi.hoisted(() => ({
  createWordPressPost: vi.fn(async () => ({
    success: true,
    postId: 99,
    link: "https://example.com/blog/test/",
  })),
}));

vi.mock("@/lib/wordpress-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wordpress-api")>();
  return {
    ...actual,
    createWordPressPost,
    updateWordPressPost: vi.fn(async () => ({ success: true })),
    updateWordPressPostMeta: vi.fn(async () => ({ success: true })),
  };
});

vi.mock("@/lib/wordpress-api/acf-discovery", () => ({
  discoverACFFieldMapping: vi.fn(async () => ({})),
  getACFFieldsForPost: vi.fn(async () => ({ success: true, fields: {} })),
  resolveAcfFieldsForMapping: vi.fn(async (_site: unknown, existing: Record<string, unknown>) => existing),
}));

vi.mock("@/lib/content-generation/harness-upload-prep", () => ({
  prepareHarnessContentForUpload: vi.fn(async ({ markdownContent }: { markdownContent: string }) => markdownContent),
}));

vi.mock("@/lib/content-generation/bulk-acf-seo-bundle", () => ({
  buildPostMarkdownAcfSeoFaqBundle: vi.fn(async () => ({
    seoResearchJson: "{}",
    faqEntries: [],
    faqForAcf: "",
  })),
  patchPostLinkInSeoResearchJson: vi.fn((json: string) => json),
  resolveFaqEntriesForVisibleTable: vi.fn(() => []),
}));

vi.mock("@/lib/content-generation/apply-bulk-meta-from-seo-json", () => ({
  buildOptimizedMetaFromKeywordResearch: vi.fn(() => ({
    rank_math_title: "t",
    rank_math_description: "d",
    rank_math_focus_keyword: "k",
    rank_math_canonical_url: "https://example.com/blog/test/",
  })),
}));

vi.mock("@/lib/content-generation/content-sanitizer", () => ({
  sanitizeContentForUpload: vi.fn((html: string) => html),
}));

vi.mock("@/lib/overview/overview-blog-faq-append", () => ({
  appendVisibleFaqTableWithIntro: vi.fn(async () => null),
  FLO_FAQ_CLASS: "flo-faq",
  stripTrailingFaqSection: vi.fn((html: string) => html),
}));

vi.mock("@/lib/seo-slug-generator", () => ({
  generateSEOSlug: vi.fn(async () => "test-slug"),
}));

vi.mock("@/lib/wordpress-api/meta", () => ({
  updateOverviewSeoItem: vi.fn(async () => ({ ok: true, postId: 99 })),
}));

vi.mock("@/lib/content-generation/acf-field-mapper", () => ({
  NEO_PULSE_DEFAULT_FIELD_MAPPING: {
    dateModifier: "date_modifier",
    faq: "faq",
    metaDescription: "meta_description",
    promptModifier: "prompt_modifier",
    extraText: "seo_extra_text",
    extraImage: "seo_extra_image",
    origin: "origin",
    keywordFocus: "keyword_focus",
    seoResearch: "seo_research",
    seoTitle: "seo_title",
  },
  discoverACFFieldMapping: vi.fn(async () => ({})),
  fallbackFieldMapping: vi.fn(() => ({
    date_modifier: "date_modifier",
    keyword_focus: "keyword_focus",
    seo_research: "seo_research",
    faq: "faq",
    origin: "origin",
  })),
}));

vi.mock("@/lib/content-generation/apply-meta-acf-payload", () => ({
  buildAcfPayload: vi.fn(() => ({})),
}));

vi.mock("@/lib/markdown-to-html", () => ({
  generateExcerpt: vi.fn(() => "excerpt"),
}));

vi.mock("@/lib/openrouter-api-key-resolve", () => ({
  resolveOpenRouterApiKeyForHarness: vi.fn(async () => "test-key"),
}));

import { uploadPostCreatorRowToWordPress } from "@/lib/post-creator/post-creator-wordpress-upload";

describe("uploadPostCreatorRowToWordPress", () => {
  beforeEach(() => {
    createWordPressPost.mockClear();
  });

  it("passes posts as the REST collection endpoint for standard blog rows", async () => {
    const site: WordPressSite = {
      id: "site-1",
      name: "Example",
      siteUrl: "https://example.com",
      username: "user",
      appPassword: "pass",
    };
    const row: CSVRow = {
      keyword: "battery shades",
      title: "Battery Powered Shades",
    };

    await uploadPostCreatorRowToWordPress({
      site,
      row,
      markdownContent: "# Hello",
      blueprintAgents: [],
      wordPressPosts: [],
      openRouterApiKey: "test-key",
    });

    expect(createWordPressPost).toHaveBeenCalledTimes(1);
    const args = createWordPressPost.mock.calls[0] as unknown[];
    expect(args[11]).toBe("post");
    expect(args[12]).toBe("posts");
  });
});
