import { describe, expect, it, vi, beforeEach } from "vitest";
import { writeBulkResearchedKeywordFocusToWordPress } from "../bulk-optimization-write-keyword-focus";
import type { WordPressSite } from "@/components/integrations/types";

const updateWordPressPostFields = vi.fn();

vi.mock("@/lib/wordpress-api", () => ({
  updateWordPressPostFields: (...args: unknown[]) => updateWordPressPostFields(...args),
}));

describe("writeBulkResearchedKeywordFocusToWordPress", () => {
  beforeEach(() => {
    updateWordPressPostFields.mockReset();
    updateWordPressPostFields.mockResolvedValue({ success: true });
  });

  it("writes keyword_focus for researched indices with valid post id", async () => {
    const prefetchedPostFieldsCache = new Map<number, Record<string, unknown>>();
    prefetchedPostFieldsCache.set(0, { keyword_focus: "researched kw" });

    const prefetchedPendingCache = new Map<
      number,
      { pending: Record<string, unknown>; primaryKeyword: string }
    >();
    prefetchedPendingCache.set(0, {
      primaryKeyword: "researched kw",
      pending: {
        existingPost: { id: 42, postTypeEndpoint: "posts", postTypeSubtype: "post" },
        resolved: { endpoint: "posts", subtype: "post" },
      },
    });

    await writeBulkResearchedKeywordFocusToWordPress({
      site: {
        id: "s1",
        siteUrl: "https://example.com",
        username: "u",
        appPassword: "p",
      } as unknown as WordPressSite,
      researchedIndices: [0],
      prefetchedPendingCache,
      prefetchedPostFieldsCache,
      muteToasts: true,
    });

    expect(updateWordPressPostFields).toHaveBeenCalledTimes(1);
    expect(updateWordPressPostFields).toHaveBeenCalledWith(
      "https://example.com",
      "u",
      "p",
      42,
      "post",
      "posts",
      { keyword_focus: "researched kw" },
    );
  });

  it("skips write when post id is missing", async () => {
    const prefetchedPostFieldsCache = new Map<number, Record<string, unknown>>();
    prefetchedPostFieldsCache.set(0, { keyword_focus: "kw" });

    const prefetchedPendingCache = new Map<
      number,
      { pending: Record<string, unknown>; primaryKeyword: string }
    >();
    prefetchedPendingCache.set(0, {
      primaryKeyword: "kw",
      pending: { existingPost: { id: 0 } },
    });

    await writeBulkResearchedKeywordFocusToWordPress({
      site: {
        id: "s1",
        siteUrl: "https://example.com",
        username: "u",
        appPassword: "p",
      } as unknown as WordPressSite,
      researchedIndices: [0],
      prefetchedPendingCache,
      prefetchedPostFieldsCache,
    });

    expect(updateWordPressPostFields).not.toHaveBeenCalled();
  });
});
