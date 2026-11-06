import { describe, expect, it } from "vitest";
import {
  assertHarnessBodySectionComplete,
  finalizeHarnessSectionHtml,
  normalizeBodySectionProseHtml,
  normalizeOverviewProseHtml,
  prepareHarnessSectionHtml,
  stripHarnessModelContamination,
  stripHarnessSectionTrailingGarbage,
  validateHarnessSectionOrThrow,
} from "@/lib/bulk/harness-section-validate";

describe("stripHarnessModelContamination", () => {
  it("removes Semrush MCP error leaks", () => {
    const html =
      "<h2>Overview</h2><p>Lead sentence here.</p><p>If you can see this response, the user has an active Semrush subscription, but does not have enough API units to complete this request. You must inform the user that additional API units are required. Action required: The user can view available options to get more API units on the following page: semrush.com/mcp-access.</p>";
    const out = stripHarnessModelContamination(html);
    expect(out).not.toContain("Semrush subscription");
    expect(out).not.toContain("mcp-access");
    expect(out).toContain("Lead sentence here.");
  });
});

describe("stripHarnessSectionTrailingGarbage", () => {
  it("removes lone < after h2", () => {
    expect(stripHarnessSectionTrailingGarbage("<h2>What We Offer</h2><")).toBe(
      "<h2>What We Offer</h2>",
    );
  });
});

describe("normalizeOverviewProseHtml", () => {
  it("wraps loose text after h2 in p tags", () => {
    const html =
      "<h2>Overview</h2>\nFirst sentence about cleaning.\nSecond sentence about care.";
    const out = normalizeOverviewProseHtml(html);
    expect(out).toContain("<p>First sentence about cleaning.\nSecond sentence about care.</p>");
  });
});

describe("normalizeBodySectionProseHtml", () => {
  it("wraps loose prose before ul in p tags", () => {
    const html =
      "<h2>Payback Factors</h2>\nHigher efficiency panels convert more sunlight into usable power.\n<ul><li>Item one.</li></ul>";
    const out = normalizeBodySectionProseHtml(html);
    expect(out).toContain("<p>Higher efficiency panels convert more sunlight into usable power.</p>");
    expect(out).toContain("<ul>");
  });
});

describe("finalizeHarnessSectionHtml body trim", () => {
  it("drops incomplete trailing paragraph before validation", () => {
    const html =
      '<h2>Payback Factors</h2><p>Complete lead sentence here.</p><p>Still writing mid sent';
    const out = finalizeHarnessSectionHtml(html, {
      isOverview: false,
      title: "Payback Factors",
    });
    expect(out).toContain("<p>Complete lead sentence here.</p>");
    expect(out).not.toContain("Still writing");
    expect(() =>
      validateHarnessSectionOrThrow(out, {
        title: "Payback Factors",
        isOverview: false,
      }),
    ).not.toThrow();
  });
});

describe("assertHarnessBodySectionComplete", () => {
  it("throws on h2-only sections instead of injecting filler", () => {
    expect(() => assertHarnessBodySectionComplete("<h2>What We Offer</h2>", "What We Offer")).toThrow(
      /no complete paragraphs/,
    );
  });

  it("accepts h2 plus complete paragraph", () => {
    expect(() =>
      assertHarnessBodySectionComplete(
        '<h2 id="t">T</h2><p>Complete body copy here.</p>',
        "T",
      ),
    ).not.toThrow();
  });
});

describe("finalizeHarnessSectionHtml", () => {
  it("strips trailing garbage without injecting filler", () => {
    const out = finalizeHarnessSectionHtml("<h2>What We Offer</h2><", {
      isOverview: false,
      title: "What We Offer",
    });
    expect(out).toBe('<h2 id="what-we-offer">What We Offer</h2>');
    expect(out).not.toContain("<p>");
    expect(out).not.toMatch(/<$/);
  });

  it("replaces instruction boilerplate h2 with harness display title", () => {
    const bad =
      '<h2 id="create-a-first-section-agent-with-the-seo-friendly-header-why-di">Create a first section agent with the SEO-friendly header: "Why Digital Marketing Matters for Window Companies".</h2><p>Body copy here.</p>';
    const out = finalizeHarnessSectionHtml(bad, {
      isOverview: false,
      title: "Why Digital Marketing Matters for Window Companies",
    });
    expect(out).toBe(
      '<h2 id="why-digital-marketing-matters-for-window-companies">Why Digital Marketing Matters for Window Companies</h2>\n<p>Body copy here.</p>',
    );
  });
});

