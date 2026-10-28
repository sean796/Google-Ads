import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SeoContentBriefV1 } from "@/lib/overview-seo-content-brief";
import {
  collectLiveLinksFromBrief,
  filterOwnSiteLiveLinks,
  normalizeClassifiedAuthorityLinks,
  classifyLlmAuditAuthorityLinksOpenRouter,
  resolveLlmAuditAuthorityLinksForChecklist,
} from "@/lib/llm-audit/llm-audit-authority-links";
import {
  injectLlmAuditAuthorityLinksIntoChecklist,
} from "@/lib/bulk/modifier-external-links";
import { buildRowExplicitExternalAllowlist } from "@/lib/content-generation/external-link-placeholders";

vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: vi.fn(),
}));

vi.mock("@/lib/openrouter-api-key-resolve", () => ({
  resolveOpenRouterApiKeyForHarness: vi.fn(async () => "test-key"),
}));

import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";

function mockBrief(liveLinks: string[]): SeoContentBriefV1 {
  return {
    focusKeyword: "solar panels edmonton",
    llmAudit: {
      platforms: [
        {
          platform: "chatgpt",
          status: "ok",
          liveLinks,
          annotations: [],
        },
        {
          platform: "gemini",
          status: "ok",
          liveLinks: liveLinks.slice(0, 1),
          annotations: [{ url: "https://www.weather.gc.ca/", label: "weather" }],
        },
        {
          platform: "claude",
          status: "error",
          liveLinks: ["https://ignored.example/"],
          annotations: [],
        },
      ],
    },
  } as SeoContentBriefV1;
}

describe("collectLiveLinksFromBrief", () => {
  it("dedupes liveLinks and annotation URLs across ok platforms", () => {
    const urls = collectLiveLinksFromBrief(
      mockBrief(["https://www.edmonton.ca/", "https://competitor-solar.example/"]),
    );
    expect(urls).toContain("https://www.edmonton.ca/");
    expect(urls).toContain("https://www.weather.gc.ca/");
    expect(urls.filter((u) => u.includes("edmonton.ca"))).toHaveLength(1);
    expect(urls.some((u) => u.includes("ignored.example"))).toBe(false);
  });

  it("returns empty when brief has no llmAudit", () => {
    expect(collectLiveLinksFromBrief(null)).toEqual([]);
    expect(collectLiveLinksFromBrief({ focusKeyword: "x" } as SeoContentBriefV1)).toEqual([]);
  });
});

describe("filterOwnSiteLiveLinks", () => {
  it("strips client domain before classification", () => {
    const urls = filterOwnSiteLiveLinks(
      ["https://ridgelinesolar.ca/about", "https://www.edmonton.ca/"],
      "https://www.ridgelinesolar.ca",
    );
    expect(urls).toEqual(["https://www.edmonton.ca/"]);
  });
});

describe("normalizeClassifiedAuthorityLinks", () => {
  it("includes municipal authority and excludes SMB competitor", () => {
    const inputUrls = [
      "https://www.edmonton.ca/residential/solar",
      "https://other-solar-installer.example/",
    ];
    const out = normalizeClassifiedAuthorityLinks(
      {
        links: [
          {
            url: "https://www.edmonton.ca/residential/solar",
            category: "municipal",
            include: true,
            anchorText: "City of Edmonton",
            reason: "municipal domain",
          },
          {
            url: "https://other-solar-installer.example/",
            category: "smb_competitor",
            include: false,
            anchorText: "Other Solar",
            reason: "competitor",
          },
        ],
      },
      inputUrls,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.url).toBe("https://www.edmonton.ca/residential/solar");
    expect(out[0]?.category).toBe("municipal");
  });
});

