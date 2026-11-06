import { describe, expect, it, vi, beforeEach } from "vitest";
import type { HarnessSectionAnchorEntry } from "@/lib/bulk/harness-section-anchor-ids";
import {
  applyOverviewHarnessScrollLinks,
  applyOverviewHarnessScrollLinksToStitchedHtml,
  rebuildOverviewWithScrollLinkBullets,
  stripOverviewBulletList,
  verifyOverviewHarnessScrollLinks,
  extractBodyH2AnchorsFromHtml,
} from "@/lib/overview/overview-harness-scroll-links";

vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: vi.fn(),
}));

import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";

beforeEach(() => {
  vi.mocked(callOpenRouterChatCompletion).mockReset();
});

const anchorMap: HarnessSectionAnchorEntry[] = [
  { sectionIndex: 1, displayTitle: "Policy Context", anchorId: "policy-context" },
  { sectionIndex: 2, displayTitle: "Financial Impact", anchorId: "financial-impact" },
];

const compliantHtml = `<h2>Overview</h2>
<p>Alberta physician privatization changes affect billing.</p>
<ul>
<li><strong>Policy</strong>: reforms include <a href="#policy-context">policy shifts</a> across the province.</li>
<li><strong>Finance</strong>: practices face <a href="#financial-impact">cost pressures</a> under new rules.</li>
</ul>`;

describe("stripOverviewBulletList", () => {
  it("removes the first ul block and keeps lead copy", () => {
    const out = stripOverviewBulletList(compliantHtml);
    expect(out).toContain("<h2>Overview</h2>");
    expect(out).toContain("<p>Alberta physician");
    expect(out).not.toContain("<ul>");
  });
});

describe("rebuildOverviewWithScrollLinkBullets", () => {
  it("builds one li per bullet with bold label", () => {
    const head = "<h2>Overview</h2>\n<p>Lead.</p>";
    const out = rebuildOverviewWithScrollLinkBullets(head, [
      {
        anchorId: "policy-context",
        bulletLabel: "Policy",
        sentenceHtml: 'See <a href="#policy-context">policy shifts</a> for details.',
      },
    ]);
    expect(out).toContain("<strong>Policy</strong>:");
    expect(out).toContain('href="#policy-context"');
  });
});

