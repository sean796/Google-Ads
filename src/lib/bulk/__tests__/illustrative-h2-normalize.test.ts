import { describe, expect, it } from "vitest";
import {
  ILLUSTRATIVE_DEFAULT_H2,
  isBadIllustrativeH2Title,
  resolveIllustrativeH2Title,
  rewriteIllustrativeChecklistItemHeading,
  stripLegacyScenarioPhrasesFromExistingPageText,
} from "@/lib/content-optimization/first-party-authority-prompt";
import { finalizeHarnessSectionHtml, normalizeIllustrativeHarnessHtml } from "@/lib/bulk/harness-section-validate";
import { prepareChecklistForPipeline } from "@/lib/content-word-blocklist";
import { AUTHENTICITY_CHECKLIST_RULE, generateSingleSectionPrompt } from "@/lib/prompt-builders/core";
import { UNIFIED_COPY_FORMATTING_RULE, HARNESS_HEADING_TITLE_CASE_RULE } from "@/lib/prompt-builders/title-rules";
import type { AgentConfig } from "@/types/agent-config";

describe("illustrative H2 helpers", () => {
  it("flags realistic local situation titles", () => {
    expect(
      isBadIllustrativeH2Title(
        "A realistic local situation: managing light and privacy near Blinds Sunset Park FL",
      ),
    ).toBe(true);
    expect(resolveIllustrativeH2Title("Humidity And Fabric Choice")).toBe("Humidity And Fabric Choice");
    expect(resolveIllustrativeH2Title("")).toBe("");
  });

  it("does not rewrite planner checklist titles", () => {
    const item =
      "4. A realistic local situation near Foo [STRUCTURE]: 2 paragraphs. [ILLUSTRATIVE] [BLOCKQUOTE]";
    expect(rewriteIllustrativeChecklistItemHeading(item)).toBe(item);
    expect(rewriteIllustrativeChecklistItemHeading(item)).not.toContain(ILLUSTRATIVE_DEFAULT_H2);
  });

  it("leaves SAP slot 4 title as written", () => {
    const item =
      "4. A realistic local situation: managing light near Blinds Sunset Park FL [STRUCTURE]: 2 paragraphs.";
    const out = rewriteIllustrativeChecklistItemHeading(item, 3, "Sunset Park, FL");
    expect(out).toBe(item);
  });

  it("strips legacy scenario phrases from existing page text", () => {
    const raw =
      "Intro copy. A realistic local situation: managing light near Foo. Scenario: Given humid climate, what fits? More facts.";
    const out = stripLegacyScenarioPhrasesFromExistingPageText(raw);
    expect(out).not.toMatch(/realistic local situation/i);
    expect(out).not.toMatch(/scenario:/i);
    expect(out).toContain("Intro copy");
  });
});

describe("prepareChecklistForPipeline does not pin titles", () => {
  it("leaves SAP titles as written", () => {
    const checklist = [
      "1. Problem here [STRUCTURE]",
      "2. Local conditions [STRUCTURE]",
      "3. What fits [STRUCTURE]",
      "4. A realistic local situation: managing blinds near Sunset Park [STRUCTURE]",
      "5. What we offer locally [STRUCTURE]",
      "6. Our recommendation for homeowners in Sunset Park: best picks [STRUCTURE]",
      "7. Next Steps: Getting your ideal blinds in Sunset Park [STRUCTURE]",
    ];
    const out = prepareChecklistForPipeline(checklist, { sapEntity: "Sunset Park, FL" });
    expect(out[0]).toContain("Problem here");
    expect(out[3]).toContain("A realistic local situation");
    expect(out[6]).toContain("Next Steps: Getting your ideal blinds");
    expect(out.join("\n")).not.toMatch(/Sunlight And Privacy Challenges/i);
  });

  it("keeps the first illustrative marker and leaves other titles intact", () => {
    const out = prepareChecklistForPipeline(
      [
        "1. Cost Differences [STRUCTURE] [ILLUSTRATIVE]",
        "2. Motorization Options [STRUCTURE] [ILLUSTRATIVE]",
        "3. Fabric Choices [STRUCTURE] [LIST]",
      ],
    );
    expect(out[0]).toContain("Cost Differences");
    expect(out[0]).toContain("[ILLUSTRATIVE]");
    expect(out[1]).toContain("Motorization Options");
    expect(out[1]).not.toContain("[ILLUSTRATIVE]");
    expect(out[2]).toContain("Fabric Choices");
  });
});

