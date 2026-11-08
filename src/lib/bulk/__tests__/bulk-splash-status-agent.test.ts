import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: vi.fn(),
}));

vi.mock("@/lib/openrouter-api-key-resolve", () => ({
  resolveOpenRouterApiKeyForHarness: vi.fn(async () => "test-openrouter-key"),
}));

vi.mock("@/lib/optimization-settings-storage", () => ({
  getMetaModel: vi.fn(() => "test-meta-model"),
}));

import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { generateBulkSplashStatus } from "../bulk-splash-status-agent";

const mockCall = vi.mocked(callOpenRouterChatCompletion);

describe("generateBulkSplashStatus", () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it("returns the AI status line and graphic kind for a pipeline step", async () => {
    mockCall.mockResolvedValue({
      raw: null,
      content: JSON.stringify({
        status: "Cross-checking facts before we write",
        visual: "audit",
      }),
    });

    await expect(
      generateBulkSplashStatus({
        step: "Planning factual verification queries",
        articleTitle: "Rental Apartment Blinds That Install Without Drilling Holes",
        keyword: "rental apartment blinds",
        siteName: "Blind Magic",
      }),
    ).resolves.toEqual({
      status: "Cross-checking facts before we write",
      visual: "audit",
    });
  });

  it("sends the step and article context to the model", async () => {
    mockCall.mockResolvedValue({
      raw: null,
      content: JSON.stringify({
        status: "Scouring Google for rental blind intel",
        visual: "research",
      }),
    });

    await generateBulkSplashStatus({
      step: "Fan-out SERP",
      keyword: "rental apartment blinds",
    });

    const call = mockCall.mock.calls[0]?.[0];
    expect(call?.model).toBe("test-meta-model");
    expect(call?.user).toContain("Fan-out SERP");
    expect(call?.user).toContain("rental apartment blinds");
    expect(call?.system).toMatch(/Gemini/i);
    expect(call?.system).toContain('"meta"');
    expect(call?.system).toContain('"image"');
    expect(call?.system).toContain('"writing"');
  });

  it("throws when the model returns an unknown graphic kind", async () => {
    mockCall.mockResolvedValue({
      raw: null,
      content: JSON.stringify({ status: "Writing your blog post", visual: "banana" }),
    });

    await expect(
      generateBulkSplashStatus({ step: "Generating checklist..." }),
    ).rejects.toThrow(/bulk splash status/i);
  });

  it("throws when the model returns the wrong shape", async () => {
    mockCall.mockResolvedValue({
      raw: null,
      content: JSON.stringify({ status: 42 }),
    });

    await expect(
      generateBulkSplashStatus({ step: "Fan-out SERP" }),
    ).rejects.toThrow(/bulk splash status/i);
  });

  it("throws when the model returns a status that is too long", async () => {
    mockCall.mockResolvedValue({
      raw: null,
      content: JSON.stringify({ status: "x".repeat(81), visual: "writing" }),
    });

    await expect(
      generateBulkSplashStatus({ step: "Fan-out SERP" }),
    ).rejects.toThrow();
  });

  it("throws on an empty step without calling the model", async () => {
    await expect(generateBulkSplashStatus({ step: "   " })).rejects.toThrow(
      /needs a pipeline step/i,
    );
    expect(mockCall).not.toHaveBeenCalled();
  });
});
