import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  ensureSeoResearchBriefForOptimize,
  resolveOptimizeFocusKeyword,
} from "@/lib/content-optimization/ensure-seo-research-brief-for-optimize";

vi.mock("@/lib/llm-audit/fetch-merged-seo-content-brief", () => ({
  fetchMergedSeoContentBriefLive: vi.fn(),
}));

import { fetchMergedSeoContentBriefLive } from "@/lib/llm-audit/fetch-merged-seo-content-brief";

const site = {
  id: "s1",
  name: "Test",
  siteUrl: "https://example.com",
  username: "u",
  appPassword: "p",
  connectedAt: 0,
};

beforeEach(() => {
  vi.mocked(fetchMergedSeoContentBriefLive).mockReset();
});

describe("resolveOptimizeFocusKeyword", () => {
  it("falls back to URL slug when keyword_focus is empty", () => {
    expect(
      resolveOptimizeFocusKeyword({
        url: "https://ridgelinesolar.ca/solar-panel-install-cost/",
        acfFields: {},
      }),
    ).toBe("solar panel install cost");
  });
});

describe("ensureSeoResearchBriefForOptimize", () => {
  it("returns stored brief without calling SERP when substantive", async () => {
    const brief = '{"focusKeyword":"solar","dataforseo":{}}';
    const out = await ensureSeoResearchBriefForOptimize({
      url: "https://example.com/post/",
      site,
      acfFields: { keyword_focus: "solar", seo_research: brief },
      acfContext: { keywordFocus: "solar", seoResearch: brief },
      focusKeyword: "solar",
      muteToasts: true,
    });
    expect(out.seoResearchRaw).toContain("focusKeyword");
    expect(fetchMergedSeoContentBriefLive).not.toHaveBeenCalled();
  });

  it("fetches live SERP when forceNewResearch is true even if ACF already has a brief", async () => {
    const brief = '{"focusKeyword":"solar","dataforseo":{}}';
    vi.mocked(fetchMergedSeoContentBriefLive).mockResolvedValueOnce({
      focusKeyword: "solar",
      pageUrl: "https://example.com/post/",
    } as never);

    await ensureSeoResearchBriefForOptimize({
      url: "https://example.com/post/",
      site,
      acfFields: { keyword_focus: "solar", seo_research: brief },
      acfContext: { keywordFocus: "solar", seoResearch: brief },
      focusKeyword: "solar",
      muteToasts: true,
      forceNewResearch: true,
    });

    expect(fetchMergedSeoContentBriefLive).toHaveBeenCalledTimes(1);
  });

  it("fetches live SERP brief when ACF brief is missing", async () => {
    vi.mocked(fetchMergedSeoContentBriefLive).mockResolvedValueOnce({
      focusKeyword: "solar panel install cost",
      pageUrl: "https://example.com/solar-panel-install-cost/",
    } as never);

    const out = await ensureSeoResearchBriefForOptimize({
      url: "https://example.com/solar-panel-install-cost/",
      site,
      acfFields: { keyword_focus: "solar panel install cost" },
      acfContext: { keywordFocus: "solar panel install cost" },
      focusKeyword: "solar panel install cost",
      muteToasts: true,
    });

    expect(fetchMergedSeoContentBriefLive).toHaveBeenCalledTimes(1);
    expect(fetchMergedSeoContentBriefLive).toHaveBeenCalledWith(
      expect.objectContaining({ requireSerpDump: false }),
    );
    expect(out.seoResearchRaw).toContain("solar panel install cost");
    expect(out.acfFields.seo_research).toContain("focusKeyword");
  });
});