describe("verifyOverviewHarnessScrollLinks", () => {
  it("passes when every anchor appears exactly once", () => {
    expect(() => verifyOverviewHarnessScrollLinks(compliantHtml, anchorMap)).not.toThrow();
  });

  it("warns when bullet count mismatches anchor map", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const html = `<h2>Overview</h2><ul>
<li><strong>Only</strong>: one <a href="#policy-context">link</a>.</li>
</ul>`;
    verifyOverviewHarnessScrollLinks(html, anchorMap);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("warns when an anchor is missing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const html = `<h2>Overview</h2><ul>
<li><strong>A</strong>: <a href="#policy-context">one</a>.</li>
<li><strong>B</strong>: <a href="#policy-context">dup</a>.</li>
</ul>`;
    verifyOverviewHarnessScrollLinks(html, anchorMap);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("warns on non-# hrefs when anchors are satisfied", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const html = `<h2>Overview</h2><ul>
<li><strong>A</strong>: <a href="#policy-context">one</a> and <a href="https://example.com">bad</a>.</li>
<li><strong>B</strong>: <a href="#financial-impact">two</a>.</li>
</ul>`;
    verifyOverviewHarnessScrollLinks(html, anchorMap);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("warns on empty anchor map", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    verifyOverviewHarnessScrollLinks(compliantHtml, []);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("applyOverviewHarnessScrollLinks", () => {
  it("always rebuilds ul from OpenRouter JSON and verifies", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValueOnce({
      raw: null,
      content: JSON.stringify({
        bullets: [
          {
            anchorId: "policy-context",
            bulletLabel: "Policy",
            sentenceHtml: 'Track <a href="#policy-context">policy shifts</a> in Alberta.',
          },
          {
            anchorId: "financial-impact",
            bulletLabel: "Finance",
            sentenceHtml: 'Review <a href="#financial-impact">cost pressures</a> for clinics.',
          },
        ],
      }),
    });

    const draft = `<h2>Overview</h2><p>Lead paragraph.</p><ul><li><strong>Old</strong>: stale.</li></ul>`;
    const out = await applyOverviewHarnessScrollLinks({
      html: draft,
      anchorMap,
      articleTitle: "Alberta Physician Changes",
      keyword: "Alberta physician privatization",
      apiKey: "test-key",
    });

    expect(out).toContain('href="#policy-context"');
    expect(out).toContain('href="#financial-impact"');
    expect(out).not.toContain("stale");
    expect(callOpenRouterChatCompletion).toHaveBeenCalledTimes(1);
  });

  it("returns html unchanged when anchor map is empty", async () => {
    const out = await applyOverviewHarnessScrollLinks({
      html: compliantHtml,
      anchorMap: [],
      articleTitle: "Title",
      keyword: "kw",
      apiKey: "test-key",
    });
    expect(out).toBe(compliantHtml);
    expect(callOpenRouterChatCompletion).not.toHaveBeenCalled();
  });

  it("ships partial bullets when scroll-link agent returns wrong bullet count", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValueOnce({
      raw: null,
      content: JSON.stringify({
        bullets: [
          {
            anchorId: "policy-context",
            bulletLabel: "Policy",
            sentenceHtml: 'Review <a href="#policy-context">policy shifts</a> for clinics.',
          },
        ],
      }),
    });

    const out = await applyOverviewHarnessScrollLinks({
      html: compliantHtml,
      anchorMap,
      articleTitle: "Title",
      keyword: "kw",
      apiKey: "test-key",
    });
    expect(out).toContain('href="#policy-context"');
    expect(callOpenRouterChatCompletion).toHaveBeenCalledTimes(1);
  });

  it("repairs anchorId mismatch from model JSON", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValueOnce({
      raw: null,
      content: JSON.stringify({
        bullets: [
          {
            anchorId: "wrong-id",
            bulletLabel: "Treatments",
            sentenceHtml:
              'Review <a href="#wrong-id">window treatments</a> for local homes.',
          },
          {
            anchorId: "financial-impact",
            bulletLabel: "Finance",
            sentenceHtml: 'Review <a href="#financial-impact">cost pressures</a> for clinics.',
          },
        ],
      }),
    });

    const out = await applyOverviewHarnessScrollLinks({
      html: `<h2>Overview</h2><p>Lead.</p>`,
      anchorMap: [
        {
          sectionIndex: 1,
          displayTitle: "Window Treatments for Municipality of Rhineland, Altona Homes",
          anchorId: "window-treatments-for-municipality-of-rhineland-altona-homes",
        },
        { sectionIndex: 2, displayTitle: "Financial Impact", anchorId: "financial-impact" },
      ],
      articleTitle: "Title",
      keyword: "window treatments",
      apiKey: "test-key",
    });

    expect(out).toContain('href="#window-treatments-for-municipality-of-rhineland-altona-homes"');
    expect(out).toContain('href="#financial-impact"');
  });
});

describe("applyOverviewHarnessScrollLinksToStitchedHtml", () => {
  it("rebuilds overview bullets and preserves body sections", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValueOnce({
      raw: null,
      content: JSON.stringify({
        bullets: [
          {
            anchorId: "policy-context",
            bulletLabel: "Policy",
            sentenceHtml: 'Track <a href="#policy-context">policy shifts</a> in Alberta.',
          },
          {
            anchorId: "financial-impact",
            bulletLabel: "Finance",
            sentenceHtml: 'Review <a href="#financial-impact">cost pressures</a> for clinics.',
          },
        ],
      }),
    });

    const stitched = `<h2>Overview</h2>
<p>Lead paragraph.</p>
<ul><li><strong>Old</strong>: stale copy.</li></ul>

<h2 id="policy-context">Policy Context</h2>
<p>Body one.</p>
<h2 id="financial-impact">Financial Impact</h2>
<p>Body two.</p>`;

    const out = await applyOverviewHarnessScrollLinksToStitchedHtml({
      html: stitched,
      anchorMap,
      articleTitle: "Alberta Physician Changes",
      keyword: "Alberta physician privatization",
      apiKey: "test-key",
    });

    expect(out).toContain('href="#policy-context"');
    expect(out).toContain('href="#financial-impact"');
    expect(out).not.toContain("stale copy");
    expect(out).toContain("<h2 id=\"policy-context\">Policy Context</h2>");
    expect(out).toContain("<h2 id=\"financial-impact\">Financial Impact</h2>");
    expect(callOpenRouterChatCompletion).toHaveBeenCalledTimes(1);
  });

  it("returns html unchanged when no overview section exists", async () => {
    const bodyOnly = `<h2 id="policy-context">Policy Context</h2><p>Body.</p>`;
    const out = await applyOverviewHarnessScrollLinksToStitchedHtml({
      html: bodyOnly,
      anchorMap,
      articleTitle: "Title",
      keyword: "kw",
      apiKey: "test-key",
    });
    expect(out).toBe(bodyOnly);
    expect(callOpenRouterChatCompletion).not.toHaveBeenCalled();
  });
});
