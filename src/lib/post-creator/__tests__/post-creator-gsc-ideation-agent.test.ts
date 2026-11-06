import { afterEach, describe, expect, it, vi } from "vitest";
import { runPostCreatorGscIdeationAgent } from "@/lib/post-creator/post-creator-gsc-ideation-agent";

const SAMPLE_BUCKET = JSON.stringify({
  source: "posts",
  posts: [
    {
      slug: "national-seo-canada",
      title: "National SEO Strategy: Expanding Your Reach Across Canada",
      link: "https://neodigital.ca/blog/national-seo-canada/",
    },
  ],
});

const SAMPLE_KW = JSON.stringify({
  gsc: ["elementor help", "wordpress maintenance", "scaling digital brands"],
  semrush: [],
});

vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: vi.fn(),
}));

vi.mock("@/lib/optimization-settings-storage", () => ({
  getResearchModel: () => "test-model",
}));

import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";

describe("post-creator GSC ideation agent (single pass)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses exactly one OpenRouter call on the happy path", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValueOnce({
      raw: {},
      content: JSON.stringify({
        rows: [
          { keyword: "elementor help", title: "When to Hire Elementor Experts", entity: "" },
          { keyword: "wordpress maintenance", title: "WordPress Maintenance for Enterprise Sites", entity: "" },
          { keyword: "scaling digital brands", title: "Scaling a Digital Brand Without Losing Visibility", entity: "" },
        ],
      }),
    });

    const rows = await runPostCreatorGscIdeationAgent({
      apiKey: "test-key",
      siteName: "Neo Digital",
      postCount: 3,
      bucketJson: SAMPLE_BUCKET,
      siteKwJsonText: SAMPLE_KW,
    });

    expect(callOpenRouterChatCompletion).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.keyword).toBe("elementor help");
  });

  it("puts SITE_INVENTORY_CACHE before SITE_KW_JSON in the user prompt", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValueOnce({
      raw: {},
      content: JSON.stringify({
        rows: [{ keyword: "elementor help", title: "Elementor Experts Guide", entity: "" }],
      }),
    });

    await runPostCreatorGscIdeationAgent({
      apiKey: "test-key",
      siteName: "Neo Digital",
      postCount: 1,
      bucketJson: SAMPLE_BUCKET,
      siteKwJsonText: SAMPLE_KW,
    });

    const call = vi.mocked(callOpenRouterChatCompletion).mock.calls[0]?.[0];
    const user = call?.user ?? "";
    const inventoryIdx = user.indexOf("SITE_INVENTORY_CACHE");
    const kwIdx = user.indexOf("SITE_KW_JSON");
    expect(inventoryIdx).toBeGreaterThan(-1);
    expect(kwIdx).toBeGreaterThan(inventoryIdx);
    expect(user).toContain("national-seo-canada");
  });

  it("throws on malformed JSON instead of returning empty rows", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValueOnce({
      raw: {},
      content: "{not valid json",
    });

    await expect(
      runPostCreatorGscIdeationAgent({
        apiKey: "test-key",
        siteName: "Neo Digital",
        postCount: 1,
        bucketJson: SAMPLE_BUCKET,
        siteKwJsonText: SAMPLE_KW,
      }),
    ).rejects.toThrow("Invalid post creator ideation rows JSON");

    expect(callOpenRouterChatCompletion).toHaveBeenCalledTimes(1);
  });

  it("does not retry when OpenRouter returns too few rows", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValueOnce({
      raw: {},
      content: JSON.stringify({
        rows: [{ keyword: "elementor help", title: "Elementor Experts Guide", entity: "" }],
      }),
    });

    await expect(
      runPostCreatorGscIdeationAgent({
        apiKey: "test-key",
        siteName: "Neo Digital",
        postCount: 3,
        bucketJson: SAMPLE_BUCKET,
        siteKwJsonText: SAMPLE_KW,
      }),
    ).rejects.toThrow(/OpenRouter returned 1\/3 blog ideas/i);

    expect(callOpenRouterChatCompletion).toHaveBeenCalledTimes(1);
  });
});