describe("normalizeIllustrativeHarnessHtml (legacy helper)", () => {
  it("replaces bad H2 and strips Scenario label from intro", () => {
    const raw = `<h2>A realistic local situation: managing light near Blinds Sunset Park FL</h2>
<p>Scenario: Given the humid climate, what blinds fit Eleanor's home?</p>
<h3>Recommendation: Vinyl blinds</h3>
<p>In The Shade would recommend vinyl.</p>`;
    const out = normalizeIllustrativeHarnessHtml(raw, "Humidity And Fabric Choice");
    expect(out).toContain("<h2>Humidity And Fabric Choice</h2>");
    expect(out.toLowerCase()).not.toContain("scenario:");
    expect(out).not.toMatch(/realistic local situation/i);
  });

  it("normalizes an h3 Pick Title or bold Recommendation line into <h3>Recommendation: ...</h3>", () => {
    const raw = `<h2>How a Local Crew Doubled Bookings Before Spring</h2>
<p>Seasonal slowdowns challenge residential window cleaning crews across the region.</p>
<blockquote><p>Morgan runs a two-truck crew in Edmonton and needs bookings before spring thaw.</p></blockquote>
<h3>Local SEO And Paid Search</h3>
<p>Neo Digital would recommend pairing local SEO with targeted Google Ads before spring thaw.</p>`;
    const out = finalizeHarnessSectionHtml(raw, {
      isOverview: false,
      isIllustrative: true,
      title: "How a Local Crew Doubled Bookings Before Spring",
    });
    expect(out).toContain("<h3>Recommendation: Local SEO And Paid Search</h3>");
    expect(out).toContain("<blockquote>");
  });

  it("inserts Recommendation h3 before trailing site-first paragraph when model omitted h3 tag", () => {
    const raw = `<h2>How a Local Crew Doubled Bookings Before Spring</h2>
<p>Seasonal slowdowns challenge residential window cleaning crews across the region.</p>
<blockquote><p>Morgan runs a two-truck crew in Edmonton and needs bookings before spring thaw.</p></blockquote>
<p>Neo Digital would recommend pairing local SEO with targeted Google Ads before spring thaw.</p>`;
    const out = finalizeHarnessSectionHtml(raw, {
      isOverview: false,
      isIllustrative: true,
      title: "How a Local Crew Doubled Bookings Before Spring",
    });
    expect(out).toContain("<h3>Recommendation: Recommended Approach</h3>");
    expect(out).toContain("<blockquote>");
  });
});

describe("finalizeHarnessSectionHtml illustrative", () => {
  it("enforces pinned illustrative H2 without HTML normalize rewrite", () => {
    const raw = `<h2>A realistic local situation: managing light near Blinds Sunset Park FL</h2>
<p>Given the humid climate, Eleanor needs moisture-resistant options.</p>`;
    const out = finalizeHarnessSectionHtml(raw, {
      isOverview: false,
      isIllustrative: true,
      title: ILLUSTRATIVE_DEFAULT_H2,
    });
    expect(out).toContain(`<h2 id="a-local-homeowner-example">${ILLUSTRATIVE_DEFAULT_H2}</h2>`);
    expect(out).not.toMatch(/realistic local situation/i);
  });
});

describe("unified formatting prompt", () => {
  it("includes unique H2 rule in checklist and writer prompts", () => {
    expect(AUTHENTICITY_CHECKLIST_RULE).toContain("UNIFIED COPY FORMATTING");
    expect(AUTHENTICITY_CHECKLIST_RULE).toContain("UNIQUE DYNAMIC BODY H2s");
    expect(AUTHENTICITY_CHECKLIST_RULE).not.toContain("keyword jobs");
    expect(UNIFIED_COPY_FORMATTING_RULE).toContain("Title Case in headings and titles");
    expect(UNIFIED_COPY_FORMATTING_RULE).toContain("Title Case does **not** apply to link anchor phrases");
    expect(HARNESS_HEADING_TITLE_CASE_RULE).toContain("Title Case");

    const agent: AgentConfig = {
      id: "agent-5",
      step: 5,
      title: "What We Offer",
      description: "Catalog section",
      features: ["[STRUCTURE]: 2 paragraphs.", "[TABLE]"],
      h2Count: 1,
      h3Count: 0,
      h3Enabled: false,
      headingLevel: 1,
      maxTokens: 2000,
    };
    const prompt = generateSingleSectionPrompt(agent, "html");
    expect(prompt).toContain("UNIFIED COPY FORMATTING");
  });
});
