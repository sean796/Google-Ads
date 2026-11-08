import { describe, expect, it } from "vitest";
import {
  AISO_AUTHORITY_PHRASING_RULE,
  A_LEVEL_CONNECTED_SITE_ARTICLE_RULE,
  A_LEVEL_DECISION_PRECISION_RULE,
  FACTUAL_VERIFICATION_SOURCE_RULE,
} from "@/lib/content-optimization/first-party-authority-prompt";
import {
  AUTHENTICITY_CHECKLIST_RULE,
  AUTHENTICITY_WRITER_RULE,
  generateSingleSectionPrompt,
  sectionAllowsThreeParagraphs,
} from "@/lib/prompt-builders/core";
import { BLOG_HARNESS_SUMMARY_AGENT_ID } from "@/lib/bulk/blog-harness-summary-agent";
import { buildBlogHarnessAnswerAgent } from "@/lib/bulk/blog-harness-answer-agent";
import {
  ILLUSTRATIVE_BLOCKQUOTE_RULE,
  ILLUSTRATIVE_PERSONA_OUTPUT_SHAPE,
  ILLUSTRATIVE_SCENARIO_PERSONA_RULE,
} from "@/lib/content-optimization/first-party-authority-prompt";
import { buildSystemPrompt, buildBulkHarnessSectionUserPrompt } from "@/lib/prompt-builders/system-user";

describe("A_LEVEL_CONNECTED_SITE_ARTICLE_RULE", () => {
  it("covers illustrative personas, evidence discipline, and recommendation without hardcoded clients", () => {
    expect(A_LEVEL_CONNECTED_SITE_ARTICLE_RULE).toContain("Search intent first");
    expect(A_LEVEL_CONNECTED_SITE_ARTICLE_RULE).toContain("2-3 concrete example queries");
    expect(A_LEVEL_CONNECTED_SITE_ARTICLE_RULE).toContain("[ILLUSTRATIVE]");
    expect(A_LEVEL_CONNECTED_SITE_ARTICLE_RULE).toContain("Copy the injected ILLUSTRATIVE EXAMPLE block exactly");
    expect(A_LEVEL_CONNECTED_SITE_ARTICLE_RULE).toContain("<h3>Recommendation:");
    expect(A_LEVEL_CONNECTED_SITE_ARTICLE_RULE).toContain("Short H2");
    expect(A_LEVEL_CONNECTED_SITE_ARTICLE_RULE).not.toContain("<h3>Scenario:");
    expect(A_LEVEL_CONNECTED_SITE_ARTICLE_RULE).toContain("[RECOMMENDATION]");
    expect(A_LEVEL_CONNECTED_SITE_ARTICLE_RULE).toContain("so what should I actually buy");
    expect(A_LEVEL_CONNECTED_SITE_ARTICLE_RULE).toContain("Best for {job}: {option}");
    expect(A_LEVEL_CONNECTED_SITE_ARTICLE_RULE).toContain("When SAP PAGE TEMPLATE is present");
    expect(A_LEVEL_CONNECTED_SITE_ARTICLE_RULE).toContain("Product | Best for | Budget | Reason");
    expect(A_LEVEL_CONNECTED_SITE_ARTICLE_RULE).toContain("programStatusQuery");
    expect(A_LEVEL_CONNECTED_SITE_ARTICLE_RULE).toContain("serpByQuery");
    expect(A_LEVEL_CONNECTED_SITE_ARTICLE_RULE).toContain("only when Keyword or Title is already about rebates");
    expect(A_LEVEL_CONNECTED_SITE_ARTICLE_RULE).toContain("3–4%");
    expect(A_LEVEL_CONNECTED_SITE_ARTICLE_RULE).toContain("researchAsOf");
    expect(A_LEVEL_CONNECTED_SITE_ARTICLE_RULE).not.toContain("Edmonton");
    expect(A_LEVEL_CONNECTED_SITE_ARTICLE_RULE).not.toContain("Ridgeline");
  });
});

describe("AISO_AUTHORITY_PHRASING_RULE premium spec vs economics", () => {
  it("forbids equating highest tier with fastest ROI in tables", () => {
    expect(AISO_AUTHORITY_PHRASING_RULE).toContain("Premium spec ≠ economics");
    expect(AISO_AUTHORITY_PHRASING_RULE).toContain("fastest ROI");
    expect(AISO_AUTHORITY_PHRASING_RULE).toContain("Efficiency vs ROI is one instance");
  });
});

