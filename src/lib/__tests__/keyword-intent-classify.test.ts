import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({ loadApiKey: () => "test-key" }));
vi.mock("@/lib/optimization-settings-storage", () => ({
  getResearchModel: () => "test/research-model",
}));
vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: vi.fn(),
}));

import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { classifyKeywordIntentWithAi } from "../keyword-intent-classify";

const mockChat = vi.mocked(callOpenRouterChatCompletion);

beforeEach(() => {
  mockChat.mockReset();
});

describe("classifyKeywordIntentWithAi", () => {
  it("returns one validated result per keyword", async () => {
    mockChat.mockResolvedValue({
      raw: null,
      content: JSON.stringify({
        results: [
          { keyword: "buy blinds online", intent: "transactional", probability: 0.92 },
          { keyword: "how to measure windows", intent: "informational", probability: 0.88 },
        ],
      }),
    });

    const out = await classifyKeywordIntentWithAi(["buy blinds online", "how to measure windows"]);
    expect(out).toEqual([
      { keyword: "buy blinds online", intent: "transactional", probability: 0.92 },
      { keyword: "how to measure windows", intent: "informational", probability: 0.88 },
    ]);
  });

  it("throws visibly on malformed JSON instead of guessing", async () => {
    mockChat.mockResolvedValue({ raw: null, content: "not json at all" });
    await expect(classifyKeywordIntentWithAi(["buy blinds"])).rejects.toThrow(/invalid JSON/i);
  });

  it("throws visibly when the model omits a keyword", async () => {
    mockChat.mockResolvedValue({
      raw: null,
      content: JSON.stringify({
        results: [{ keyword: "buy blinds", intent: "transactional", probability: 0.9 }],
      }),
    });
    await expect(classifyKeywordIntentWithAi(["buy blinds", "window repair"])).rejects.toThrow(
      /omitted keyword/i,
    );
  });

  it("throws visibly on an unknown intent label", async () => {
    mockChat.mockResolvedValue({
      raw: null,
      content: JSON.stringify({
        results: [{ keyword: "buy blinds", intent: "shopping", probability: 0.9 }],
      }),
    });
    await expect(classifyKeywordIntentWithAi(["buy blinds"])).rejects.toThrow();
  });

  it("returns empty for empty input without calling the model", async () => {
    await expect(classifyKeywordIntentWithAi(["", "  "])).resolves.toEqual([]);
    expect(mockChat).not.toHaveBeenCalled();
  });
});
