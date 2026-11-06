import { describe, expect, it, vi, beforeEach } from "vitest";
import { detectMatureImageRequest } from "@/lib/image-generator/image-content-policy";

vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: vi.fn(),
}));

vi.mock("@/lib/optimization-settings-storage", () => ({
  getMetaModel: () => "google/gemini-2.5-flash-lite",
}));

describe("detectMatureImageRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false for empty prompt or missing api key", async () => {
    await expect(
      detectMatureImageRequest({ apiKey: "sk-test", userPrompt: "   " }),
    ).resolves.toBe(false);
    await expect(
      detectMatureImageRequest({ apiKey: "", userPrompt: "nude portrait" }),
    ).resolves.toBe(false);
  });

  it("returns true when model classifies mature content request", async () => {
    const { callOpenRouterChatCompletion } = await import(
      "@/lib/competitor-research/competitor-report-openrouter"
    );
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValue({
      raw: {},
      content: '{"matureContentRequested": true}',
    });

    await expect(
      detectMatureImageRequest({
        apiKey: "sk-test",
        userPrompt: "explicit adult scene",
      }),
    ).resolves.toBe(true);
    expect(callOpenRouterChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("mature"),
        user: "explicit adult scene",
      }),
    );
  });

  it("returns false on API failure", async () => {
    const { callOpenRouterChatCompletion } = await import(
      "@/lib/competitor-research/competitor-report-openrouter"
    );
    vi.mocked(callOpenRouterChatCompletion).mockRejectedValue(new Error("network"));

    await expect(
      detectMatureImageRequest({
        apiKey: "sk-test",
        userPrompt: "explicit adult scene",
      }),
    ).resolves.toBe(false);
  });
});