describe("A_LEVEL_DECISION_PRECISION_RULE", () => {
  it("requires contrast illustrative personas, when-it-matters matrix, and spec vs performance without site-specific examples", () => {
    expect(A_LEVEL_DECISION_PRECISION_RULE).toContain("no new H2s");
    expect(A_LEVEL_DECISION_PRECISION_RULE).toContain("Spec vs performance");
    expect(A_LEVEL_DECISION_PRECISION_RULE).toContain("Contrast illustrative");
    expect(A_LEVEL_DECISION_PRECISION_RULE).toContain("one worked example");
    expect(A_LEVEL_DECISION_PRECISION_RULE).toContain("<blockquote>");
    expect(A_LEVEL_DECISION_PRECISION_RULE).toContain("When does [key spec/tier] actually matter?");
    expect(A_LEVEL_DECISION_PRECISION_RULE).toContain("Premium worth-it rule");
    expect(A_LEVEL_DECISION_PRECISION_RULE).toContain("If-X-choose-Y");
    expect(A_LEVEL_DECISION_PRECISION_RULE).toContain("If {named constraint}, choose {option}");
    expect(A_LEVEL_DECISION_PRECISION_RULE).toContain("site-first recommendation");
    expect(A_LEVEL_DECISION_PRECISION_RULE).not.toContain("Edmonton");
    expect(A_LEVEL_DECISION_PRECISION_RULE).not.toContain("Sarah");
    expect(A_LEVEL_DECISION_PRECISION_RULE).not.toContain("kWh");
  });
});

describe("AUTHENTICITY rules extended for A-Level", () => {
  it("checklist ties illustrative to blockquote, when-it-matters matrix, and recommendation markers", () => {
    expect(AUTHENTICITY_CHECKLIST_RULE).toContain("[ILLUSTRATIVE]");
    expect(AUTHENTICITY_CHECKLIST_RULE).toContain("[BLOCKQUOTE]");
    expect(AUTHENTICITY_CHECKLIST_RULE).toContain("[RECOMMENDATION]");
    expect(AUTHENTICITY_CHECKLIST_RULE).toContain("When does [key spec/tier] actually matter?");
    expect(AUTHENTICITY_CHECKLIST_RULE).toContain("short H2 (3-8 words");
    expect(AUTHENTICITY_CHECKLIST_RULE).not.toContain("h3 Scenario question");
  });

  it("writer rule requires named persona illustrative and when-it-matters matrix", () => {
    expect(AUTHENTICITY_WRITER_RULE).toContain("[ILLUSTRATIVE]");
    expect(AUTHENTICITY_WRITER_RULE).toContain("short-H2 + intro + blockquote persona pattern");
    expect(AUTHENTICITY_WRITER_RULE).toContain("when-it-matters matrix");
    expect(AUTHENTICITY_WRITER_RULE).toContain("[RECOMMENDATION]");
    expect(AUTHENTICITY_WRITER_RULE).toContain("FIELD OBSERVATION");
    expect(AUTHENTICITY_WRITER_RULE).toContain("Best for {job}: {option}");
    expect(AUTHENTICITY_WRITER_RULE).toContain("When SAP PAGE TEMPLATE is present");
    expect(AUTHENTICITY_WRITER_RULE).toContain("Product | Best for | Budget | Reason");
    expect(AUTHENTICITY_CHECKLIST_RULE).toContain("so what should I actually buy");
  });

  it("allows three paragraphs for illustrative and recommendation sections", () => {
    expect(sectionAllowsThreeParagraphs({ title: "Example [ILLUSTRATIVE]" })).toBe(true);
    expect(sectionAllowsThreeParagraphs({ title: "Our Pick [RECOMMENDATION]" })).toBe(true);
  });
});

describe("FACTUAL_VERIFICATION_SOURCE_RULE", () => {
  it("requires verifiedFacts as source of truth for every checkable claim", () => {
    expect(FACTUAL_VERIFICATION_SOURCE_RULE).toContain("Publish confirmed");
    expect(FACTUAL_VERIFICATION_SOURCE_RULE).toContain("Tier 2");
  });
});

