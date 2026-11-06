import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildBlueprintPromptMessages,
  buildChecklistPromptMessages,
  buildKeywordAnalysisSystemPrompt,
  buildKeywordAnalysisUserPrompt,
} from "@/lib/post-creator/post-creator-generator-prompts";
import { parseBlogTemplateChecklist, extractChecklistItemTitle, rewriteChecklistItemHeading } from "@/lib/post-creator/post-creator-checklist-post-process";

const fixture = {
  title: "Alta Window Fashions Explained",
  keywordData: {
    keyword: "alta window fashions",
    searchVolume: 1200,
    difficulty: 42,
    cpc: 1.5,
    competition: "MEDIUM" as const,
    intent: "informational" as const,
    relatedKeywords: [],
    serpFeatures: [],
  },
  selectedKeywords: ["alta blinds", "motorized shades"],
  selectedH2Sections: ["Why Alta Window Fashions Matter", "Smart Home Integration"],
  userPrompt: "Focus on Calgary homeowners.",
  connectedSite: { name: "Advance Blinds", siteUrl: "https://advanceblinds.ca" },
  wordPressPosts: [
    {
      title: "Hunter Douglas vs Alta",
      link: "https://advanceblinds.ca/blog/hunter-douglas-vs-alta",
      excerpt: "Compare brands",
    },
  ],
  bucketReadFirstBlock: "",
};

