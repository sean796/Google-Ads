import { CRITICAL_LINK_RULE, TABLE_FORMAT_MARKDOWN } from "./core";

// --- Shared rule blocks (Manager Panel = Markdown only) ---

const LINK_FORMAT =
  "Links: markdown only [anchor text](url). No [URL: ...], no raw URLs. PRIORITIZE FRONT-LOADING: place links at the start or middle of sentences, never at the end. Never end a sentence with a link. NEVER use 'here' in or after a link (no 'guide here', 'learn more here'). Embed each link in meaningful sentence content on both sides so LLMs get clear context.";

const EXTERNAL_LINKS_RULE =
  "External links: The ONLY allowed external link is the entity's Wikipedia page (when an entity exists). No other external sites. NEVER link to competitors. Do not invent external links.";

const TABLE_NO_LINK_COLUMNS = TABLE_FORMAT_MARKDOWN + " Integrate links into content columns; never add a link-only column.";

const COMPARISON_FORMAT =
  "Comparisons (X vs Y, Pros vs Cons): use Markdown table only. Example: | Pros | Cons | then | --- | --- | then | x | y |. Same for growth metrics, search terms, etc. NEVER use HTML (<table>, <tr>, <td>, <a href>). Links as [text](url). Never repeated bold labels with bullets. NEVER present Pros and Cons as bullet lists or numbered lists - always as a two-column table.";

const STYLE_RULES =
  "Style: No em dashes (use comma+space). No 'if x then y'. No flowery language (e.g. 'delve'). Engaging and helpful.";

const LIST_FORMAT =
  "Lists: Steps/sequences/processes MUST use numbered format (1. 2. 3.) - never bullets for ordered content. Features/benefits use bullet format (- item). Never output list-like items as separate paragraphs - every such item needs a leading - or 1. One line per item (number and sentence on the same line). Forbidden: 1. on its own line then the sentence below; <br> inside list items.";

const MANDATORY_STRUCTURE =
  "Use a table or a list only where the content genuinely calls for one (comparison data, steps, feature sets). Articles with no natural comparison or process need neither. " + LIST_FORMAT + " " + COMPARISON_FORMAT;

const NO_EXTERNAL_HEADINGS =
  "No headings about Houzz, Reddit, Pinterest, Yelp, Amazon, or external sites. No competitor names in headings. Focus on the target site's topic and content.";

const COMPETITOR_EXCLUSION =
  "No links to competitors (same industry, different domain) or businesses in different states/locations. E.g. Florida content → no California business links. No Yelp/review links for out-of-area businesses.";

const TARGET_LINKS_ONLY =
  "Use only links from 'Target Links' section. No invented/placeholder/fake links. If plan says 'No links derived from Knowledge Base', state that and include no links.";

const PLACEHOLDER_FORBIDDEN =
  "No placeholder names (Dr. [Name], [Team Member], etc.). Use the connected business name or we plus a sourced fact. Never write 'our team' or 'our professionals'. No fake staff lists.";

const PLAN_END_SENTENCE =
  "Plan complete. Passing to Drafting AI now. Fully write out tables (headers, separator line, rows/columns/data), lists, and other markdown. Tables: include separator line after header row. " +
  TABLE_NO_LINK_COLUMNS;

// --- Helpers ---

function buildKeywordSection(keywordData: {
  targetKeyword?: string;
  primaryKeywords?: Array<{ keyword: string; difficulty: number; searchVolume: number }>;
  searchIntent?: string;
  semanticKeywords?: string[];
  keywordDifficulty?: number;
}): string {
  if (!keywordData?.targetKeyword) return "";
  const intent = keywordData.searchIntent;
  const intentLine =
    intent === "informational"
      ? "Focus on educating and comprehensive information."
      : intent === "commercial"
        ? "Focus on comparing options and purchase decisions."
        : intent === "transactional"
          ? "Focus on product/service details and conversion."
          : "Focus on brand-specific information.";
  const diff = keywordData.keywordDifficulty;
  const diffLine =
    diff != null && diff > 70
      ? "High difficulty: maximize quality and depth."
      : diff != null && diff < 30
        ? "Low difficulty: focus on unique, standout content."
        : "";
  const parts = [
    "\n--- Keyword & SEO ---",
    `Primary: ${keywordData.targetKeyword}`,
    keywordData.primaryKeywords?.length ? `Primary keywords: ${keywordData.primaryKeywords.map((k) => k.keyword).join(", ")}` : "",
    keywordData.semanticKeywords?.length ? `Semantic: ${keywordData.semanticKeywords.slice(0, 10).join(", ")}` : "",
    intentLine,
    diffLine,
    "Avoid stuffing; 1–2% density; semantic variation; 1–2 exact match max. Mix anchors: 50% descriptive, 30% branded, 20% keyword-rich.",
  ].filter(Boolean);
  return parts.join("\n");
}

