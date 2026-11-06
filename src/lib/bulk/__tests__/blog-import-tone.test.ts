import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: vi.fn(),
}));

import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import {
  analyzeImportedBlogTone,
  buildDraftTextForToneAnalysis,
  formatImportedToneForHarnessPrompt,
  parseImportedToneJson,
} from "../blog-import-tone";

const mockCall = vi.mocked(callOpenRouterChatCompletion);

describe("buildDraftTextForToneAnalysis", () => {
  it("includes title and section bodies", () => {
    const text = buildDraftTextForToneAnalysis("Arctic Policy", [
      { h2: "Investment scale", body: "Billions in federal funding." },
      { h2: "Regional impact", body: "Territorial economies shift." },
    ]);
    expect(text).toContain("Arctic Policy");
    expect(text).toContain("Investment scale");
    expect(text).toContain("federal funding");
  });
});

describe("formatImportedToneForHarnessPrompt", () => {
  it("requires maintaining sophistication", () => {
    const block = formatImportedToneForHarnessPrompt({
      register: "policy-analytical",
      sophistication: "high",
      voice_traits: ["data-forward", "institutional"],
      sentence_rhythm: "Mixed medium and long sentences",
      vocabulary_notes: "Technical geopolitical terms",
      do_not: ["Do not dumb down"],
      sample_phrases: ["strategic sovereignty framework"],
    });
    expect(block).toMatch(/sophistication/i);
    expect(block).toMatch(/Do not dumb down/i);
    expect(block).toMatch(/policy-analytical/);
  });
});

describe("analyzeImportedBlogTone model JSON parsing", () => {
  beforeEach(() => {
    mockCall.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns null when the model returns malformed JSON", async () => {
    mockCall.mockResolvedValue({ raw: null, content: "not json" });
    await expect(
      analyzeImportedBlogTone({
        apiKey: "test-key",
        title: "Arctic Policy",
        sections: [{ h2: "Investment scale", body: "Billions in federal funding." }],
        model: "test-model",
      }),
    ).resolves.toBeNull();
  });

  it("returns null when the model tone has the wrong shape", async () => {
    mockCall.mockResolvedValue({
      raw: null,
      content: JSON.stringify({ register: 123 }),
    });
    await expect(
      analyzeImportedBlogTone({
        apiKey: "test-key",
        title: "Arctic Policy",
        sections: [{ h2: "Investment scale", body: "Billions in federal funding." }],
        model: "test-model",
      }),
    ).resolves.toBeNull();
  });

  it("returns a profile for valid model JSON", async () => {
    mockCall.mockResolvedValue({
      raw: null,
      content: JSON.stringify({
        register: "journalistic",
        sophistication: "high",
        voice_traits: ["neutral"],
        sentence_rhythm: "steady",
        vocabulary_notes: "precise",
        do_not: ["no hype"],
        sample_phrases: ["according to analysts"],
      }),
    });
    const profile = await analyzeImportedBlogTone({
      apiKey: "test-key",
      title: "Arctic Policy",
      sections: [{ h2: "Investment scale", body: "Billions in federal funding." }],
      model: "test-model",
    });
    expect(profile?.register).toBe("journalistic");
    expect(profile?.voice_traits).toEqual(["neutral"]);
    expect(profile?.do_not.some((d) => /dumb down/i.test(d))).toBe(true);
  });
});

describe("parseImportedToneJson", () => {
  it("round-trips profile", () => {
    const profile = {
      register: "journalistic",
      sophistication: "moderate-high",
      voice_traits: ["neutral"],
      sentence_rhythm: "steady",
      vocabulary_notes: "precise",
      do_not: ["no hype"],
      sample_phrases: ["according to analysts"],
    };
    const parsed = parseImportedToneJson(JSON.stringify(profile));
    expect(parsed?.register).toBe("journalistic");
    expect(parsed?.voice_traits).toEqual(["neutral"]);
  });
});
