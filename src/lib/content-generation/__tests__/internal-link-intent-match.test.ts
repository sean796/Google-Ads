import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  formatSuggestLinkInventory,
  matchInternalLinkQueriesToCatalog,
  parseSuggestLinkNumbers,
  pickSuggestLinkUrl,
} from "../internal-link-intent-match";

vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: vi.fn(),
}));

import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { DEEPSEEK_FLASH_MODEL } from "@/lib/global-agent-models";

const catalog = [
  {
    title: "Hunter Douglas",
    url: "https://lindseyblindsetc.com/hunter-douglas/",
    collection: "pages",
  },
  {
    title: "Energy Efficiency",
    url: "https://lindseyblindsetc.com/technology/energy-efficiency/",
    collection: "pages",
  },
  { title: "Home", url: "https://lindseyblindsetc.com/", collection: "pages" },
  {
    title: "PowerView Guide",
    url: "https://lindseyblindsetc.com/blog/powerview-guide/",
    collection: "posts",
  },
];

const queries = [
  { id: "1", query: "Hunter Douglas", anchor: "Hunter Douglas shades" },
  { id: "2", query: "Energy Efficiency", anchor: "energy efficiency" },
];

describe("parseSuggestLinkNumbers", () => {
  it("reads the plugin comma-separated page numbers", () => {
    expect(parseSuggestLinkNumbers("3,7,12,1,5")).toEqual([3, 7, 12, 1, 5]);
  });

  it("ignores 0 and leftover words", () => {
    expect(parseSuggestLinkNumbers("0")).toEqual([]);
    expect(parseSuggestLinkNumbers("1 2")).toEqual([1, 2]);
  });
});

describe("pickSuggestLinkUrl", () => {
  it("uses the first unused inventory number", () => {
    expect(pickSuggestLinkUrl([1, 2], catalog, new Set())).toBe(
      "https://lindseyblindsetc.com/hunter-douglas/",
    );
  });

  it("skips a used URL and takes the next ranked row", () => {
    const used = new Set(["https://lindseyblindsetc.com/hunter-douglas"]);
    expect(pickSuggestLinkUrl([1, 2], catalog, used)).toBe(
      "https://lindseyblindsetc.com/technology/energy-efficiency/",
    );
  });

  it("returns empty when ranked numbers are used or missing", () => {
    const used = new Set(["https://lindseyblindsetc.com/hunter-douglas"]);
    expect(pickSuggestLinkUrl([1], catalog, used)).toBe("");
    expect(pickSuggestLinkUrl([], catalog, new Set())).toBe("");
  });
});

describe("formatSuggestLinkInventory", () => {
  it("labels page and blog rows", () => {
    const list = formatSuggestLinkInventory(catalog);
    expect(list).toContain('[PAGE] "Hunter Douglas"');
    expect(list).toContain('[BLOG] "PowerView Guide"');
  });
});

describe("matchInternalLinkQueriesToCatalog", () => {
  beforeEach(() => {
    vi.mocked(callOpenRouterChatCompletion).mockReset();
  });

  it("maps Hunter Douglas and Energy Efficiency from plugin page numbers", async () => {
    vi.mocked(callOpenRouterChatCompletion)
      .mockResolvedValueOnce({ raw: {}, content: "1" })
      .mockResolvedValueOnce({ raw: {}, content: "2" });

    const out = await matchInternalLinkQueriesToCatalog({
      queries,
      catalog,
      apiKey: "test-key",
    });

    expect(out.get("1")).toBe("https://lindseyblindsetc.com/hunter-douglas/");
    expect(out.get("2")).toBe("https://lindseyblindsetc.com/technology/energy-efficiency/");
    expect(callOpenRouterChatCompletion).toHaveBeenCalledTimes(2);
    const call = vi.mocked(callOpenRouterChatCompletion).mock.calls[0]![0];
    expect(call.model).toBe(DEEPSEEK_FLASH_MODEL);
    expect(call.system).toContain("internal-linking assistant");
    expect(call.system).toContain("Example: 3,7,12,1,5");
    expect(call.system).toContain("Brand, product, service");
    expect(call.system).toContain("rank [PAGE] rows only");
    expect(call.system).toContain("Never return 0");
    expect(call.system).not.toContain("If no row in the allowed bucket is relevant, return 0");
    expect(call.user).toContain("Highlighted text: \"Hunter Douglas\"");
    expect(call.user).toContain('[PAGE] "Hunter Douglas"');
    expect(call.user).toContain("Never return 0");
    expect(call.maxTokens).toBe(1024);
  });

  it("sends the query bucket so page slots rank PAGE rows", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValue({ raw: {}, content: "1" });

    await matchInternalLinkQueriesToCatalog({
      queries: [{ id: "page-1", query: "CRA mail policy", anchor: "CRA mail policy", bucket: "PAGE" }],
      catalog,
      apiKey: "test-key",
    });

    const call = vi.mocked(callOpenRouterChatCompletion).mock.calls[0]![0];
    expect(call.user).toContain("Allowed bucket: [PAGE]");
    expect(call.user).toContain("Must return 1 to 5 inventory numbers");
  });
});
