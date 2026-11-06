import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AgentConfig } from "@/types/agent-config";
import { prepareHarnessContentForUpload } from "../harness-upload-prep";

vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: vi.fn(),
}));

import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";

beforeEach(() => {
  vi.mocked(callOpenRouterChatCompletion).mockReset();
});

const BODY_AGENTS: AgentConfig[] = [
  {
    id: "section-1",
    step: 1,
    title: "Sliding Glass Door Blinds: Your Options",
    description: "Options section",
    features: [],
  },
  {
    id: "section-2",
    step: 2,
    title: "Exploring Styles for Sliding Doors",
    description: "Styles section",
    features: [],
  },
];

const OVERVIEW_AGENT: AgentConfig = {
  id: "ai-overview-summary",
  step: 0,
  title: "Overview",
  description: "Overview",
  features: [],
};

function countBodyH2(html: string): number {
  return (html.match(/<h2[^>]+id="(?!overview)[^"]+"/gi) ?? []).length;
}

describe("prepareHarnessContentForUpload", () => {
  it("aligns Overview scroll links to injected body H2 ids without OpenRouter", async () => {
    const markdown = `## Overview

Lead paragraph about blinds for sliding glass doors.

- **Options:** Review several [[SCROLL:#sliding-glass-door-blinds-your-options|blind options]] for your home.
- **Styles:** Explore [[SCROLL:#exploring-styles-for-sliding-doors|popular styles]] in this guide.

## Sliding Glass Door Blinds: Your Options

Body content about vertical blinds and panel tracks.

## Exploring Styles for Sliding Doors

More body content about roller shades.
`;

    const html = await prepareHarnessContentForUpload({
      markdownContent: markdown,
      blueprintAgents: [OVERVIEW_AGENT, ...BODY_AGENTS],
      keyword: "sliding glass door blinds",
      articleTitle: "Sliding Glass Door Blinds Guide",
    });

    expect(html).toContain('href="#sliding-glass-door-blinds-your-options"');
    expect(html).toContain('href="#exploring-styles-for-sliding-doors"');
    expect(html).not.toContain("[[SCROLL:");
    expect(html).not.toContain("].");
    expect(countBodyH2(html)).toBe(2);
  });

  it("does not duplicate body sections (server-style overview without flo-overview wrapper)", async () => {
    const markdown = `## Overview

Lead about smart blinds.

- **What Are Smart Blinds?:** Learn [[SCROLL:#what-are-smart-blinds|smart blind basics]] in this guide.
- **Benefits:** Review [[SCROLL:#benefits-of-smart-blinds-for-your-home|key home benefits]] in this section.

## What Are Smart Blinds?

Body one paragraph.

## Benefits of Smart Blinds for Your Home

Body two paragraph.
`;

    const html = await prepareHarnessContentForUpload({
      markdownContent: markdown,
      blueprintAgents: [
        OVERVIEW_AGENT,
        { id: "section-1", step: 1, title: "What Are Smart Blinds?", description: "", features: [] },
        {
          id: "section-2",
          step: 2,
          title: "Benefits of Smart Blinds for Your Home",
          description: "",
          features: [],
        },
      ],
    });

    expect(html).toContain('href="#what-are-smart-blinds"');
    expect(html).toContain('href="#benefits-of-smart-blinds-for-your-home"');
    expect(countBodyH2(html)).toBe(2);
    expect(html.match(/Body one paragraph/g)?.length).toBe(1);
    expect(html.match(/Body two paragraph/g)?.length).toBe(1);
  });

  it("ships when Overview bullets are missing", async () => {
    const markdown = `## Overview

Lead paragraph only.

## Sliding Glass Door Blinds: Your Options

Body section.
`;

    const html = await prepareHarnessContentForUpload({
      markdownContent: markdown,
      blueprintAgents: [OVERVIEW_AGENT, BODY_AGENTS[0]!],
    });
    expect(html).toContain("Lead paragraph only");
    expect(html).toContain("Body section");
  });

  it("ships when bullet copy lacks a hash link", async () => {
    const markdown = `## Overview

Lead paragraph only.

- **Options:** Plain text without a scroll link.

## Sliding Glass Door Blinds: Your Options

Body section.
`;

    const html = await prepareHarnessContentForUpload({
      markdownContent: markdown,
      blueprintAgents: [OVERVIEW_AGENT, BODY_AGENTS[0]!],
      keyword: "sliding glass door blinds",
      articleTitle: "Sliding Glass Door Blinds",
    });
    expect(html).toContain("Plain text without a scroll link");
    expect(html).toContain("Body section");
  });

  it("keeps Answer before Overview when fixing scroll links", async () => {
    const markdown = `## Answer

Solar panel efficiency is how well a panel converts sunlight into electricity under standard test conditions.

## Overview

Lead paragraph about solar efficiency.

- **Choosing Panels:** Compare [[SCROLL:#choosing-the-right-solar-panels-for-your-home|panel options]] for your roof.
- **Real-World Example:** See a [[SCROLL:#choosing-the-right-solar-panels-for-your-home|worked comparison]] in this guide.

## Choosing the Right Solar Panels for Your Home

Body with decision table.

## Ridgeline Solar: Your Partner

Contact section.
`;

    const html = await prepareHarnessContentForUpload({
      markdownContent: markdown,
      blueprintAgents: [
        OVERVIEW_AGENT,
        {
          id: "section-1",
          step: 1,
          title: "Choosing the Right Solar Panels for Your Home",
          description: "",
          features: ["[ILLUSTRATIVE]: scenario", "[BLOCKQUOTE]: quote"],
        },
        {
          id: "section-2",
          step: 2,
          title: "Ridgeline Solar: Your Partner",
          description: "",
          features: [],
        },
      ],
    });

    const answerPos = html.toLowerCase().indexOf('id="answer"');
    const overviewPos = html.toLowerCase().indexOf('id="overview"');
    expect(answerPos).toBeGreaterThanOrEqual(0);
    expect(overviewPos).toBeGreaterThan(answerPos);
    expect(html).toContain('href="#choosing-the-right-solar-panels-for-your-home"');
  });

  it("resolves [[LINK:query|anchor]] placeholders when wordPressPosts are provided", async () => {
    const markdown = `## What We Offer

| Service/Product Name | Description |
| --- | --- |
| [[LINK:motorized blinds|Motorized Blinds]] | Automated blinds for your home. |
`;

    vi.mocked(callOpenRouterChatCompletion).mockResolvedValueOnce({
      raw: {},
      content: "1",
    });

    const html = await prepareHarnessContentForUpload({
      markdownContent: markdown,
      blueprintAgents: [
        OVERVIEW_AGENT,
        { id: "section-1", step: 1, title: "What We Offer", description: "", features: [] },
      ],
      siteId: "site-1",
      siteUrl: "https://example.com",
      apiKey: "test-key",
      wordPressPosts: [
        {
          id: 42,
          slug: "motorized-blinds",
          title: "Motorized Blinds",
          excerpt: "Smart blinds",
          link: "https://example.com/motorized-blinds/",
          date_gmt: "2026-01-01",
        },
      ],
    });

    expect(html).toContain('href="https://example.com/motorized-blinds/"');
    expect(html).toContain("Motorized Blinds");
    expect(html).not.toContain("[[LINK:");
  });

  it("keeps Answer before Overview on onePassOptimize when order is reversed", async () => {
    const markdown = `## Overview

Lead paragraph about blinds.

- **Cost:** See [[SCROLL:#cost-comparison|cost comparison]] below.

## Answer

Smart blinds automation costs more upfront but saves energy over time.

## Cost Comparison

Body section with details.
`;

    const html = await prepareHarnessContentForUpload({
      markdownContent: markdown,
      blueprintAgents: [
        OVERVIEW_AGENT,
        { id: "section-1", step: 1, title: "Cost Comparison", description: "", features: [] },
      ],
      onePassOptimize: true,
    });

    const answerPos = html.toLowerCase().indexOf('id="answer"');
    const overviewPos = html.toLowerCase().indexOf('id="overview"');
    expect(answerPos).toBeGreaterThanOrEqual(0);
    expect(overviewPos).toBeGreaterThan(answerPos);
  });

  it("resolves brand [[LINK]] queries to page hrefs on one pass", async () => {
    const markdown = `## Hunter Douglas Product Lines

Compare [[LINK:Hunter Douglas|Hunter Douglas shades]] with other options.

## Energy Efficiency Features

Review [[LINK:Energy Efficiency|energy efficiency]] before you buy.
`;

    vi.mocked(callOpenRouterChatCompletion).mockResolvedValueOnce({
      raw: {},
      content: "1",
    }).mockResolvedValueOnce({
      raw: {},
      content: "2",
    });

    const html = await prepareHarnessContentForUpload({
      markdownContent: markdown,
      blueprintAgents: [
        OVERVIEW_AGENT,
        { id: "section-1", step: 1, title: "Hunter Douglas Product Lines", description: "", features: [] },
        { id: "section-2", step: 2, title: "Energy Efficiency Features", description: "", features: [] },
      ],
      siteId: "site-1",
      siteUrl: "https://blindmagic.com",
      apiKey: "test-key",
      onePassOptimize: true,
      wordPressPosts: [
        {
          id: 21,
          slug: "hunter-douglas",
          title: "Hunter Douglas",
          excerpt: "",
          link: "https://blindmagic.com/hunter-douglas/",
          date_gmt: "2026-09-01",
          collection: "pages",
          postType: "page",
        },
        {
          id: 22,
          slug: "energy-efficiency",
          title: "Energy Efficiency",
          excerpt: "",
          link: "https://blindmagic.com/technology/energy-efficiency/",
          date_gmt: "2026-09-01",
          collection: "pages",
          postType: "page",
        },
        {
          id: 12,
          slug: "powerview-guide",
          title: "PowerView Guide",
          excerpt: "",
          link: "https://blindmagic.com/blog/powerview-guide/",
          date_gmt: "2026-01-01",
          collection: "posts",
          postType: "post",
        },
      ],
    });

    expect(html).toContain('href="https://blindmagic.com/hunter-douglas/"');
    expect(html).toContain('href="https://blindmagic.com/technology/energy-efficiency/"');
    expect(html).not.toContain("[[LINK:");
    expect(html).not.toContain("/blog/powerview-guide/");
  });
});