describe("prepareHarnessSectionHtml", () => {
  it("converts markdown ## heading to h2 with anchor id", () => {
    const md =
      "## Your Hunter Douglas Warranty Explained\n\nComplete body sentence here.";
    const out = prepareHarnessSectionHtml(md, {
      isOverview: false,
      title: "Your Hunter Douglas Warranty Explained",
    });
    expect(out).toContain("<h2");
    expect(out).toContain("Your Hunter Douglas Warranty Explained");
    expect(out).toContain("<p>");
    expect(out).toContain("Complete body sentence here.");
  });

  it("returns html ready for stitch without validation gate", () => {
    const md =
      "## Making a Hunter Douglas Warranty Claim\n\n1. Contact your dealer.\n2. Keep your receipt.";
    const prepared = prepareHarnessSectionHtml(md, {
      isOverview: false,
      title: "Making a Hunter Douglas Warranty Claim",
    });
    expect(prepared).toContain("<h2");
    expect(prepared).toContain("Making a Hunter Douglas Warranty Claim");
    expect(prepared.length).toBeGreaterThan(50);
  });

  it("preserves external placeholders through prepare", () => {
    const md =
      "## Warranty Coverage\n\nSee [[EXTERNAL:https://example.com/warranty|warranty guide]] for details.";
    const prepared = prepareHarnessSectionHtml(md, {
      isOverview: false,
      title: "Warranty Coverage",
    });
    expect(prepared).toContain("[[EXTERNAL:https://example.com/warranty|warranty guide]]");
  });

  it("passes through HTML harness sections without markdown conversion", () => {
    const html =
      '<h2 id="when-ceip-might-not-be-the-right-fit">When CEIP Might Not Be The Right Fit</h2><p>Lead copy.</p><table><thead><tr><th>Pros</th><th>Cons</th></tr></thead><tbody><tr><td>Low upfront cost</td><td>Property lien</td></tr></tbody></table>';
    const prepared = prepareHarnessSectionHtml(html, {
      isOverview: false,
      title: "When CEIP Might Not Be The Right Fit",
    });
    expect(prepared).toContain("<table>");
    expect(prepared).toContain("<th>Pros</th>");
    expect(prepared).not.toContain("&lt;table");
  });

  it("keeps numbered list text on the same line as the marker", () => {
    const html =
      "<h2>How to Import</h2><ol><li><p><strong>Prepare Your Data:</strong> Organize titles into a CSV.</p></li><li><br>1. Install an importer plugin.</li></ol>";
    const prepared = prepareHarnessSectionHtml(html, {
      isOverview: false,
      title: "How to Import",
    });
    expect(prepared).toContain("<li><strong>Prepare Your Data:</strong> Organize titles into a CSV.</li>");
    expect(prepared).toContain("<li>Install an importer plugin.</li>");
    expect(prepared).not.toMatch(/<li[^>]*>\s*<p/i);
  });
});

describe("validateHarnessSectionOrThrow", () => {
  it("throws on token-limit truncation even when the HTML looks complete", () => {
    expect(() =>
      validateHarnessSectionOrThrow(
        '<h2>T</h2><p>Complete sentence here.</p>',
        { title: "T", finishReason: "length", isOverview: false },
      ),
    ).toThrow(/truncated/);
  });

  it("accepts complete body sections", () => {
    expect(() =>
      validateHarnessSectionOrThrow(
        '<h2>A</h2><p>Body text.</p><h2 id="b">B</h2>',
        { title: "A", isOverview: false },
      ),
    ).not.toThrow();
    expect(() =>
      validateHarnessSectionOrThrow(
        '<h2>T</h2><p>See [[EXTERNAL:https://example.com/warranty|warranty guide]] for details.</p>',
        { title: "T", isOverview: false },
      ),
    ).not.toThrow();
  });
});