describe("classifyLlmAuditAuthorityLinksOpenRouter", () => {
  beforeEach(() => {
    vi.mocked(callOpenRouterChatCompletion).mockReset();
  });

  it("parses classifier mock response", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValue({
      content: JSON.stringify({
        links: [
          {
            url: "https://www.edmonton.ca/",
            category: "municipal",
            include: true,
            anchorText: "Edmonton city site",
            reason: "municipal TLD path",
          },
        ],
      }),
    } as never);

    const out = await classifyLlmAuditAuthorityLinksOpenRouter({
      urls: ["https://www.edmonton.ca/"],
      siteUrl: "https://ridgelinesolar.ca",
      companyName: "Ridgeline Solar",
      location: "Edmonton, AB",
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.category).toBe("municipal");
  });
});

describe("injectLlmAuditAuthorityLinksIntoChecklist", () => {
  it("attaches [LLM_AUDIT_AUTHORITY_LINK] to an existing topical item", () => {
    const checklist = ["1. CRA Online Mail for Individuals And Businesses [STRUCTURE]: 2 paragraphs."];
    const out = injectLlmAuditAuthorityLinksIntoChecklist(checklist, [
      { url: "https://www.edmonton.ca/", anchorText: "City of Edmonton", category: "municipal" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("CRA Online Mail for Individuals And Businesses");
    expect(out[0]).toContain("[LLM_AUDIT_AUTHORITY_LINK]");
    expect(out[0]).toContain("https://www.edmonton.ca/");
  });

  it("skips duplicate URL already in checklist", () => {
    const checklist = ["cite https://www.edmonton.ca/ in intro"];
    const out = injectLlmAuditAuthorityLinksIntoChecklist(checklist, [
      { url: "https://www.edmonton.ca/", anchorText: "City of Edmonton" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).not.toMatch(/\[LLM_AUDIT_AUTHORITY_LINK\][\s\S]*\[LLM_AUDIT_AUTHORITY_LINK\]/);
  });

  it("does not create a new item when the checklist is empty", () => {
    expect(
      injectLlmAuditAuthorityLinksIntoChecklist([], [
        { url: "https://www.edmonton.ca/", anchorText: "City of Edmonton" },
      ]),
    ).toEqual([]);
  });
});

describe("resolveLlmAuditAuthorityLinksForChecklist", () => {
  beforeEach(() => {
    vi.mocked(callOpenRouterChatCompletion).mockReset();
  });

  it("propagates classifier failures", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockRejectedValue(new Error("OpenRouter timeout"));

    await expect(
      resolveLlmAuditAuthorityLinksForChecklist({
        brief: mockBrief(["https://www.edmonton.ca/"]),
        siteUrl: "https://ridgelinesolar.ca",
        companyName: "Ridgeline Solar",
      }),
    ).rejects.toThrow("OpenRouter timeout");
  });

  it("returns no links on invalid JSON (fail-open)", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValue({
      content: '{ "links": [ { ] "url": "https://www.edmonton.ca/" } ] }',
    } as never);

    const out = await classifyLlmAuditAuthorityLinksOpenRouter({
      urls: ["https://www.edmonton.ca/"],
      siteUrl: "https://ridgelinesolar.ca",
      onClassifierJsonFailure: () => {},
    });
    expect(out).toEqual([]);
  });

  it("returns no links on valid JSON with wrong shape (fail-open)", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValue({
      content: '{"links":"not-an-array"}',
    } as never);

    const failures: string[] = [];
    const out = await classifyLlmAuditAuthorityLinksOpenRouter({
      urls: ["https://www.edmonton.ca/"],
      siteUrl: "https://ridgelinesolar.ca",
      onClassifierJsonFailure: (detail) => failures.push(detail.error),
    });
    expect(out).toEqual([]);
    expect(failures.length).toBeGreaterThan(0);
  });
});

describe("buildRowExplicitExternalAllowlist with llm audit authority", () => {
  it("merges llm audit authority links into allowlist pairs", () => {
    const pairs = buildRowExplicitExternalAllowlist({
      llmAuditAuthorityLinks: [
        { url: "https://www.edmonton.ca/", anchorText: "City of Edmonton" },
      ],
    });
    expect(pairs).toEqual([
      { url: "https://www.edmonton.ca/", anchor: "City of Edmonton" },
    ]);
  });
});
