import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/openrouter-app-api", () => ({
  postOpenRouterAppChat: vi.fn(),
}));

vi.mock("@/lib/optimization-settings-storage", () => ({
  getResearchModel: () => "test-model",
}));

vi.mock("@/lib/content-brand-ai-gate", () => ({
  aiFilterAllowedBrandTexts: vi.fn(async ({ candidates }: { candidates: string[] }) => candidates),
}));

import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";
import {
  buildLowHangingKeywordsResponseFormat,
  selectPromptBulkLowHangingKeywords,
} from "@/lib/bulk/prompt-bulk-kw-research-agent";

const mockCall = vi.mocked(postOpenRouterAppChat);

describe("selectPromptBulkLowHangingKeywords", () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it("requests a capped json schema and exactly numberOfBlogs keywords", async () => {
    mockCall.mockResolvedValue({
      raw: {},
      content: JSON.stringify({ keywords: ["roman shades", "cellular shades"] }),
    });

    const result = await selectPromptBulkLowHangingKeywords({
      apiKey: "test-key",
      keywordsJsonText: JSON.stringify({ gsc: ["roman shades cost"], semrush: [] }),
      numberOfBlogs: 2,
    });

    expect(result).toEqual(["roman shades", "cellular shades"]);
    expect(mockCall).toHaveBeenCalledTimes(1);
    const call = mockCall.mock.calls[0]![0];
    expect(call.maxTokens).toBe(4096);
    expect(call.responseFormat).toEqual(buildLowHangingKeywordsResponseFormat(2));
    expect(call.system).toContain("Never dump the product catalog");
    expect(call.system).toContain("JSON contract");
    expect(JSON.parse(call.user as string).numberOfBlogs).toBe(2);
  });

  it("fails fast on truncated JSON instead of repairing", async () => {
    mockCall.mockResolvedValue({
      raw: {},
      content: '{"keywords": ["hunter douglas", "roman shades", "ban',
    });

    await expect(
      selectPromptBulkLowHangingKeywords({
        apiKey: "test-key",
        keywordsJsonText: JSON.stringify({ gsc: ["hunter douglas"], semrush: [] }),
        numberOfBlogs: 2,
      }),
    ).rejects.toThrow(/invalid JSON/);
  });

  it("caps schema maxItems to the requested count", () => {
    const format = buildLowHangingKeywordsResponseFormat(2);
    const schema = format.json_schema.schema as {
      properties: { keywords: { maxItems: number } };
    };
    expect(schema.properties.keywords.maxItems).toBe(2);
  });
});
