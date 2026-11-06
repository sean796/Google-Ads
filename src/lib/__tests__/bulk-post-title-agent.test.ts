import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: vi.fn(),
}));

vi.mock("@/lib/optimization-settings-storage", () => ({
  getBlogModel: () => "test-blog-model",
}));

import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { resolveBulkWordPressPostTitle } from "@/lib/bulk/bulk-post-title-agent";

const mockCall = vi.mocked(callOpenRouterChatCompletion);

describe("resolveBulkWordPressPostTitle", () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it("uses the OpenRouter wordpress_title as the post title", async () => {
    mockCall.mockResolvedValue({ raw: null,
      content: JSON.stringify({
        wordpress_title: "How To Choose Between Hunter Douglas And Alta Shades",
      }),
    });

    const result = await resolveBulkWordPressPostTitle({
      apiKey: "test-key",
      focusKeyword: "hunter douglas vs alta",
      entity: "Mediterra, Naples, Florida",
      candidates: {
        researchSeoTitle: "Hunter Douglas vs. Alta Shades",
        csvTitle: "Hunter Douglas Vs Alta",
        blueprintTitle: "Hunter Douglas Versus Alta Shades",
      },
    });

    expect(result).toBe("How To Choose Between Hunter Douglas And Alta Shades");
    expect(mockCall).toHaveBeenCalledTimes(1);
    const call = mockCall.mock.calls[0]![0];
    expect(call.user).toContain("hunter douglas vs alta");
    expect(call.user).toContain("do not paste as the title");
    expect(call.user).toContain("PLACE / ENTITY");
    expect(call.user).toContain("Mediterra, Naples, Florida");
    expect(call.user).toContain("research_seo_title:");
    expect(call.user).toContain("csv_title:");
    expect(call.user).toContain("blueprint_title:");
    expect(call.system).toContain("WORDPRESS POST TITLE");
    expect(call.system).toContain("Keyword is the topic signal, not the title");
    expect(call.system).toContain("Blackout Blinds Mediterra Naples Florida: Blackout Blinds For Homes In Mediterra Naples Florida");
    expect(call.system).toContain("JSON contract");
    expect(call.system).not.toContain("Front-load naturally");
    expect(call.responseFormat).toEqual({
      type: "json_schema",
      json_schema: {
        name: "bulk_wordpress_post_title",
        strict: true,
        schema: expect.objectContaining({
          required: ["wordpress_title"],
        }),
      },
    });
  });

  it("fails when OpenRouter returns invalid JSON (single pass)", async () => {
    mockCall.mockResolvedValue({ raw: null, content: "{wordpress_title: Bad}" });

    await expect(
      resolveBulkWordPressPostTitle({
        apiKey: "test-key",
        focusKeyword: "blinds old naples florida",
        candidates: { csvTitle: "Blinds In Old Naples" },
      }),
    ).rejects.toThrow(/invalid JSON/i);
    expect(mockCall).toHaveBeenCalledTimes(1);
  });

  it("fails when wordpress_title is empty (single pass)", async () => {
    mockCall.mockResolvedValue({ raw: null, content: JSON.stringify({ wordpress_title: "   " }) });

    await expect(
      resolveBulkWordPressPostTitle({
        apiKey: "test-key",
        focusKeyword: "blinds old naples florida",
        candidates: { csvTitle: "Blinds In Old Naples" },
      }),
    ).rejects.toThrow(/missing wordpress_title/i);
    expect(mockCall).toHaveBeenCalledTimes(1);
  });

  it("returns the full OpenRouter title without truncating", async () => {
    const title =
      "What Alberta Physician Privatization Changes Mean For Clinics In 2026";
    mockCall.mockResolvedValue({ raw: null,
      content: JSON.stringify({ wordpress_title: title }),
    });

    const result = await resolveBulkWordPressPostTitle({
      apiKey: "test-key",
      focusKeyword: "Alberta physician privatization changes",
      candidates: {
        csvTitle: title,
        blueprintTitle: "Alberta Physician Privatization",
      },
    });

    expect(result).toBe(title);
  });

  it("requires an OpenRouter key for cloud models", async () => {
    await expect(
      resolveBulkWordPressPostTitle({
        apiKey: "",
        model: "google/gemini-2.5-flash",
        focusKeyword: "hunter douglas vs alta",
        candidates: { csvTitle: "Hunter Douglas Vs Alta" },
      }),
    ).rejects.toThrow(/OpenRouter API key/);
    expect(mockCall).not.toHaveBeenCalled();
  });

});