describe("ILLUSTRATIVE_SCENARIO_PERSONA_RULE", () => {
  it("requires copying OpenRouter-assigned persona only", () => {
    expect(ILLUSTRATIVE_SCENARIO_PERSONA_RULE).toContain("Copy ILLUSTRATIVE EXAMPLE only");
    expect(ILLUSTRATIVE_SCENARIO_PERSONA_RULE).toContain("forbidden to rename personaName");
    expect(ILLUSTRATIVE_SCENARIO_PERSONA_RULE).not.toMatch(/Morgan|Quinn|Finley|Jordan|Alex|Riley/);
  });
  it("requires short H2, intro, blockquote, and titled recommendation h3", () => {
    expect(ILLUSTRATIVE_SCENARIO_PERSONA_RULE).toContain("<h3>Recommendation:");
    expect(ILLUSTRATIVE_SCENARIO_PERSONA_RULE).toContain("mandatory paragraph");
    expect(ILLUSTRATIVE_SCENARIO_PERSONA_RULE).toContain("situationHook");
    expect(ILLUSTRATIVE_SCENARIO_PERSONA_RULE).toContain("Site-first recommendation");
    expect(ILLUSTRATIVE_SCENARIO_PERSONA_RULE).toContain("would recommend");
    expect(ILLUSTRATIVE_SCENARIO_PERSONA_RULE).toContain("Short H2, scenario in body");
    expect(ILLUSTRATIVE_SCENARIO_PERSONA_RULE).not.toContain("<h3>Scenario:");
  });
});

describe("ILLUSTRATIVE_PERSONA_OUTPUT_SHAPE", () => {
  it("forbids lead-in labels and duplicate persona blocks", () => {
    expect(ILLUSTRATIVE_PERSONA_OUTPUT_SHAPE).toContain("lead-in labels");
    expect(ILLUSTRATIVE_PERSONA_OUTPUT_SHAPE).toContain("decision matching Answer");
    expect(ILLUSTRATIVE_PERSONA_OUTPUT_SHAPE).toContain("SITE-FIRST");
    expect(ILLUSTRATIVE_PERSONA_OUTPUT_SHAPE).toContain("Connected business name");
    expect(ILLUSTRATIVE_PERSONA_OUTPUT_SHAPE).toContain("3-8 words");
    expect(ILLUSTRATIVE_PERSONA_OUTPUT_SHAPE).not.toContain("<h3>Scenario:");
    expect(ILLUSTRATIVE_PERSONA_OUTPUT_SHAPE).toContain("[[LINK:service-area page title|short place]]");
    expect(ILLUSTRATIVE_PERSONA_OUTPUT_SHAPE).toContain("location cite");
  });

  it("states one Recommendation h3 contract in every format", () => {
    expect(ILLUSTRATIVE_PERSONA_OUTPUT_SHAPE).toContain("<h3>Recommendation: {specific pick title");
    expect(ILLUSTRATIVE_PERSONA_OUTPUT_SHAPE).toContain("### Recommendation: {specific pick title");
    expect(ILLUSTRATIVE_PERSONA_OUTPUT_SHAPE).not.toContain("### Recommendation.");
    expect(ILLUSTRATIVE_SCENARIO_PERSONA_RULE).toContain('"Recommendation: {short pick title}"');
    expect(ILLUSTRATIVE_SCENARIO_PERSONA_RULE).not.toContain("short pick title only");
    expect(ILLUSTRATIVE_BLOCKQUOTE_RULE).toContain('"Recommendation: {short pick title}"');
  });
});

describe("ILLUSTRATIVE_BLOCKQUOTE_RULE", () => {
  it("requires intro + blockquote persona shape grounded to Answer", () => {
    expect(ILLUSTRATIVE_BLOCKQUOTE_RULE).toContain("[ILLUSTRATIVE]");
    expect(ILLUSTRATIVE_BLOCKQUOTE_RULE).toContain("ILLUSTRATIVE EXAMPLE");
    expect(ILLUSTRATIVE_BLOCKQUOTE_RULE).toContain("Overview");
    expect(ILLUSTRATIVE_BLOCKQUOTE_RULE).toContain("Ground to Answer");
    expect(ILLUSTRATIVE_BLOCKQUOTE_RULE).toContain("never a heading");
    expect(ILLUSTRATIVE_BLOCKQUOTE_RULE).not.toContain("Scenario h3");
  });
});

