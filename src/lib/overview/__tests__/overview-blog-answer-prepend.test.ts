import { describe, expect, it, vi, beforeEach } from "vitest";
import { HARNESS_ANSWER_ANCHOR_ID } from "@/lib/bulk/blog-harness-answer-agent";
import { stitchHarnessSections } from "@/lib/bulk/bulk-harness-outline";
import {
  extractAnswerSectionHtml,
  generateAnswerSectionHtml,
  generateAndPrependAnswerHtml,
  generateAndPrependOverviewHtml,
  stripLeadingAnswerSection,
  stripLeadingDuplicateArticleTitleHeading,
} from "@/lib/overview/overview-blog-overview-prepend";

vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: vi.fn(),
}));

import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";

beforeEach(() => {
  vi.mocked(callOpenRouterChatCompletion).mockReset();
});

describe("generateAnswerSectionHtml entity prompts", () => {
  it("passes place entity into OpenRouter user and system prompts for SAP pages", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValueOnce({
      raw: null,
      content: `<h2>Answer</h2><p>One sourced fact. Two. Acme Plumbing sizes installs to stack height.</p>`,
    });

    await generateAnswerSectionHtml({
      apiKey: "test-key",
      articleTitle: "Plumbing Edmonton",
      focusKeyword: "plumbing edmonton",
      bodyH2Titles: ["Services"],
      pageKind: "entity",
      entity: "Edmonton, AB",
      connectedSite: { name: "Acme Plumbing", siteUrl: "https://example.com" },
    });

    expect(callOpenRouterChatCompletion).toHaveBeenCalledTimes(1);
    const call = vi.mocked(callOpenRouterChatCompletion).mock.calls[0]![0];
    expect(call.system).toContain("Edmonton, AB");
    expect(call.system).toContain("two or three sentences");
    expect(call.system).toContain("somewhere in the Answer paragraph");
    expect(call.user).toContain("Edmonton, AB");
    expect(call.user).toContain("service-area entity");
    expect(call.user).toContain("Acme Plumbing");
  });

  it("injects CONNECTED SITE IDENTITY on regular posts so Answer names the business", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValueOnce({
      raw: null,
      content: `<h2>Answer</h2><p>One. Two. Acme Tax closes with a sourced claim.</p>`,
    });

    await generateAnswerSectionHtml({
      apiKey: "test-key",
      articleTitle: "CRA Instalment Reminder",
      focusKeyword: "CRA instalment reminder",
      bodyH2Titles: ["Payment deadlines"],
      connectedSite: { name: "Acme Tax", siteUrl: "https://example.com" },
    });

    const call = vi.mocked(callOpenRouterChatCompletion).mock.calls[0]![0];
    expect(call.user).toContain("Business name (mention somewhere in the Answer)");
    expect(call.user).toContain("Acme Tax");
    expect(call.system).toContain("two or three sentences");
    expect(call.system).toContain("somewhere in the Answer paragraph");
  });
});

describe("extractAnswerSectionHtml", () => {
  it("returns Answer H2 block through the next H2", () => {
    const html = [
      `<h2 id="answer">Answer</h2>`,
      `<p>Direct answer one. Direct answer two.</p>`,
      `<h2 id="overview">Overview</h2>`,
      `<p>Lead</p>`,
    ].join("");
    const out = extractAnswerSectionHtml(html);
    expect(out).toContain(`id="${HARNESS_ANSWER_ANCHOR_ID}"`);
    expect(out).toContain("Direct answer one");
    expect(out).not.toContain("Overview");
  });
});

