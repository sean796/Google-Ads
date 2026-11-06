import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: vi.fn(),
}));

import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { AI_BLOCKED_TOPIC_LABELS, aiRejectBrandOrBlockedTexts } from "../content-brand-ai-gate";

describe("AI_BLOCKED_TOPIC_LABELS", () => {
  it("includes Bali Blinds for the AI gate", () => {
    expect(AI_BLOCKED_TOPIC_LABELS.some((t) => /bali/i.test(t))).toBe(true);
  });
});

describe("aiRejectBrandOrBlockedTexts", () => {
  beforeEach(() => {
    vi.mocked(callOpenRouterChatCompletion).mockReset();
  });

  it("throws on malformed brand gate JSON", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValue({
      raw: {},
      content: "{not valid json",
    });

    await expect(
      aiRejectBrandOrBlockedTexts({
        apiKey: "test-key",
        model: "test-model",
        companyName: "Blind Magic",
        candidates: ["custom blinds edmonton"],
        kind: "keyword",
      }),
    ).rejects.toThrow("Invalid brand gate JSON");
  });
});
