import { describe, expect, it } from "vitest";
import {
  GLOBAL_FORBIDDEN_WORDS,
  GLOBAL_FORBIDDEN_PHRASES,
  GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK,
  appendUniversalContentRulesToSystemPrompt,
  buildBlacklistRagBlock,
  enforceForbiddenWordsOnBlueprint,
  enforceForbiddenWordsOnBlueprintAgents,
  enforceForbiddenWordsOnChecklist,
  formatBlueprintFileContent,
  formatChecklistFileContent,
  injectBlacklistRagIntoMessages,
  prependBlacklistRagToUserPrompt,
  sanitizeForbiddenHeadingTitle,
  prepareChecklistForPipeline,
  sanitizeForbiddenWordsInChecklistItem,
  sanitizeForbiddenWordsInPromptText,
  listForbiddenWordViolations,
  scrubForbiddenWordsFromHtml,
  sectionHtmlHasForbiddenWords,
} from "../content-word-blocklist";

describe("GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK", () => {
  it("contains no em dash (U+2014) in blacklist copy", () => {
    expect(GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK).not.toMatch(/\u2014/);
  });

  it("includes crucial, vital, and understanding/crucial sentence-shape rule", () => {
    expect(GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK).toMatch(/crucial/i);
    expect(GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK).toMatch(/vital/i);
    expect(GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK).toMatch(/is crucial for/i);
    expect(GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK).toMatch(/is vital for/i);
    expect(GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK).toMatch(/understanding these reforms is crucial/i);
  });

  it("includes understand word-frequency cap", () => {
    expect(GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK).toMatch(/understand/i);
    expect(GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK).toMatch(/hard maximum 2/i);
    expect(GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK).toMatch(/at most \*\*once\*\* per full article/i);
  });

  it("lists key AI filler words", () => {
    expect(GLOBAL_FORBIDDEN_WORDS).toContain("delve");
    expect(GLOBAL_FORBIDDEN_WORDS).toContain("leverage");
    expect(GLOBAL_FORBIDDEN_WORDS).toContain("crucial");
    expect(GLOBAL_FORBIDDEN_WORDS).toContain("vital");
  });

  it("blacklists common AI template phrases", () => {
    expect(GLOBAL_FORBIDDEN_PHRASES).toContain("our team");
    expect(GLOBAL_FORBIDDEN_PHRASES).toContain("this article provides");
    expect(GLOBAL_FORBIDDEN_PHRASES).toContain("when it comes to");
    expect(GLOBAL_FORBIDDEN_PHRASES).toContain("we often find");
    expect(GLOBAL_FORBIDDEN_PHRASES).toContain("we frequently recommend that");
    expect(GLOBAL_FORBIDDEN_PHRASES).not.toContain("we frequently recommend");
    expect(GLOBAL_FORBIDDEN_PHRASES).toContain("this guide walks through");
    expect(GLOBAL_FORBIDDEN_PHRASES).toContain("families can review");
    expect(GLOBAL_FORBIDDEN_PHRASES).toContain("tailored to your needs");
    expect(GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK).toMatch(/dictionary definition/i);
  });
});

