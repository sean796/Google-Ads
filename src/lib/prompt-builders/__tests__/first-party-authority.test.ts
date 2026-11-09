import { describe, expect, it } from "vitest";
import {
  FIRST_PARAGRAPH_AUTHORITY_RULE,
  FIRST_PARTY_AUTHORITY_WRITING_RULE,
  BUSINESS_CONTACT_CAP_RULE,
  A_PLUS_HOMEOWNER_ARTICLE_RULE,
  AISO_DEPTH_RULE,
  INSTALLER_EXPERTISE_GATE_RULE,
  FORBIDDEN_HOLLOW_AUTHORITY_RULE,
  FIELD_OBSERVATION_RULE,
  NAMED_PRODUCT_LINE_RULE,
  PHRASE_VARIATION_RULE,
  SERVICE_AREA_DENSITY_RULE,
  ILLUSTRATIVE_BLOCKQUOTE_RULE,
  buildConnectedSiteIdentityBlock,
  buildFirstPartyAuthorityPromptBlock,
  firstPartyAuthorityBlockFromBrief,
  formatChatGptBusinessFactsPromptBlock,
  formatIllustrativeExamplePromptBlock,
  formatIllustrativePersonaPromptBlock,
  formatVerifiedFactsPromptBlock,
  formatSiteUsedOpenersPromptBlock,
  swotTextFromResearchFields,
} from "@/lib/content-optimization/first-party-authority-prompt";
import { AUTHENTICITY_WRITER_RULE } from "@/lib/prompt-builders/core";
import { buildSystemPrompt, buildBulkHarnessSectionUserPrompt } from "@/lib/prompt-builders/system-user";
import { buildChatGptCompanyAuthorityUserPrompt, DATAFORSEO_LLM_PROMPT_MAX } from "@/lib/llm-audit/llm-audit-dataforseo";
import { buildChecklistPromptMessages } from "@/lib/post-creator/post-creator-generator-prompts";
import type { SeoContentBriefV1 } from "@/lib/overview-seo-content-brief";