function buildKnowledgeGraphSection(knowledgeFiles?: Array<{ name: string; content: string }>): string {
  const files = knowledgeFiles?.filter((f) => f.name.startsWith("knowledge-graph-") && f.name.endsWith(".json")) ?? [];
  if (files.length === 0) return "";
  return [
    "\n--- Knowledge Graph ---",
    `Files: ${files.map((f) => f.name).join(", ")}`,
    "Use for: (1) keyword relationships and semantic clusters, (2) SPO triples for Target Semantic Triples, (3) section structure and flow, (4) secondary/tertiary keyword integration, (5) internal link suggestions if URLs present. Prioritize strong keyword connections in the plan.",
  ].join("\n");
}

const GSC_REPORT_VERBATIM_TABLE =
  " For sections with [CUSTOM] table data: Output the provided table EXACTLY as given. Do not change column order, add columns, invent data, or substitute values. GSC data is source of truth.";

const GSC_PLANNER_CRITICAL = `
*** GSC/SEO PERFORMANCE REPORT - CRITICAL PLANNER RULES ***
1. The content structure (sections below) contains REAL GSC DATA in [CUSTOM]: markdown tables. You MUST copy every [CUSTOM] table CHARACTER-FOR-CHARACTER into your "Detailed Feature Implementation" for the corresponding section. Do NOT summarize, truncate, or paraphrase. Do NOT invent data.
2. Include EVERY section from the structure: Executive Summary, Key Points, Growth at a Glance, Your Strongest Search Terms (Top Performers table), Service Area Pages (entity/SAP table when present), Content Performance, Branded Search Terms, FAQ, Infographic. No section may be omitted or merged away.
3. For each section that has "[CUSTOM]:" or "CRITICAL: OUTPUT THIS EXACT TABLE VERBATIM" in the structure, your Detailed Feature Implementation MUST contain the COMPLETE pipe-format table exactly as shown. The Drafting AI will use your output - if you omit or shorten a table, the final report will have invented/wrong data.
4. Your Execution Plan must be COMPREHENSIVE. The Detailed Feature Implementation for each section must include: intro prose where specified, the FULL table (when present), and analysis text. Never output a stub or placeholder - output the complete content the draft should follow.`;

function isGSCReport(flowTitle: string, flowPurpose: string): boolean {
  const t = (flowTitle || "").toLowerCase();
  const p = (flowPurpose || "").toLowerCase();
  return t.includes("search performance") || t.includes("seo performance") || p.includes("seo performance") || p.includes("performance report");
}