describe("harness section prompts", () => {
  it("Overview prompt requires Real-World Example bullet", () => {
    const prompt = generateSingleSectionPrompt(
      {
        id: BLOG_HARNESS_SUMMARY_AGENT_ID,
        step: 1,
        title: "Overview",
        description: "Overview",
        features: [],
        headingLevel: 1,
      },
      "html",
    );
    expect(prompt).toContain("Real-World Example");
    expect(prompt).toContain("labeled real-world hypothetical");
    expect(prompt).toContain("Lead with what remaining sections cover");
    expect(prompt).not.toContain("First sentence answers with a sourced fact");
    const overviewUser = buildBulkHarnessSectionUserPrompt(
      "Tariffs Guide",
      "Map remaining sections",
      prompt,
      "outline",
      ["How Tariffs Shape Operations"],
      1,
      3,
      { name: "KWB LLP", siteUrl: "https://kwbllp.com" },
      undefined,
      undefined,
      true,
      "https://kwbllp.com/blog/tariffs/",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "IN-PAGE ANCHORS:\n1. how-tariffs (How Tariffs Shape Operations)",
      undefined,
      undefined,
      "how tariffs impact canadian businesses",
      ["Answer", "Overview", "How Tariffs Shape Operations"],
    );
    expect(overviewUser).not.toContain("FIRST PARAGRAPH RULE");
    expect(overviewUser).toContain("map remaining sections");
    expect(overviewUser).toContain("OVERVIEW PERSONA NAME");
    expect(prompt).toContain("OVERVIEW PERSONA NAME");
  });

  it("Answer prompt includes comparison verdict rule for vs keywords", () => {
    const prompt = generateSingleSectionPrompt(
      buildBlogHarnessAnswerAgent(),
      "html",
      undefined,
      undefined,
      "Smart Blinds Automation Vs Traditional Blinds",
    );
    expect(prompt).toContain("COMPARISON ANSWER");
    expect(prompt).toContain("Direct comparison verdict");
  });

  it("illustrative body section prompt requires persona scenario contract", () => {
    const prompt = generateSingleSectionPrompt(
      {
        id: "body-1",
        step: 2,
        title: "Choosing Panels [ILLUSTRATIVE] [BLOCKQUOTE]",
        description: "Local scenario",
        features: ["[ILLUSTRATIVE]: scenario", "[BLOCKQUOTE]: contrast"],
        headingLevel: 1,
      },
      "html",
    );
    expect(prompt).toContain("ILLUSTRATIVE OUTPUT SHAPE");
    expect(prompt).toContain("<h3>Recommendation:");
    expect(prompt).not.toContain("<h3>Scenario:");
    expect(prompt).toContain("Homeowner A/B");
    expect(prompt).not.toContain("NO DUPLICATE HYPOTHETICAL");
  });

  it("non-illustrative body section forbids duplicate hypothetical blockquote", () => {
    const prompt = generateSingleSectionPrompt(
      {
        id: "body-2",
        step: 3,
        title: "Blinds Costs in the St. Albert Area",
        description: "Cost drivers",
        features: ["[NUMBERS]: cost bands"],
        headingLevel: 1,
      },
      "html",
    );
    expect(prompt).toContain("NO DUPLICATE HYPOTHETICAL");
    expect(prompt).not.toContain("ILLUSTRATIVE OUTPUT SHAPE");
    expect(prompt).toContain("FIELD OBSERVATION");
    expect(prompt).toContain("If {named constraint}, choose {option}");
  });

  it("recommendation section prompt maps Best-for list plus connected business name", () => {
    const prompt = generateSingleSectionPrompt(
      {
        id: "body-3",
        step: 4,
        title: "Our Pick [RECOMMENDATION]",
        description: "What to buy",
        features: ["[RECOMMENDATION]: explicit site recommendation"],
        headingLevel: 1,
      },
      "html",
    );
    expect(prompt).toContain("so what should I actually buy");
    expect(prompt).toContain("Best for {job}: {option}");
    expect(prompt).toContain("connected business name");
    expect(prompt).toContain("FIELD OBSERVATION");
  });
});

describe("connected-site system prompt", () => {
  it("includes A-Level connected-site article rule", async () => {
    const prompt = await buildSystemPrompt(
      "",
      "test-key",
      { name: "Advance Blinds", siteUrl: "https://advanceblinds.ca" },
      undefined,
      undefined,
      undefined,
      undefined,
      "custom blinds",
    );
    expect(prompt).toContain("A-LEVEL CONNECTED-SITE ARTICLE");
    expect(prompt).toContain("A-LEVEL DECISION PRECISION");
    expect(prompt).toContain("FACTUAL VERIFICATION");
    expect(prompt).toContain("DEFENSIBLE SPECIFICITY");
    expect(prompt).toContain("FACTUAL VERIFICATION");
    expect(prompt).toContain("When does [key spec/tier] actually matter?");
    expect(prompt).toContain("so what should I actually buy");
    expect(prompt).toContain("If-X-choose-Y");
    expect(prompt).toContain("ILLUSTRATIVE PERSONA + SITE RECOMMENDATION");
    expect(prompt).toContain("ILLUSTRATIVE OUTPUT SHAPE");
  });
});