describe("generateAndPrependAnswerHtml", () => {
  it("throws when source post body is empty", async () => {
    await expect(
      generateAndPrependAnswerHtml({
        sourceHtml: "",
        articleTitle: "Blind repair guide",
        focusKeyword: "blind repair",
        apiKey: "test-key",
      }),
    ).rejects.toThrow(/Post body HTML is required/);
  });

  it("prepends Answer onto existing body", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValueOnce({
      raw: null,
      content: `<h2>Answer</h2><p>One. Two. Three.</p>`,
    });
    const result = await generateAndPrependAnswerHtml({
      sourceHtml: `<h2>Cost Factors</h2><p>Original body stays.</p>`,
      articleTitle: "Blind repair guide",
      focusKeyword: "blind repair",
      apiKey: "test-key",
    });
    expect(result.html).toContain("Original body stays");
    expect(result.html).toContain("Cost Factors");
    expect(result.html.indexOf("Answer")).toBeLessThan(result.html.indexOf("Cost Factors"));
  });

  it("deletes an existing Answer and places the new one before Overview", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValueOnce({
      raw: null,
      content: `<h2>Answer</h2><p>New answer one. New answer two.</p>`,
    });
    const result = await generateAndPrependAnswerHtml({
      sourceHtml: [
        `<div class="flo-overview"><h2 id="overview">Overview</h2><p>Lead</p></div>`,
        `<h2 id="answer">Answer</h2><p>Old answer stays second today.</p>`,
        `<h2>Cost Factors</h2><p>Body</p>`,
      ].join(""),
      articleTitle: "Canadian tax payments",
      focusKeyword: "canadian tax payments",
      apiKey: "test-key",
    });
    expect(result.html).not.toContain("Old answer stays second today");
    expect(result.html).toContain("New answer one");
    expect(result.html).toContain("Overview");
    expect(result.html).toContain("Cost Factors");
    const answerPos = result.html.indexOf(`id="${HARNESS_ANSWER_ANCHOR_ID}"`);
    const overviewPos = result.html.indexOf('id="overview"');
    expect(answerPos).toBeGreaterThanOrEqual(0);
    expect(overviewPos).toBeGreaterThan(answerPos);
  });

  it("strips duplicate post title heading from body before prepend", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValueOnce({
      raw: null,
      content: `<h2>Answer</h2><p>One. Two.</p>`,
    });
    const result = await generateAndPrependAnswerHtml({
      sourceHtml: `<h1>Bin Rental Tips For Home Renovations</h1><h2>Navigating Your Home Renovation</h2><p>Body.</p>`,
      articleTitle: "Bin Rental Tips For Home Renovations",
      focusKeyword: "bin rental tips",
      apiKey: "test-key",
    });
    expect(result.html).not.toMatch(/<h1[^>]*>\s*Bin Rental Tips/i);
    expect(result.html).toContain("Navigating Your Home Renovation");
    expect(result.html).toContain("Body.");
  });
});

describe("stripLeadingDuplicateArticleTitleHeading", () => {
  it("removes leading h1/h2 that matches post title", () => {
    const out = stripLeadingDuplicateArticleTitleHeading(
      `<h1>Bin Rental Tips For Home Renovations</h1><h2>Navigating</h2><p>Body</p>`,
      "Bin Rental Tips For Home Renovations",
    );
    expect(out).toBe(`<h2>Navigating</h2><p>Body</p>`);
  });
});

describe("generateAndPrependOverviewHtml", () => {
  it("throws when Answer HTML is empty", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValue({
      raw: null,
      content: "",
    });

    await expect(
      generateAndPrependOverviewHtml({
        sourceHtml: `<h2>Cost Factors</h2><p>Body</p>`,
        articleTitle: "Plumbing Edmonton",
        focusKeyword: "plumbing edmonton",
        apiKey: "test-key",
        connectedSite: { name: "Acme Plumbing", siteUrl: "https://example.com" },
      }),
    ).rejects.toThrow(/Answer section could not be generated/);
  });
});

describe("answer-only prepend stitch", () => {
  it("preserves Overview when replacing Answer", () => {
    const body = [
      `<h2 id="answer">Answer</h2><p>Old answer.</p>`,
      `<div class="flo-overview"><h2 id="overview">Overview</h2><p>Lead</p></div>`,
      `<h2>Cost Factors</h2><p>Body</p>`,
    ].join("");
    const stripped = stripLeadingAnswerSection(body);
    expect(stripped).not.toContain("Old answer");
    expect(stripped).toContain("Overview");
    expect(stripped).toContain("Cost Factors");

    const newAnswer = `<h2 id="answer">Answer</h2><p>New answer one. New answer two.</p>`;
    const stitched = stitchHarnessSections([newAnswer, stripped]);
    const answerPos = stitched.indexOf(`id="${HARNESS_ANSWER_ANCHOR_ID}"`);
    const overviewPos = stitched.indexOf('id="overview"');
    expect(answerPos).toBeGreaterThanOrEqual(0);
    expect(overviewPos).toBeGreaterThan(answerPos);
    expect(stitched).toContain("New answer one");
    expect(stitched).toContain("Cost Factors");
  });
});