describe("first-party authority prompt blocks", () => {
  it("requires every claim and ChatGPT business facts", () => {
    const block = buildFirstPartyAuthorityPromptBlock({
      claims: [{ text: "We have years of experience with custom installs.", source: "chatgpt" }],
      chatGptFacts: "Advance Blinds runs the I See IP program.",
    });
    expect(block).toContain("FIRST-PARTY AUTHORITY");
    expect(block).toContain("MANDATORY CHATGPT BUSINESS FACTS");
    expect(block).toContain("I See IP");
    expect(block).toContain("include every item about this connected site");
    expect(block).toContain("Do not copy street address");
    expect(block).not.toMatch(/847/);
  });

  it("omits ChatGPT facts block when empty", () => {
    expect(formatChatGptBusinessFactsPromptBlock("")).toBe("");
    const fromBrief = firstPartyAuthorityBlockFromBrief({} as SeoContentBriefV1, "");
    expect(fromBrief).toContain("FIRST-PARTY AUTHORITY");
    expect(fromBrief).not.toContain("--- MANDATORY CHATGPT BUSINESS FACTS");
  });

  it("formatVerifiedFactsPromptBlock lists confirmed, contradicted, and not_found rows", () => {
    const block = formatVerifiedFactsPromptBlock(
      [
        {
          claimLabel: "Alberta provincial solar rebate",
          status: "contradicted",
          fact: "No active provincial solar rebate program as of August 2026.",
          sourceUrl: "https://www.alberta.ca/solar",
          sourceDomain: "alberta.ca",
          asOf: "August 2026",
        },
        {
          claimLabel: "Panel efficiency tiers",
          status: "confirmed",
          fact: "Standard modules about 19-21%; high-efficiency about 22-24%.",
          sourceUrl: "https://www.nrel.gov/",
          sourceDomain: "nrel.gov",
          asOf: "August 2026",
        },
        {
          claimLabel: "Edmonton sun hours",
          status: "not_found",
          fact: "",
          sourceUrl: "",
          sourceDomain: "",
          asOf: "August 2026",
        },
      ],
      "August 2026",
    );
    expect(block).toContain("VERIFIED FACTS");
    expect(block).toContain("CONFIRMED");
    expect(block).toContain("publish prominently");
    expect(block).toContain("CONTRADICTED");
    expect(block).toContain("replace stale");
    expect(block).toContain("NOT FOUND");
    expect(block).toContain("No active provincial solar rebate");
    expect(block).toContain("19-21%");
  });

  it("firstPartyAuthorityBlockFromBrief injects verified facts before claims", () => {
    const block = firstPartyAuthorityBlockFromBrief({
      version: 1,
      generatedAt: "2026-08-01",
      focusKeyword: "solar",
      queryFanout: {
        queries: [],
        namedPrograms: [],
        researchAsOf: "August 2026",
        verifiedFacts: [
          {
            claimLabel: "Alberta rebate status",
            status: "contradicted",
            fact: "Provincial rebate ended.",
            sourceUrl: "https://www.alberta.ca/",
            sourceDomain: "alberta.ca",
            asOf: "August 2026",
          },
        ],
      },
    } as SeoContentBriefV1);
    expect(block.indexOf("VERIFIED FACTS")).toBeLessThan(block.indexOf("FIRST-PARTY AUTHORITY"));
    expect(block).toContain("Provincial rebate ended");
  });

  it("firstPartyAuthorityBlockFromBrief omits illustrative persona from stored brief", () => {
    const block = firstPartyAuthorityBlockFromBrief({
      version: 1,
      generatedAt: "2026-08-01",
      focusKeyword: "solar",
      queryFanout: {
        queries: [],
        namedPrograms: [],
        illustrativeExample: {
          leadIn: "Hypothetical scenario:",
          quoteBody: "legacy",
          asOf: "August 2026",
          personaName: "Quinn",
          scenarioNarrative: "Quinn has young kids.",
          recommendationParagraph: "Advance Blinds would quote dual-layer cellulars.",
        },
      },
    } as SeoContentBriefV1);
    expect(block).toContain("FIRST-PARTY AUTHORITY");
    expect(block).not.toContain("ILLUSTRATIVE EXAMPLE");
    expect(block).not.toContain("Quinn");
  });

  it("formatIllustrativeExamplePromptBlock includes structured example fields", () => {
    const block = formatIllustrativeExamplePromptBlock({
      version: 1,
      generatedAt: "2026-08-01",
      focusKeyword: "solar",
      queryFanout: {
        queries: [],
        namedPrograms: [],
        illustrativeExample: {
          leadIn: "Hypothetical scenario:",
          quoteBody: "legacy",
          asOf: "August 2026",
          illustrativeH2Title: "Choosing Panels",
          personaName: "Quinn",
          householdProfile: "family with young children",
          situationHook: "street-facing bedroom privacy",
          scenarioQuestion: "How does a family in St. Albert add privacy to street-facing bedrooms?",
          scenarioNarrative: "Quinn has young kids and street-facing bedrooms in Lacombe Park.",
          recommendationTitle: "Dual-layer cellular shades",
          recommendationParagraph: "Advance Blinds would quote dual-layer cellulars for filtered light and evening privacy.",
        },
      },
    } as SeoContentBriefV1);
    expect(block).toContain("ILLUSTRATIVE EXAMPLE (MANDATORY");
    expect(block).toContain("personaName (only person in section): Quinn");
    expect(block).toContain("scenarioNarrative");
    expect(block).toContain("recommendationParagraph");
    expect(block).toContain("Persona decision must match Keyword + Answer topic");
    expect(block).toContain("keyword+location slug");
    expect(block).toContain("Choosing Panels");
    expect(block).toContain("SITE-FIRST");
    expect(block).toContain("would recommend");
    expect(block).toContain("Forbidden: a place name cite on top of the blockquote");
  });

  it("formatIllustrativePersonaPromptBlock requires the city [[LINK]] inside the quote", () => {
    const block = formatIllustrativePersonaPromptBlock(
      {
        leadIn: "Hypothetical scenario:",
        quoteBody: "legacy",
        asOf: "September 2026",
        illustrativeH2Title: "Gulf Light And Glare",
        personaName: "Eleanor",
        scenarioNarrative: "Eleanor is redecorating her Park Shore condo.",
        recommendationParagraph: "Lindsey Blinds would recommend solar roller shades.",
      },
      "September 2026",
      { pageTitle: "Park Shore Window Treatments", anchor: "Park Shore" },
    );
    expect(block).toContain("[[LINK:Park Shore Window Treatments|Park Shore]]");
    expect(block).toContain("required inside the blockquote sentence");
    expect(block).toContain("Forbidden: a location cite as the first child of the blockquote");
  });

  it("reads SWOT prose but not a version-1 brief as SWOT", () => {
    expect(
      swotTextFromResearchFields({
        promptModifier: "Strength: local installs.",
        seoResearch: JSON.stringify({ version: 1, focusKeyword: "blinds" }),
      }),
    ).toBe("Strength: local installs.");
    expect(
      swotTextFromResearchFields({
        seoResearch: "ChatGPT SWOT: years of experience, no install count listed.",
      }),
    ).toContain("years of experience");
  });
});