describe("post-creator-generator-prompts", () => {
  it("builds checklist prompts without ## examples in system", () => {
    const { system, user } = buildChecklistPromptMessages(fixture);
    expect(system).toContain("Do NOT use ## markdown headings");
    expect(system).toContain("INTERNAL LINK TARGETS");
    expect(system).toContain("FOCUS KEYWORD DENSITY");
    expect(user).toContain("5-6 checklist items");
    expect(user).toContain("SERP H2 OUTLINE");
    expect(user).not.toContain("ARTICLE CONTENT TYPE");
    expect(user).not.toContain("type-skeleton");
    expect(system).toContain("[DECISION]");
    expect(system).toContain("[TRADEOFF]");
    expect(system).toContain("AUTHENTICITY CHECKLIST");
    expect(system).not.toMatch(/^## /m);
  });

  it("uses SAP page template when entity is set", () => {
    const { system, user } = buildChecklistPromptMessages({
      ...fixture,
      entity: "Ben Hill, Atlanta",
    });
    expect(user).toContain("SAP PAGE TEMPLATE");
    expect(user).toContain("Product | Best for | Budget | Reason");
    expect(user).toContain("6-7 checklist items");
    expect(system).toContain("Recommendation in Ben Hill, Atlanta");
    expect(system).not.toContain("Sunlight And Privacy Challenges");
    expect(system).not.toContain("Our Recommendation for Homeowners");
    expect(user).not.toContain("how it works, vs adjacent, apply, measure");
  });

  it("builds blueprint prompts with intro rename rule", () => {
    const { system } = buildBlueprintPromptMessages({
      title: fixture.title,
      purpose: "Guide to alta window fashions",
      keyword: "alta window fashions",
      checklist: ["Why Alta Window Fashions Matter [EXACT PRIMARY PER H2]"],
      connectedSite: fixture.connectedSite,
      wordPressPosts: fixture.wordPressPosts,
    });
    expect(system).toContain("Rename Introduction/Intro");
    expect(system).toContain("Blueprint Architect");
  });

  it("matches exported PHP snapshot markers", () => {
    const snapshotPath = path.join(
      process.cwd(),
      "wordpress-plugins/neo-pulse-app/includes/agent-runs/prompts/.generator-prompt-snapshot.json",
    );
    if (!fs.existsSync(snapshotPath)) return;
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as {
      checklistSystemMarkers?: string[];
    };
    const { system } = buildChecklistPromptMessages(fixture);
    for (const marker of snapshot.checklistSystemMarkers ?? []) {
      expect(system).toContain(marker);
    }
  });

  it("extracts H2 title before harness markers", () => {
    const item =
      "Tax Implications of Your RRSP Beneficiary Choice [STRUCTURE]: 1-2 paragraphs. [EXACT PRIMARY PER H2]. [LINK]: 3-5 links.";
    expect(extractChecklistItemTitle(item)).toBe(
      "Tax Implications of Your RRSP Beneficiary Choice",
    );
    expect(extractChecklistItemTitle("1. ## Why Alta Matters [STRUCTURE]: 2 paragraphs.")).toBe(
      "Why Alta Matters",
    );
  });

  it("unwraps Create an H2 section agent instruction boilerplate", () => {
    expect(
      extractChecklistItemTitle(
        'Create an H2 section agent with the header "Optimizing Your Website for Window Installation Searches".',
      ),
    ).toBe("Optimizing Your Website for Window Installation Searches");
    expect(
      extractChecklistItemTitle(
        'Create an H2 section agent with the header "Attracting Local Clients with Window Installation SEO". [STRUCTURE]: 2 paragraphs.',
      ),
    ).toBe("Attracting Local Clients with Window Installation SEO");
    expect(
      extractChecklistItemTitle('Create an agent for H2 "Smart Home Integration". [LINK]: 3-5 links.'),
    ).toBe("Smart Home Integration");
    expect(
      extractChecklistItemTitle(
        'Create an H2 section titled "Core Digital Marketing Channels for Window Businesses".',
      ),
    ).toBe("Core Digital Marketing Channels for Window Businesses");
    expect(
      extractChecklistItemTitle(
        'Create an H2 section agent for "Boosting Visibility: SEO for Window Contractors".',
      ),
    ).toBe("Boosting Visibility: SEO for Window Contractors");
    expect(
      extractChecklistItemTitle(
        'Create a first section agent with the SEO-friendly header: "Why Digital Marketing Matters for Window Companies". [STRUCTURE]: 2 paragraphs.',
      ),
    ).toBe("Why Digital Marketing Matters for Window Companies");
    expect(
      extractChecklistItemTitle(
        'Create the first section agent with an active, SEO-friendly header like "Your Guide to Blinds in Edmonton, AB". [STRUCTURE]: 2 paragraphs.',
      ),
    ).toBe("Your Guide to Blinds in Edmonton, AB");
    expect(
      extractChecklistItemTitle('Create an agent for the H2 section "What We Offer". [LINK]: 3-5 links.'),
    ).toBe("What We Offer");
    expect(
      extractChecklistItemTitle(
        'Create an agent for an H2 section focusing on a key product type or benefit relevant to blinds in Edmonton, for example, "Energy-Efficient Window Treatments for Alberta Homes". [STRUCTURE]: 2 paragraphs.',
      ),
    ).toBe("Energy-Efficient Window Treatments for Alberta Homes");
  });

  it("rewrites checklist lines to drop instruction boilerplate", () => {
    const raw =
      '1. Create a first section agent with the SEO-friendly header: "Why Digital Marketing Matters for Window Companies". [STRUCTURE]: 2 paragraphs. [LINK]: 3-5 links.';
    const parsed = parseBlogTemplateChecklist(raw);
    expect(parsed[0]).toContain("[STRUCTURE]");
    expect(parsed[0]).toContain("Why Digital Marketing Matters for Window Companies");
    expect(
      rewriteChecklistItemHeading(
        'Create a first section agent with the SEO-friendly header: "Why Digital Marketing Matters for Window Companies".',
      ),
    ).toBe("Why Digital Marketing Matters for Window Companies");
  });

  it("strips ## from parsed checklist lines", () => {
    const raw = [
      "1. ## Experience the Future of Window Coverings [STRUCTURE]: 2 paragraphs.",
      "2. Why Alta Window Fashions Matter [EXACT PRIMARY PER H2] [LINK]: 3-5 links.",
      "3. **Bold only:** stray bullet without markers.",
      "4. Installation Steps [LIST]: number steps [TABLE]: compare.",
      "5. Conclusion with alta window fashions [EXACT PRIMARY PER H2].",
    ].join("\n");
    const parsed = parseBlogTemplateChecklist(raw);
    expect(parsed.length).toBeGreaterThanOrEqual(4);
    for (const item of parsed) {
      expect(item).not.toMatch(/^##\s/);
      expect(item).not.toMatch(/^\*\*[^*]+\*\*:\s*$/);
    }
    expect(parsed[0]).toContain("Experience the Future");
    expect(parsed.some((i) => i.includes("[TABLE]"))).toBe(true);
  });

  it("exports keyword analysis prompt shape", () => {
    expect(buildKeywordAnalysisSystemPrompt()).toContain("JSON");
    expect(buildKeywordAnalysisSystemPrompt()).toContain("buyer-decision");
    const user = buildKeywordAnalysisUserPrompt("alta window fashions", "{}");
    expect(user).toContain("alta window fashions");
    expect(user).toContain("buyer-decision");
    expect(user).toContain("how to choose");
  });

  it("copies decision markers into blueprint agent features", () => {
    const { system } = buildBlueprintPromptMessages({
      title: fixture.title,
      purpose: "Focused guide (max 3200 words) about alta window fashions",
      keyword: "alta window fashions",
      checklist: ["How to Choose Alta [DECISION]: chooser table [EXACT PRIMARY PER H2]"],
      connectedSite: fixture.connectedSite,
      wordPressPosts: fixture.wordPressPosts,
    });
    expect(system).toContain("[DECISION]");
    expect(system).toContain("[TRADEOFF]");
  });

  it("PHP generator prompts do not contain the destroyed generic skeleton", () => {
    const phpPath = path.join(
      process.cwd(),
      "wordpress-plugins/neo-pulse-app/includes/agent-runs/prompts/post-creator-generator-prompts.php",
    );
    const php = fs.readFileSync(phpPath, "utf8");
    expect(php).not.toContain("introduction-style");
    expect(php).not.toContain("Conclusion and Next Steps");
    expect(php).toContain("SERP H2 OUTLINE");
    expect(php).toContain("SAP PAGE TEMPLATE");
  });
});