describe("enforceForbiddenWordsOnChecklist", () => {
  it("sanitizes lines without appending blacklist text", () => {
    const out = enforceForbiddenWordsOnChecklist(["Create H2 section.", "Add FAQ table."]);
    expect(out).toHaveLength(2);
    expect(out[0]).not.toMatch(/WORD BLACKLIST \(mandatory/i);
    expect(out[0]).not.toMatch(/\[FORBIDDEN_WORDS/i);
    expect(out[1]).not.toMatch(/\[FORBIDDEN_WORDS/i);
  });

  it("is idempotent", () => {
    const once = enforceForbiddenWordsOnChecklist(["Section one."]);
    const twice = enforceForbiddenWordsOnChecklist(once);
    expect(twice).toEqual(once);
  });
});

describe("enforceForbiddenWordsOnBlueprintAgents", () => {
  it("sanitizes titles and does not add blacklist features", () => {
    const agents = enforceForbiddenWordsOnBlueprintAgents([
      { title: "Understanding the 5 New PST Categories", features: ["[LINK]: 3-5 internal links"] },
      {
        title: "Section B",
        features: ["[FORBIDDEN_WORDS - MANDATORY GLOBAL]: WORD BLACKLIST (mandatory; all clients)"],
      },
    ]);
    expect(agents).toHaveLength(2);
    expect(agents[0].title).toBe("5 New PST Categories");
    expect(agents[0].features).toEqual(["[LINK]: 3-5 internal links"]);
    expect(agents[1].features).toEqual([]);
  });

  it("sanitizes banned words in feature and description text", () => {
    const agents = enforceForbiddenWordsOnBlueprintAgents([
      {
        title: "PST Expansion",
        description: "Advises on navigating the 2026 rules which is crucial for compliance.",
        features: [
          "[STRUCTURE]: proactive tax planning is key to navigating complex changes.",
        ],
      },
    ]);
    expect(agents[0].description).not.toMatch(/navigating|crucial/i);
    expect(agents[0].features[0]).not.toMatch(/navigating/i);
    expect(String(agents[0].features[0])).toMatch(/managing complex changes/i);
  });

  it("is idempotent", () => {
    const once = enforceForbiddenWordsOnBlueprintAgents([{ title: "Navigating Compliance", features: [] }]);
    const twice = enforceForbiddenWordsOnBlueprintAgents(once);
    expect(twice).toEqual(once);
  });
});

describe("enforceForbiddenWordsOnBlueprint", () => {
  it("sanitizes agents without setting forbiddenWordsPolicy on in-memory object", () => {
    const out = enforceForbiddenWordsOnBlueprint({
      title: "Test",
      purpose: "Test purpose",
      agents: [{ title: "Understanding the 5 New PST Categories", features: ["[LINK]: 3-5 internal links"] }],
    });
    expect(out.forbiddenWordsPolicy).toBeUndefined();
    expect(out.agents![0].title).toBe("5 New PST Categories");
    expect(out.agents![0].features).toEqual(["[LINK]: 3-5 internal links"]);
  });
});

describe("sanitizeForbiddenHeadingTitle", () => {
  it("strips Understanding and Navigating prefixes", () => {
    expect(sanitizeForbiddenHeadingTitle("Understanding the 5 New PST Categories")).toBe(
      "5 New PST Categories",
    );
    expect(sanitizeForbiddenHeadingTitle("Navigating the 2026 BC PST Expansion")).toBe(
      "2026 BC PST Expansion",
    );
  });

  it("preserves Overview and clears FAQ-style titles", () => {
    expect(sanitizeForbiddenHeadingTitle("Overview")).toBe("Overview");
    expect(sanitizeForbiddenHeadingTitle("FAQ")).toBe("");
    expect(sanitizeForbiddenHeadingTitle("Answering Your Questions on Window Coverings")).toBe("");
  });
});

describe("appendUniversalContentRulesToSystemPrompt", () => {
  it("prepends blacklist once and is idempotent", () => {
    const input = "You are a writer.";
    const once = appendUniversalContentRulesToSystemPrompt(input);
    expect(once).toMatch(/^(\[FORBIDDEN_WORDS - MANDATORY GLOBAL\])/);
    expect(once).toMatch(/WORD BLACKLIST \(mandatory/i);
    expect(once).toContain(input);
    expect(once).toMatch(/Obey the WORD BLACKLIST block in the user message/i);
    expect(once.match(/WORD BLACKLIST \(mandatory/g)?.length).toBe(1);
    const twice = appendUniversalContentRulesToSystemPrompt(once);
    expect(twice).toBe(once);
  });
});

describe("blacklist RAG helpers", () => {
  it("buildBlacklistRagBlock wraps policy in read-only markers", () => {
    const block = buildBlacklistRagBlock();
    expect(block).toMatch(/=== WORD BLACKLIST \(READ ONLY/);
    expect(block).toMatch(/=== END WORD BLACKLIST ===/);
    expect(block).toMatch(/WORD BLACKLIST \(mandatory/i);
  });

  it("prependBlacklistRagToUserPrompt is idempotent", () => {
    const base = "Write section HTML.";
    const once = prependBlacklistRagToUserPrompt(base);
    expect(once.startsWith("=== WORD BLACKLIST (READ ONLY")).toBe(true);
    expect(once).toContain(base);
    expect(prependBlacklistRagToUserPrompt(once)).toBe(once);
  });

  it("injectBlacklistRagIntoMessages prepends only the first user message", () => {
    const messages = injectBlacklistRagIntoMessages([
      { role: "system", content: "System rules." },
      { role: "user", content: "Task one." },
      { role: "user", content: "Task two." },
    ]);
    expect(messages[0].content).toBe("System rules.");
    expect(messages[1].content).toMatch(/^=== WORD BLACKLIST \(READ ONLY/);
    expect(messages[1].content).toContain("Task one.");
    expect(messages[2].content).toBe("Task two.");
  });
});

describe("formatChecklistFileContent", () => {
  it("prepends full policy header once, numbered lines have no blacklist", () => {
    const out = formatChecklistFileContent(["Create H2 section.", "Add FAQ table."]);
    expect(out.startsWith("[FORBIDDEN_WORDS - MANDATORY GLOBAL]")).toBe(true);
    expect(out).toMatch(/WORD BLACKLIST \(mandatory/i);
    expect(out.indexOf("1. Create H2 section.")).toBeGreaterThan(0);
    expect(out.match(/WORD BLACKLIST \(mandatory/g)?.length).toBe(1);
    const numbered = out.split("\n").filter((l) => /^\d+\./.test(l));
    for (const line of numbered) {
      expect(line).not.toMatch(/\[FORBIDDEN_WORDS/i);
    }
  });
});

describe("formatBlueprintFileContent", () => {
  it("serializes forbiddenWordsPolicy once without per-agent blacklist features", () => {
    const raw = formatBlueprintFileContent({
      title: "Test",
      purpose: "Test purpose",
      agents: [
        {
          title: "Navigating Compliance",
          features: [
            "[LINK]: 3-5 internal links",
            "[FORBIDDEN_WORDS - MANDATORY GLOBAL]: WORD BLACKLIST (mandatory; all clients)",
          ],
        },
      ],
    });
    expect(raw.indexOf('"forbiddenWordsPolicy"')).toBeLessThan(raw.indexOf('"title"'));
    const parsed = JSON.parse(raw) as {
      forbiddenWordsPolicy: string;
      agents: Array<{ title: string; features: string[] }>;
    };
    expect(parsed.forbiddenWordsPolicy).toMatch(/WORD BLACKLIST \(mandatory/i);
    expect(parsed.agents[0].title).toBe("Compliance");
    expect(parsed.agents[0].features).toEqual(["[LINK]: 3-5 internal links"]);
    expect(
      parsed.agents[0].features.some(
        (f) => f.includes("[FORBIDDEN_WORDS") && f.includes("WORD BLACKLIST (mandatory"),
      ),
    ).toBe(false);
    expect(raw.match(/WORD BLACKLIST \(mandatory/g)?.length).toBe(1);
  });
});

describe("prepareChecklistForPipeline", () => {
  it("returns sanitized lines only, no blacklist appended", () => {
    const out = prepareChecklistForPipeline([
      "Create H2 section.",
      '[FAQ]: 2-column Q&A table for body section.',
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).not.toMatch(/WORD BLACKLIST \(mandatory/i);
    expect(out[0]).not.toMatch(/\[FORBIDDEN_WORDS/i);
  });

  it("drops checklist items with FAQ-style quoted H2 titles", () => {
    const out = prepareChecklistForPipeline([
      'Create agent for H2 "Motorized Options".',
      'Create agent for H2 "Answering Your Questions on Window Coverings".',
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("Motorized Options");
  });

  it("drops LLM audit authority dump rows that would become their own H2", () => {
    const out = prepareChecklistForPipeline([
      "CRA Online Mail for Individuals And Businesses [STRUCTURE]: 2 paragraphs.",
      "[LLM_AUDIT_AUTHORITY_LINK]: Weave [[EXTERNAL:https://www.edmonton.ca/|Edmonton]] mid-sentence.",
      "LLM Audit Authority Link 3 [STRUCTURE]: 2 paragraphs.",
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("CRA Online Mail");
  });

  it("slices SAP checklists to 7 items without rewriting titles", () => {
    const entity = "Virginia Park, AB";
    const extraRows = Array.from({ length: 10 }, (_, i) => `Extra topic ${i + 1} [STRUCTURE]: paragraph.`);
    const out = prepareChecklistForPipeline(extraRows, { sapEntity: entity });
    expect(out).toHaveLength(7);
    expect(out[0]).toContain("Extra topic 1");
    expect(out[6]).toContain("Extra topic 7");
    expect(out.join("\n")).not.toMatch(/Sunlight And Privacy Challenges/i);
  });
});

describe("sanitizeForbiddenWordsInChecklistItem", () => {
  it("rewrites e.g., for H2, and anchor text patterns", () => {
    const out = sanitizeForbiddenWordsInChecklistItem(
      'Use H2 e.g., "Understanding the 2026 BC PST Expansion" for H2 "Navigating Compliance" with anchor text like "understanding sales tax"',
    );
    expect(out).not.toMatch(/Understanding the 2026/i);
    expect(out).not.toMatch(/Navigating Compliance/i);
    expect(out).not.toMatch(/understanding sales tax/i);
  });

  it("rewrites **H2: Understanding** markdown headings", () => {
    const out = sanitizeForbiddenWordsInChecklistItem(
      "**H2: Understanding the 5 New PST Categories** [LIST]: bullets",
    );
    expect(out).toContain("**H2: 5 New PST Categories**");
    expect(out).not.toMatch(/Understanding the 5/i);
  });

  it("removes injected blacklist suffix", () => {
    const out = sanitizeForbiddenWordsInChecklistItem(
      "Create H2 section. [FORBIDDEN_WORDS - MANDATORY GLOBAL]: Apply global word blacklist.",
    );
    expect(out).toBe("Create H2 section.");
  });

  it("rewrites how we understand the area template phrasing", () => {
    const out = sanitizeForbiddenWordsInChecklistItem(
      '[LIST]: Include a bulleted list explaining how we understand the area.',
    );
    expect(out).not.toMatch(/how we understand the area/i);
    expect(out).toMatch(/how we serve businesses in the area/i);
  });
});

describe("scrubForbiddenWordsFromHtml", () => {
  it("removes crucial and importance-claim phrases from body", () => {
    const html =
      "<h2>5 New PST Categories</h2><p>Understanding these reforms is crucial for businesses to comply.</p>";
    const out = scrubForbiddenWordsFromHtml(html);
    expect(out).not.toMatch(/crucial/i);
    expect(out).not.toMatch(/Understanding these reforms is crucial/i);
  });

  it("fixes forbidden heading titles", () => {
    const html = "<h2>Understanding the 5 New PST Categories</h2><p>Body text.</p>";
    expect(scrubForbiddenWordsFromHtml(html)).toContain("<h2>5 New PST Categories</h2>");
  });

  it("keeps we-recommend-when lines and still flags we-often-find", () => {
    const keep =
      "<p>We recommend cellular shades when west glass overheats.</p>";
    expect(scrubForbiddenWordsFromHtml(keep)).toContain("We recommend cellular shades when");
    expect(listForbiddenWordViolations(keep)).toEqual([]);
    const hollow = "<p>We often find that homeowners prefer cellular shades.</p>";
    expect(listForbiddenWordViolations(hollow)).toContain("banned phrase: we often find");
    expect(scrubForbiddenWordsFromHtml(hollow)).not.toMatch(/we often find/i);
  });
});

describe("sectionHtmlHasForbiddenWords", () => {
  it("detects crucial in body and forbidden headings", () => {
    expect(sectionHtmlHasForbiddenWords("<h2>Overview</h2><p>This is crucial for success.</p>")).toBe(true);
    expect(
      sectionHtmlHasForbiddenWords("<h2>Understanding PST Rules</h2><p>Body.</p>"),
    ).toBe(true);
    expect(sectionHtmlHasForbiddenWords("<h2>PST Rules</h2><p>Businesses must register.</p>")).toBe(false);
  });

  it("detects understand when article limit exceeded", () => {
    expect(
      sectionHtmlHasForbiddenWords(
        "<ul><li><strong>Details</strong>: Understand the specifics of the expansion.</li></ul>",
        2,
      ),
    ).toBe(true);
    expect(
      listForbiddenWordViolations("<p>Understanding exemptions helps.</p>", { priorUnderstandCount: 2 }),
    ).toContain("understand-forms exceed article limit (3 > 2)");
  });
});

describe("sanitizeForbiddenWordsInPromptText", () => {
  it("replaces navigating and crucial in blueprint feature strings", () => {
    const out = sanitizeForbiddenWordsInPromptText(
      "[BLOCKQUOTE]: key to navigating complex changes which is crucial for planning.",
    );
    expect(out).not.toMatch(/navigating|crucial/i);
    expect(out).toMatch(/managing complex changes/i);
  });
});