export const buildPlannerPrompt = (
  flowTitle: string,
  flowPurpose: string,
  sectionsPrompt: string,
  keywordData?: {
    targetKeyword?: string;
    primaryKeywords?: Array<{ keyword: string; difficulty: number; searchVolume: number }>;
    searchIntent?: "informational" | "commercial" | "transactional" | "navigational";
    semanticKeywords?: string[];
    keywordDifficulty?: number;
  },
  knowledgeFiles?: Array<{ name: string; content: string }>
): string => {
  const keywordSection = buildKeywordSection(keywordData ?? {});
  const knowledgeGraphSection = buildKnowledgeGraphSection(knowledgeFiles);

  const sectionCount = (sectionsPrompt.match(/^##\s/gm) || []).length;
  const isSimpleContent = sectionCount <= 2;

  
  if (isSimpleContent && !isGSCReport(flowTitle, flowPurpose)) {
    const parts = [
      "You are the **Lead SEO Content Strategist**. Create a concise **Execution Plan** for the Drafting AI that matches the content structure EXACTLY.",
      "\n--- Article ---",
      `# ${flowTitle || "Untitled Article"}`,
      `Purpose: ${flowPurpose}`,
      keywordSection,
      knowledgeGraphSection,
      "Content structure (output MUST match exactly; do not add/remove/change headings):",
      sectionsPrompt,
      "\n--- Planning ---",
      STYLE_RULES,
      `CRITICAL: The content structure has exactly ${sectionCount} section(s). Your plan MUST cover ONLY those ${sectionCount} section(s). Do NOT add steps, topics, or content for anything outside the structure. Ignore Knowledge Base content that is not relevant to the ${sectionCount} section(s) defined above.`,
      "1. Output the plan only; do not write the article.",
      `2. **Execution Steps**: Exactly ${sectionCount} step(s) -- one per section in the structure. Do NOT add extra steps, topics, or sections.`,
      "3. **Target Links**: List internal URLs from the Knowledge Base to use. " + LINK_FORMAT + " " + TARGET_LINKS_ONLY,
      CRITICAL_LINK_RULE,
      "4. No invented/placeholder links. If no suitable links in Knowledge Base, state 'No links derived from Knowledge Base'.",
      "5. **Detailed Feature Implementation**: For each section, write the content the Drafting AI should produce. Keep it focused on what the section's features specify -- do NOT add comparison tables, numbered processes, or extra content not specified in the structure.",
      "6. Output ONLY the plan. End with: " + PLAN_END_SENTENCE,
      "\nGenerate the execution plan:",
    ];
    return parts.join("\n");
  }

  const parts = [
    "You are the **Lead SEO Content Strategist**. Create a step-by-step **Execution Plan** for the Drafting AI: hyper-SEO, coherent, structure-compliant.",
    "\n--- Article ---",
    `# ${flowTitle || "Untitled Article"}`,
    `Purpose: ${flowPurpose}`,
    keywordSection,
    knowledgeGraphSection,
    "Content structure (output MUST match exactly; do not add/remove/change headings):",
    sectionsPrompt,
    (isGSCReport(flowTitle, flowPurpose) ? GSC_PLANNER_CRITICAL : ""),
    "\n--- Planning ---",
    "Tables: always include separator line after header; fill all rows/columns (create data if needed). " +
      TABLE_NO_LINK_COLUMNS +
      (isGSCReport(flowTitle, flowPurpose) ? GSC_REPORT_VERBATIM_TABLE : ""),
    MANDATORY_STRUCTURE,
    STYLE_RULES,
    "1. Output the plan only; do not write the article.",
    "2. **Target Semantic Triples**: Section with 5–10 SPO triples, grouped by heading (H1/H2/H3). Brief note on why these facts (e.g. historical, differentiation).",
    "3. **Target Links**: Section listing internal and external URLs to use, grouped by heading. " +
      LINK_FORMAT +
      " " +
      EXTERNAL_LINKS_RULE +
      " " +
      COMPETITOR_EXCLUSION +
      " " +
      NO_EXTERNAL_HEADINGS +
      " " +
      TARGET_LINKS_ONLY,
    CRITICAL_LINK_RULE,
    "4. No invented/placeholder links. If no suitable links in Knowledge Base, state 'No links derived from Knowledge Base' in Target Links.",
    "5. **Detailed Feature Implementation**: For each section with 'Key points to cover', write full MARKDOWN content (paragraphs, lists, pipe-format tables). Use only links from Target Links; " +
      LINK_FORMAT +
      ". " +
      TABLE_NO_LINK_COLUMNS +
      " NEVER use HTML (<table>, <tr>, <td>, <a href>) in Detailed Feature Implementation.",
    "6. At least 5 major steps; describe transitions, flow, and how to integrate keywords, features, and links.",
    "7. Output ONLY the plan (steps, triples, links, feature implementation). End with: " + PLAN_END_SENTENCE,
    "\nGenerate the execution plan:",
  ];

  return parts.join("\n");
};

export const buildDraftPrompt = (
  flowTitle: string,
  flowPurpose: string,
  sectionsPrompt: string,
  plannerOutput: string,
  keywordData?: {
    targetKeyword?: string;
    primaryKeywords?: Array<{ keyword: string; difficulty: number }>;
    searchIntent?: "informational" | "commercial" | "transactional" | "navigational";
    semanticKeywords?: string[];
    keywordDifficulty?: number;
  }
): string => {
  const keywordSection = keywordData?.targetKeyword
    ? [
        "\n--- Keyword ---",
        `Primary: ${keywordData.targetKeyword}`,
        keywordData.semanticKeywords?.length
          ? `Semantic: ${keywordData.semanticKeywords.slice(0, 10).join(", ")}`
          : "",
        "Avoid stuffing; 1–2% density; semantic variation; 1–2 exact match max. Mix anchors. Vary location (exact name 2–3×, broader terms often). Add at least one real-world expertise example (EEAT).",
      ].filter(Boolean).join("\n")
    : "";

  const draftSectionCount = (sectionsPrompt.match(/^##\s/gm) || []).length;
  const isSimpleDraft = draftSectionCount <= 2;

  
  if (isSimpleDraft && !isGSCReport(flowTitle, flowPurpose)) {
    const parts = [
      "You are the **Drafting AI**. Write content **strictly following the provided Execution Plan and structure**.",
      `ABSOLUTE CONSTRAINT: The structure has exactly ${draftSectionCount} section(s). Your output MUST contain EXACTLY ${draftSectionCount} H2 section(s) -- no more, no less. Do NOT generate any content outside those ${draftSectionCount} section(s). Ignore any Knowledge Base content that falls outside the defined structure.`,
      "\n--- Article ---",
      `Title: ${flowTitle || "Untitled Article"}`,
      `Purpose: ${flowPurpose}`,
      keywordSection,
      "Do not include H1. Start with the first H2 below.",
      "Structure (match EXACTLY -- do NOT add sections):",
      sectionsPrompt,
      "\n--- Execution Plan ---",
      plannerOutput,
      "\n--- Output ---",
      "*** OUTPUT MARKDOWN ONLY. NEVER HTML. Tables = | col | format. Links = [text](url). No <table>, <tr>, <td>, <a href>. ***",
      STYLE_RULES,
      "No H1. Follow the plan exactly. Use 'Detailed Feature Implementation' content under the corresponding headings.",
      "Use only links from 'Target Links'. " + LINK_FORMAT + ". " + PLACEHOLDER_FORBIDDEN,
      "If 'Target Links' says 'No links derived from Knowledge Base', do not include any links.",
      `FINAL REMINDER: Your output MUST have exactly ${draftSectionCount} H2 heading(s). Stop writing after the last section in the Structure. Any additional sections will be rejected.`,
      "Output complete markdown content only; no plan or notes.",
      "Begin with the first H2 (no H1):",
    ];
    return parts.join("\n");
  }

  const parts = [
    "You are the **Drafting AI**. Write a complete blog article **strictly following the provided Execution Plan and structure**.",
    "\n--- Article ---",
    `Title: ${flowTitle || "Untitled Article"}`,
    `Purpose: ${flowPurpose}`,
    keywordSection,
    "Do not include H1. Start with the first H2 below.",
    "Structure (match exactly):",
    sectionsPrompt,
    "\n--- Execution Plan ---",
    plannerOutput,
    "\n--- Output ---",
    "*** OUTPUT MARKDOWN ONLY. NEVER HTML. Tables = | col | format. Links = [text](url). No <table>, <tr>, <td>, <a href>. ***",
    STYLE_RULES,
    "No H1. Follow the plan. Integrate every triple from 'Target Semantic Triples' under the right section. Use 'Detailed Feature Implementation' content under the corresponding headings - if it contains HTML, convert to Markdown. " +
      (isGSCReport(flowTitle, flowPurpose)
        ? "CRITICAL: When the Structure (above) contains [CUSTOM] or 'OUTPUT THIS EXACT TABLE VERBATIM' with a full pipe-format markdown table, you MUST use that exact table in your output - never substitute a summarized or invented table. The structure is the source of truth for GSC data."
        : ""),
    MANDATORY_STRUCTURE,
    "Use only links from 'Target Links'. " +
      LINK_FORMAT +
      ". " +
      TABLE_NO_LINK_COLUMNS +
      (isGSCReport(flowTitle, flowPurpose) ? GSC_REPORT_VERBATIM_TABLE : "") +
      ". " +
      PLACEHOLDER_FORBIDDEN,
    "If 'Target Links' says 'No links derived from Knowledge Base', do not include any links. No competitor links. Only target site (internal) and non-competitor authoritative sources.",
    "Write detailed connecting prose where needed. Output complete markdown article only; no plan or notes.",
    "Begin the article with the first H2 (no H1):",
  ];

  return parts.join("\n");
};

export const buildReviewerPrompt = (draftContent: string, sectionsPrompt: string): string => {
  const parts = [
    "You are the **QA / SEO Reviewer**. Review and polish the draft only; do not add new sections or duplicate existing ones.",
    "\n*** CRITICAL: OUTPUT MARKDOWN ONLY. NEVER HTML. ***",
    "If the draft contains ANY HTML (<table>, <tr>, <td>, <a href>, <p>, <h2>, etc.), you MUST convert it to Markdown. Tables: | Col | Col |, newline | --- | --- |, newline | A | B |. Links: [text](url).",
    "\n--- Draft ---",
    draftContent,
    "\n--- Structure reference (verify only) ---",
    sectionsPrompt,
    "\n--- Review ---",
    "1. Polish only the draft. Check flow, tone, SEO, grammar, structure.",
    "2. **CONVERT HTML TO MARKDOWN**: Any <table>, <tr>, <td>, <a href> MUST become Markdown. Tables = pipe format. Links = [text](url). No exceptions.",
    "3. Ensure passage-level optimization, entity salience, monosemantic optimization. Verify all target semantic triples are integrated correctly.",
    "4. **Links**: Every link in the draft must be in the plan's 'Target Links'. Remove any other link. Markdown format only [text](url); no raw URLs, no <a href>. Remove links to current page and to competitors/different locations. " +
      COMPETITOR_EXCLUSION +
      " If plan says 'No links derived from Knowledge Base', remove all links.",
    "5. Tables: no link-only columns; links in content columns or headings. " + TABLE_NO_LINK_COLUMNS,
    "6. Fix semantic/grammar errors; ensure one cohesive document. No duplicate headings.",
    "7. Output ONLY the finalized article in Markdown. ZERO HTML tags in output.",
    "\nOutput the finalized article:",
  ];

  return parts.join("\n");
};