describe("business contact cap", () => {
  it("limits contact details to Answer, one middle anchor, and the final paragraph", () => {
    expect(BUSINESS_CONTACT_CAP_RULE).toContain("at most 3 times");
    expect(BUSINESS_CONTACT_CAP_RULE).toContain("Answer paragraph");
    expect(BUSINESS_CONTACT_CAP_RULE).toContain("[ILLUSTRATIVE] recommendation paragraph");
    expect(BUSINESS_CONTACT_CAP_RULE).toContain("final paragraph of the last body section");
    expect(FIRST_PARTY_AUTHORITY_WRITING_RULE).toContain("BUSINESS CONTACT CAP slots");
  });
});

describe("opener contract", () => {
  it("includes installer expertise gate with self-check question", () => {
    expect(INSTALLER_EXPERTISE_GATE_RULE).toContain(
      "Does this section contain information that only a knowledgeable provider",
    );
    expect(INSTALLER_EXPERTISE_GATE_RULE).not.toContain("Ridgeline");
    expect(FIRST_PARTY_AUTHORITY_WRITING_RULE).toContain("FORBIDDEN HOLLOW AUTHORITY");
    expect(FIRST_PARTY_AUTHORITY_WRITING_RULE).toContain("concrete field detail");
  });

  it("forbids hollow our team filler", () => {
    expect(FORBIDDEN_HOLLOW_AUTHORITY_RULE).toContain("our team");
    expect(FORBIDDEN_HOLLOW_AUTHORITY_RULE).toContain("concrete");
    expect(INSTALLER_EXPERTISE_GATE_RULE).toContain("FORBIDDEN HOLLOW AUTHORITY");
  });

  it("requires city-plus-constraint field observations and sourced product lines", () => {
    expect(FIELD_OBSERVATION_RULE).toContain("named constraint");
    expect(FIELD_OBSERVATION_RULE).toContain("campaign scope");
    expect(FIELD_OBSERVATION_RULE).toContain("we recommend {option from sources} when");
    expect(FIELD_OBSERVATION_RULE).not.toContain("Ridgeline");
    expect(INSTALLER_EXPERTISE_GATE_RULE).toContain("FIELD OBSERVATION");
    expect(NAMED_PRODUCT_LINE_RULE).toContain("at least twice");
    expect(NAMED_PRODUCT_LINE_RULE).toContain("If no named line appears in sources, omit");
    expect(FIRST_PARTY_AUTHORITY_WRITING_RULE).toContain("NAMED PRODUCT LINES");
    expect(AISO_DEPTH_RULE).toContain("FIELD OBSERVATION");
  });

  it("does not force the exact keyword in sentence one", () => {
    expect(FIRST_PARAGRAPH_AUTHORITY_RULE).toContain("Stat and fact first");
    expect(FIRST_PARAGRAPH_AUTHORITY_RULE).toContain("belongs to THIS heading");
    expect(FIRST_PARAGRAPH_AUTHORITY_RULE).not.toContain("MUST directly address the primary keyword in its opening sentence");
    expect(FIRST_PARTY_AUTHORITY_WRITING_RULE).toContain("Never invent install counts");
    expect(FIRST_PARTY_AUTHORITY_WRITING_RULE).toContain("source gbp or master");
    expect(FIRST_PARTY_AUTHORITY_WRITING_RULE).toContain("except ChatGPT street address");
    expect(FIRST_PARTY_AUTHORITY_WRITING_RULE).toContain("Never copy a ChatGPT street address");
    expect(FIRST_PARTY_AUTHORITY_WRITING_RULE).toContain("this connected site's city");
    expect(FIRST_PARTY_AUTHORITY_WRITING_RULE).toContain("If a source says a program is closed, say it is closed");
    expect(FIRST_PARTY_AUTHORITY_WRITING_RULE).toContain("Never invent payback figures");
    expect(FIRST_PARTY_AUTHORITY_WRITING_RULE).not.toMatch(/CEIP|Greener Homes|0\.30\/kWh/i);
    expect(AUTHENTICITY_WRITER_RULE).toContain("this connected site's city");
    expect(AUTHENTICITY_WRITER_RULE).toContain("If a source says a program is closed, say it is closed");
    expect(formatChatGptBusinessFactsPromptBlock("Program note.")).toContain(
      "Discard grants, loans, and rates from another province",
    );
    expect(PHRASE_VARIATION_RULE).toContain("Do not repeat the same sentence stem");
  });

  it("caps service city mentions at 2 per section", () => {
    expect(SERVICE_AREA_DENSITY_RULE).toContain("at most **2 times**");
    expect(SERVICE_AREA_DENSITY_RULE).toContain("place entity");
    expect(SERVICE_AREA_DENSITY_RULE).toContain("at most **~3** exact mentions");
    expect(SERVICE_AREA_DENSITY_RULE).toContain("A+ KEYWORD AUTHORITY");
    const block = buildConnectedSiteIdentityBlock("Ridgeline Solar", "Edmonton, Alberta");
    expect(block).toContain("Ridgeline Solar");
    expect(block).toContain("SERVICE AREA DENSITY");
    expect(block).toContain("Lead with a sourced fact or stat");
    expect(block).toContain("In Answer, mention this exact business name somewhere in the Answer paragraph");
    expect(block).not.toContain("at least once in the intro and once in the body");
    expect(block).not.toContain("Open the intro by establishing who we are");
  });

  it("lists sibling lead sentences so new intros do not copy them", () => {
    const block = formatSiteUsedOpenersPromptBlock(
      [
        {
          excerpt: "<p>Smart blinds automation offers automated control over window coverings.</p>",
          link: "https://blindmagic.com/blog/smart-blinds-automation/",
        },
        {
          excerpt: "Custom drapery services offer tailored window treatments.",
          link: "https://blindmagic.com/blog/custom-drapery-services/",
        },
        {
          excerpt: "Smart blinds automation offers automated control over window coverings.",
          link: "https://blindmagic.com/blog/dup/",
        },
      ],
      "https://blindmagic.com/blog/custom-drapery-services/",
    );
    expect(block).toContain("ALREADY USED OPENERS ON THIS SITE");
    expect(block).toContain("Smart blinds automation offers automated control");
    expect(block).not.toContain("Custom drapery services offer tailored");
  });

  it("full-article system prompt injects already-used openers from post excerpts", async () => {
    const prompt = await buildSystemPrompt(
      "",
      "test-key",
      { name: "Blind Magic", siteUrl: "https://blindmagic.com" },
      [
        {
          id: 1,
          slug: "smart-blinds",
          title: "Smart Blinds",
          excerpt: "Smart blinds automation offers automated control over window coverings.",
          link: "https://blindmagic.com/blog/smart-blinds-automation/",
          date_gmt: "2026-08-25",
        },
      ],
      undefined,
      undefined,
      undefined,
      "smart blinds",
    );
    expect(prompt).toContain("ALREADY USED OPENERS ON THIS SITE");
    expect(prompt).toContain("Smart blinds automation offers automated control");
  });

  it("full-article system prompt uses the authority opener", async () => {
    const prompt = await buildSystemPrompt(
      "",
      "test-key",
      { name: "Advance Blinds", siteUrl: "https://advanceblinds.ca" },
      undefined,
      undefined,
      undefined,
      undefined,
      "custom blinds edmonton",
    );
    expect(prompt).toContain("FIRST PARAGRAPH RULE");
    expect(prompt).toContain("Stat and fact first");
    expect(prompt).not.toContain("MUST directly address the primary keyword in its opening sentence");
  });

  it("injects first-party block into harness section user prompt", () => {
    const prompt = buildBulkHarnessSectionUserPrompt(
      "Article Title",
      "Focused guide",
      "## Alpha Topic\n\nBody",
      "outline",
      ["Beta Topic"],
      1,
      3,
      { name: "Site", siteUrl: "https://example.com" },
      undefined,
      undefined,
      true,
      "https://example.com/post/",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "Alpha Topic",
      "custom blinds",
      ["Overview", "Alpha Topic", "Beta Topic"],
      undefined,
      undefined,
      "--- MANDATORY CHATGPT BUSINESS FACTS (non-negotiable; do not omit) ---\nWe install I See IP.\n--- END MANDATORY CHATGPT BUSINESS FACTS ---",
    );
    expect(prompt).toContain("MANDATORY CHATGPT BUSINESS FACTS");
    expect(prompt).toContain("PHRASE VARIATION");
    expect(prompt).toContain("Forbidden stacked openers");
    expect(prompt).toContain("AISO SEMANTIC BREADTH");
    const gateIdx = prompt.indexOf("INSTALLER EXPERTISE GATE");
    const aplusIdx = prompt.indexOf("A+ HOMEOWNER ARTICLE");
    const keywordIdx = prompt.indexOf("A+ KEYWORD AUTHORITY");
    const aisoIdx = prompt.indexOf("AISO AUTHORITY PHRASING");
    const depthIdx = prompt.indexOf("AISO DEPTH");
    const breadthIdx = prompt.indexOf("AISO SEMANTIC BREADTH");
    const authIdx = prompt.indexOf("AUTHENTICITY (NON-NEGOTIABLE)");
    expect(gateIdx).toBeGreaterThanOrEqual(0);
    expect(aplusIdx).toBeGreaterThan(gateIdx);
    expect(keywordIdx).toBeGreaterThan(aplusIdx);
    expect(aisoIdx).toBeGreaterThan(keywordIdx);
    expect(depthIdx).toBeGreaterThan(aisoIdx);
    expect(breadthIdx).toBeGreaterThan(depthIdx);
    expect(authIdx).toBeGreaterThan(breadthIdx);
    expect(A_PLUS_HOMEOWNER_ARTICLE_RULE).toContain("Worth-the-extra-cost H2");
  });
});

describe("buildChatGptCompanyAuthorityUserPrompt", () => {
  it("stays under 500 chars and names the business", () => {
    const prompt = buildChatGptCompanyAuthorityUserPrompt({
      companyName: "Advance Blinds",
      location: "Edmonton, AB",
      topic: "I See IP",
      namedProgram: "I See IP",
      siteUrl: "https://advanceblinds.ca/",
    });
    expect(prompt.length).toBeLessThanOrEqual(DATAFORSEO_LLM_PROMPT_MAX);
    expect(prompt).toContain("Advance Blinds");
    expect(prompt).toContain("https://advanceblinds.ca");
    expect(prompt.toLowerCase()).toContain("i see ip");
    expect(prompt.toLowerCase()).toContain("same-name");
    expect(prompt.toLowerCase()).not.toContain("no businesses");
    expect(prompt.toLowerCase()).toContain("no invented numbers");
  });
});

describe("post creator checklist opener", () => {
  it("marks first-party authority on the intro example", () => {
    const { system } = buildChecklistPromptMessages({
      title: "Custom Blinds",
      keywordData: {
        keyword: "custom blinds edmonton",
        searchVolume: 100,
        difficulty: 20,
        intent: "commercial",
        cpc: 0,
        competition: "LOW",
        relatedKeywords: [],
        serpFeatures: [],
      },
      selectedKeywords: ["custom blinds edmonton"],
      selectedH2Sections: ["How to Choose"],
      connectedSite: { name: "Advance Blinds", siteUrl: "https://advanceblinds.ca" },
      firstPartyAuthorityBlock: buildFirstPartyAuthorityPromptBlock({
        claims: [{ text: "We have years of experience.", source: "swot" }],
        chatGptFacts: "Official I See IP program.",
      }),
    });
    expect(system).toContain("[FIRST-PARTY AUTHORITY]");
    expect(system).toContain("not keyword-first");
    expect(system).toContain("MANDATORY CHATGPT BUSINESS FACTS");
  });
});
