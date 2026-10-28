import { AgentConfig } from "@/types/agent-config";
import { ARTICLE_MAX_WORDS } from "@/lib/content-generation/article-length-policy";
import { FORBIDDEN_WORDS_USER_PROMPT_REMINDER } from "@/lib/content-word-blocklist";
import { extractChecklistItemTitle } from "@/lib/post-creator/post-creator-checklist-post-process";
import { HTML_QUOTE_OUTPUT_RULE, MARKDOWN_QUOTE_OUTPUT_RULE, mapFeatureToInstruction } from "../feature-mapping";
import { BLOG_HARNESS_SUMMARY_AGENT_ID } from "@/lib/bulk/blog-harness-summary-agent";
import { BLOG_HARNESS_ANSWER_AGENT_ID } from "@/lib/bulk/blog-harness-answer-agent";
import { INTERNAL_LINK_INTENT_ROUTING_RULE } from "@/lib/content-generation/internal-link-routing-rules";
import { TABLE_NO_LINK_ONLY_COLUMN_RULE, TABLE_QUALIFIED_CLAIMS_RULE } from "@/lib/prompt-builders/table-prompt-rules";
import {
  ILLUSTRATIVE_PERSONA_OUTPUT_SHAPE,
  isComparisonPrimaryKeyword,
  COMPARISON_ANSWER_RULE,
  OVERVIEW_ASSIGNED_PERSONA_RULE,
} from "@/lib/content-optimization/first-party-authority-prompt";
import { UNIFIED_COPY_FORMATTING_RULE, HARNESS_HEADING_TITLE_CASE_RULE } from "@/lib/prompt-builders/title-rules";
import { UNIQUE_DYNAMIC_BODY_H2_RULE } from "@/lib/content-optimization/harness-heading-titles";
import { HARNESS_LABELED_LIST_HTML_RULE } from "@/lib/prompt-builders/harness-labeled-list-html-rule";
import { INTERNAL_LINKS_PER_SECTION_RULE } from "@/lib/content-generation/link-anchor-text-case";

// --- System Prompt Core ---

export const SYSTEM_PROMPT_CORE = `You are a master AI/SEO content strategist and writer. You specialize in creating high-quality, search-optimized content that ranks and converts. Your mastery lies in the elegant and effective integration of semantic triples (SPO) into fluent, natural prose.
--- Global Output Constraints (Mandatory) ---
1. Avoid all em dashes (Unicode U+2014 or U+2013) in output.
2. Never use filler hedges ("it is important to note", empty throat-clearing). Allowed: one decision object per article (an "If you have / choose" table OR a short "Choose A when / choose B when" pair) PLUS 2-4 inline "If {named constraint}, choose {option}" sentences. Forbidden: empty "if you want quality" if/then chains.
3. Ensure sentence lengths are concise and highly varied for a natural rhythm and flow. Strictly avoid all run-on sentences.
4. CRITICAL: SPO is a **planning aid**, not an output format. Derive facts internally as subject-predicate-object; the published sentence must read as natural practitioner prose. Forbidden: labeled triples, knowledge-graph lists, slot-filled templates, or identical SPO stems across paragraphs. Informational density still required.
5. CRITICAL KEYWORD INTEGRATION: Keywords must be woven into content as a native speaker would naturally write them - never as forced exact-match phrases. Use semantic variations, split keywords across sentences, vary word order, and integrate them contextually. The goal is human readability first, SEO second. Keywords should feel like they belong in the sentence, not like they were inserted for optimization.
6. PROS/CONS FORMAT (NON-NEGOTIABLE): Any pros and cons, advantages vs disadvantages, or strengths vs weaknesses MUST be presented in a two-column table with "Pros" and "Cons" as the only column headers - NEVER as bullet lists or numbered lists. Pros cells must use qualified, specific claims (may / when / depending on), not unqualified universal benefits.
7. NO LINK-ONLY TABLE COLUMNS (ZERO TOLERANCE): Never create a table column whose sole purpose is links. Forbidden column headers include Link, Links, Direct Link, Learn More, View Product, URL, Relevant Internal Links, or any header that exists only to hold link CTAs. Embed links inside substantive content columns (product name, description, benefits). Every column must carry real information.`;

export { TABLE_NO_LINK_ONLY_COLUMN_RULE, TABLE_QUALIFIED_CLAIMS_RULE } from "@/lib/prompt-builders/table-prompt-rules";

// --- Canonical Table Format ---
export const TABLE_FORMAT = `ALL tables = HTML only. NEVER | col | or |---| or any pipe/hyphen markdown. Use <table><thead><tr><th>Col1</th><th>Col2</th></tr></thead><tbody><tr><td>A</td><td>B</td></tr></tbody></table>. FAQ table is THE SAME: <table><thead><tr><th>Question</th><th>Answer</th></tr></thead><tbody><tr><td>Q?</td><td>A.</td></tr></tbody></table>. No exceptions. ${TABLE_NO_LINK_ONLY_COLUMN_RULE} ${TABLE_QUALIFIED_CLAIMS_RULE}`;

export const TABLE_FORMAT_MARKDOWN = `ALL tables = Markdown only. Format: | Col1 | Col2 |, newline, | --- | --- |, newline, | A | B |. NEVER use HTML (<table>, <tr>, <td>). Same-site links as [[LINK:query|anchor]] inside substantive cells only. Never [text](https://...) or raw hrefs. ${TABLE_NO_LINK_ONLY_COLUMN_RULE} ${TABLE_QUALIFIED_CLAIMS_RULE}`;

/** Stops models from inventing patient/customer quotes, star ratings, or attributed “local resident” reviews in body, meta, excerpt, FAQ, or idea JSON. */
export const NO_FAKE_TESTIMONIALS_RULE = `**NO FABRICATED TESTIMONIALS (NON-NEGOTIABLE)**: Never invent or write customer, patient, or client testimonials; no fake review quotes, star ratings, or attributed praise (e.g. “Name, Local Resident”). Applies to article body, SEO meta description, social meta, WordPress excerpt, FAQ text, and any generated idea JSON fields. If real testimonials are not supplied in the prompt or knowledge base, omit them entirely - do not substitute generic praise.`;

/** Shared writer contract: chooser / tradeoff / process, never generic encyclopedia. */
export const AUTHENTICITY_WRITER_RULE = `**AUTHENTICITY (NON-NEGOTIABLE)**: Answer THIS H2's job (not the article question already answered in Answer) in the first 1-2 sentences. When ANSWER GROUNDING is in this prompt, forbidden: copying Answer's dates, rate stack, percentages, dollar figures, statute-name stack, or first sentence. Open with a sourced fact that belongs to this heading, or a constraint, tradeoff, process step, cost driver, or when/skip-if. Forbidden: starting the section with the primary keyword as the subject ("{keyword} offers", "{keyword} systems", "{keyword} involve", "{keyword} provide", "{keyword} are"). The first body H2 may lead with we/company authority after a sourced fact that is not Answer's opener; later H2s place the writing keyword once later in the section, not as the first clause. Each body H2 must add a new job (process, comparison rows, metrics, who it is for / not for) — never restate the Answer definition. Each body section must include FIELD OBSERVATION (1-2 sourced we-lines: city or here + named constraint + we see / we recommend when) and at least one concrete reader decision path (choose when / skip when / brief inline tradeoff). Article-wide: 2-4 inline "If {named constraint}, choose {option}" sentences (in [DECISION] and/or [RECOMMENDATION]). Forbidden: encyclopedia filler, repeated generic benefits, textbook definitions, "This article/guide provides/explores". Do not restate the same core concept already covered in Answer, Overview, or a sibling H2 — add the next distinct fact instead. Strong claims need a named mechanism in the same paragraph (why, not just that). Do not conflate unrelated specs (efficiency vs shading tolerance vs low-light performance vs temperature coefficient). Forbidden: implying higher-efficiency equipment mitigates shading without naming layout/electronics drivers; blanket Pros that high efficiency means better low-light performance. Pros/cons and comparison table cells: qualified claims only (may / when / depending on), not universal superlatives. Forbidden SEO stubs: dangling "for more", "learn more", or "click here" tails. Monetary amounts must include explicit CAD or USD (infer from connected service area, province/state, or site country). Cost ranges must be qualified as illustrative, not universal prices. Then do at least one of: recommend with a constraint (room, job, climate, budget, access, market, competition); trade off (limitation or skip this when); or describe process using only facts in master instructions, site context, existing page HTML, LLM/DFS audit blocks, FIRST-PARTY AUTHORITY, MANDATORY CHATGPT BUSINESS FACTS, or this prompt. Forbidden hollow authority: never write "our team", "our experts", "our professionals", "trusted local experts", or "we help homeowners". Use the company name or we plus a sourced concrete detail in the same sentence. Local, climate, installer, pricing-variable, and product-spec claims only if they appear in those sources. **Every specific number, rate, program status, sun-hour stat, efficiency band, payback figure, or export rate must match VERIFIED FACTS confirmed rows or listed sources in this prompt.** Never restate unverified figures from existing page HTML. Grants, loans, rates, payback, and tax classes only for this connected site's city from those sources. Forbidden: another province or country's programs. If a source says a program is closed, say it is closed. Never invent payback figures. If missing: omit. Do not invent testimonials, installation counts, or specs. Unconfirmed specs: write what to ask / how to choose. One [DECISION] or [TABLE] must be a when-it-matters matrix (Situation | Importance) with extractable decision rules. [RECOMMENDATION]: blog: answer so what should I actually buy with an extractable Best for {job}: {option} list plus the connected business name in the close. When SAP PAGE TEMPLATE is present: 1-2 paragraphs plus the four-column Product | Best for | Budget | Reason table. Use remaining section budget for additional sourced detail (examples, comparison row, regional program fact), not repetition or filler toward the article word cap. The illustrative short-H2 + intro + blockquote persona pattern (one named persona with titled Recommendation h3) is allowed ONLY in the single [ILLUSTRATIVE] section — never elsewhere. Obey A+ KEYWORD AUTHORITY: writing keyword is the subject; place entity is a light modifier; 2-3 concrete search-intent examples in Overview or the first body H2 (peopleAlsoAsk when present); practitioner facts unique to the keyword; no programmatic/template voice; sourced we-lines from the connected business about the keyword's job.`;

/** Later H2s: do not keyword-lead. */
export const SECTION_OPENING_VARIETY_RULE = `**SECTION OPENING**: Do not start sentence 1 with the primary keyword or a copy of this H2 as the subject (not in the first sentence as the subject). Open with a sourced fact that belongs to this heading (not Answer's opener), or a constraint, tradeoff, process step, cost driver, or when/skip-if. Forbidden: reusing Answer's dates, rates, or first-sentence shape. Forbidden first-clause patterns: "{keyword} offers", "{keyword} systems", "{keyword} involve", "{keyword} provide", "{keyword} are", "This section introduces", "This article provides". Place the exact writing keyword once later in this section, not as the first clause.`;

/** Checklist: every section writes from post generation date, not training cutoff. */
export const BLOG_WRITING_DATE_CHECKLIST_RULE = `**WRITING DATE (NON-NEGOTIABLE — every checklist item)**: Each checklist line must include [WRITING DATE]. All section prose is published on the post generation date shown in the checklist prompt (not your training cutoff). "Today", "now", "currently", "this year", "at present", and "latest" mean that calendar year only. Past events: name the year explicitly and use past tense; never call a past year "this year" or "currently". Forbidden: first-person lines that mix a named past year with "this year" or "now" as if both are present (e.g. "In 2024 we… and this year we…"). Forward-looking framing uses the generation calendar year or the next year unless the keyword/title is explicitly historical.`;

/** Checklist/blueprint: jobs-to-be-done H2s plus one decision and one tradeoff marker. */
export const AUTHENTICITY_CHECKLIST_RULE = `**AUTHENTICITY CHECKLIST**: When SAP PAGE TEMPLATE is present, emit that skeleton (6-7 items). SAP [RECOMMENDATION] is the four-column Local Recommendation table (Product | Best for | Budget | Reason), not a Best for {job} bullet list. When SERP H2 OUTLINE is present and SAP PAGE TEMPLATE is not, use those exact titles as the first words on each checklist line (5-6 blog items). Prefer H2 titles that help the reader choose (how to choose / vs / cost factors / process / when not worth it), not "What is X", "Your Guide to X", or "Benefits of X". Favor titles that invite field-specific angles (regional cost drivers, install mistakes, production in local climate, campaign tradeoffs). When SEO brief peopleAlsoAsk includes cost, ROI, savings, payback, or rebate questions, at least one checklist H2 must directly answer each such question (merge related PAAs into one H2 when possible). Still 5-6 items (6-7 SAP). Among those H2s (no extra count): when climate or season changes a decision in THIS connected site's trade, exactly one may cover that; forbidden: a product-trends, style, or insulation H2 for a noun inside the keyword when this site does not sell that product; exactly one must carry [TRADEOFF] and frame "Is [premium/higher-efficiency/higher-tier option] worth the extra cost?" with clear criteria when the topic has tiers or grades; when the topic involves cost, ROI, savings, or measurable specs, exactly one section must carry [NUMBERS] and require at least two sourced figures with plain-language meaning when sources provide them. When the topic involves tiers, grades, or measurable specs, put [DECISION] or [TABLE] on exactly one item as a **When does [key spec/tier] actually matter?** matrix (Situation | Importance), not a catalog table. Put [DECISION] on exactly one item (If you have / choose table, or Choose A when / Choose B when, or the when-it-matters matrix above). Put [TRADEOFF] on exactly one item (worth-the-extra-cost or skip when). Put [ILLUSTRATIVE] on exactly one item with [BLOCKQUOTE] for one genderless named persona: short H2 (3-8 words, like sibling H2s; forbidden: "A realistic local situation"; no links in the H2), intro paragraph, scenario in the body (not as H2 or H3), short Recommendation h3, business recommendation p (counts toward 1–2 quote cap; illustrative takes priority over entity-fact quotes). Put [RECOMMENDATION] on exactly one item (blog: so what should I actually buy with extractable Best for {job}: {option} list plus connected business name; SAP: Local Recommendation table Product | Best for | Budget | Reason). Spend at most 2 [TABLE] total; on SAP those two are What We Offer and Local Recommendation. Do not add H2s for FAQ. Weave cost/ROI jobs into existing items. Use the word cap for sourced depth, not extra sections. Overview or the first body H2 (no extra H2) must include 2-3 concrete searcher-query examples implied by the writing keyword (peopleAlsoAsk / related searches when present). H2 titles describe the section job in plain language; WRITING KEYWORD never appears in H2/H3 title text (body copy only). Forbidden: a body H2 that only restates the dictionary definition of the keyword.
${UNIQUE_DYNAMIC_BODY_H2_RULE}
${UNIFIED_COPY_FORMATTING_RULE}
${HARNESS_HEADING_TITLE_CASE_RULE}
${BLOG_WRITING_DATE_CHECKLIST_RULE}`;

export function sectionAllowsThreeParagraphs(agent: {
  title?: string;
  description?: string;
  features?: string[];
}): boolean {
  const blob = [agent.title, agent.description, ...(agent.features ?? [])].join(" ").toLowerCase();
  return (
    blob.includes("[decision]") ||
    blob.includes("[tradeoff]") ||
    blob.includes("[numbers]") ||
    blob.includes("[illustrative]") ||
    blob.includes("[recommendation]") ||
    blob.includes("[table]") ||
    blob.includes("[list]")
  );
}

// --- Core Link Validation Rule (MUST BE ENFORCED) ---
export const CRITICAL_LINK_RULE = `**ABSOLUTELY CRITICAL - LINKS RESTRICTIONS (NO EXCEPTIONS)**:
- **SELF-LINK INVALID**: Never link a page to itself. When a current page URL is provided, any suggested link that matches it (same path, with or without trailing slash, or same canonical URL) is INVALID. Reject it. Do not use it. Self-links are forbidden.
- **Internal links**: [[LINK:query|anchor]] from PAGES and BLOG POSTS titles only. ${INTERNAL_LINK_INTENT_ROUTING_RULE} Never paste same-site hrefs or [text](https://...) internals. Forbidden: service-area URLs.
- **ABSOLUTELY FORBIDDEN: example.com** - NEVER use example.com, example.org, or any placeholder domain. Use only the connected site URLs from the list.
- **External links**: The ONLY allowed external link is the entity's Wikipedia page (when an entity exists). NO other external sites. NO Wikipedia links for topics, products, or general subjects - Wikipedia ONLY for the entity/location name.
- **FORBIDDEN: forums, chat & thread UGC**: Never link to Reddit, Discord, Slack, Quora, Stack Overflow / Stack Exchange, forums, chat apps, or similar discussion/thread platforms. (When Semrush-approved URLs are provided separately, use only those exact URLs - server-side rules exclude forum/chat domains.)
- **NEVER create, invent, or hallucinate external links** - ONLY entity Wikipedia is allowed. No other external domains.
- **NEVER use links from Knowledge Base** - Knowledge Base is for content reference ONLY, NOT for linking
- **NEVER create, invent, fabricate, or make up any links, URLs, or web addresses**
- **NEVER use placeholder links, example URLs, or fictional links**
- If PAGES and BLOG POSTS titles are empty, you MUST NOT create any internal links - simply skip linking for that section
- Any internal link that is not a [[LINK:query|anchor]] from those titles, or any external that is not the entity's Wikipedia page, MUST be removed or not used
- DO NOT assume links exist - if a title is not in PAGES or BLOG POSTS (internal) or is not entity Wikipedia (external), it does not exist and must not be used
- **NEVER use "here" in or after a link** (e.g. no "guide here", "learn more here", "plan here"). Embed each link in meaningful sentence content on BOTH sides so readers and LLMs get clear context for what the link is about`;

// --- Prompt Generation Logic ---

const htmlHeadingTag = (level: number | undefined) => {
  const l = level && level >= 1 && level <= 6 ? level : 1;
  return `h${Math.min(l + 1, 6)}`; // level 1 → h2 (main section), level 2 → h3 (subsection), level 3 → h4
};

export const generateSingleSectionPrompt = (
  agent: AgentConfig,
  format: 'markdown' | 'html' = 'html',
  contentKind?: "press_release",
  topicAnchor?: string,
  primaryKeyword?: string,
): string => {
  const useMarkdown = format === 'markdown';
  const comparisonAnswerBlock =
    primaryKeyword?.trim() && isComparisonPrimaryKeyword(primaryKeyword)
      ? `\n${COMPARISON_ANSWER_RULE}\n- When COMPARISON ANSWER applies, sentence 1 is the side-by-side verdict (not stat-first). Sentence 2+ may add sourced figures when available.\n`
      : "";

  if (agent.id === BLOG_HARNESS_ANSWER_AGENT_ID) {
    return `<h2>Answer</h2>
Rules:
- Output <h2>Answer</h2> then exactly one <p> with two or three sentences total.
${comparisonAnswerBlock}- Sentence 1: ${primaryKeyword?.trim() && isComparisonPrimaryKeyword(primaryKeyword) ? "Direct comparison verdict (see COMPARISON ANSWER above)." : "STAT/FACT FIRST. Open with a sourced number, range, named spec, process constraint, or installer measurement from VERIFIED FACTS, FIRST-PARTY CLAIMS, audit blocks, or this prompt. Then answer the question. Weave the writing keyword later in the paragraph if needed, not as the first clause."}
- Forbidden sentence-1 shapes: "{keyword} offers/are/is/provide/give"; dictionary definitions; generic benefit stacks (privacy, light control, energy efficiency, aesthetic appeal) as the whole answer; "This article/guide provides/explores/covers"; company-name greeting with no fact.
- Sentence 2 (mandatory when VERIFIED FACTS lists confirmed cost, efficiency, rate, payback, or export rows): one confirmed numeric anchor with units and explicit CAD or USD, qualified as illustrative when Tier 2. Cost/install bands must name the primary service city from PRIMARY LOCAL CONTEXT (e.g. Edmonton) — forbidden: Calgary, Toronto, Vancouver, or any other city when primary city is set unless the page keyword targets that city. Discard SERP or brief facts from other cities. When stating payback or savings, name at least one variance driver (system size, usage, export rates, equipment). Forbidden: universal payback lines ("recoup within X–Y years", "pays back in 5–10 years") without depends-on framing. Never invent figures. When no confirmed economic row exists, one concrete installer detail from FIRST-PARTY or audit blocks instead (mount type, room constraint, product tier, regional pattern) — never hollow "our team" filler.
- When VERIFIED FACTS confirms efficiency tier bands, include one band comparison in sentence 1 or 2. When VERIFIED FACTS confirms program is closed or no rebate, state closed status; do not imply active incentives.
- When CONNECTED SITE IDENTITY lists a business name, mention that exact name somewhere in the Answer paragraph. Pair it with one installer-only concrete detail when FIRST-PARTY CLAIMS, audit blocks, or existing page HTML provide one. Do not skip the name. Do not invent counts. Forbidden: "our team", "our experts", "we often find/observe/recommend" without that detail, "we help homeowners", "tailored to your needs".
- TRANSACTIONAL MONEY PAGE LINK (mandatory when PAGE SITEMAP / ASSIGNED PAGE LINKS are provided): weave 1 contextual internal link ([[LINK:query|anchor]] or <a href="...">anchor</a>) to a page-sitemap product/service money page that supports the customer's transaction (never a blog post, never a service-area URL).
- FORBIDDEN: lists, tables, extra headings, Overview-style bullets, or a fourth sentence.
- HTML only. Stop after </p>.
${FORBIDDEN_WORDS_USER_PROMPT_REMINDER}`;
  }

  if (agent.id === BLOG_HARNESS_SUMMARY_AGENT_ID) {
    const overviewLinkRulesShared =
      "- FORBIDDEN: bullet labels Section, Section N, Second Example, or a second homeowner or example bullet. Exactly one Real-World Example bullet when an ILLUSTRATIVE anchor exists. Never list a placeholder H2.\n" +
      "- Second lead sentence: state the article includes a labeled real-world hypothetical (one genderless named persona under stated assumptions with a site-level business recommendation); point forward to the Real-World Example section. When ASSIGNED ILLUSTRATIVE PERSONA block is in the user prompt, use that personaName exactly. Do not paste the full scenario in Overview. Forbidden: payback years, install cost, or savings totals in Overview prose.\n" +
      `- ${OVERVIEW_ASSIGNED_PERSONA_RULE}\n` +
      "- FORBIDDEN per bullet: two links, duplicate links to the same #id, keyword-echo second links, or \"including [link]\" phrasing.\n" +
      "- FORBIDDEN in all Overview copy: em dashes (Unicode U+2014 or U+2013). Use comma, period, or hyphen instead.\n" +
      '- FORBIDDEN: "see below", "below", "click here", "fits your SEO plan", "See how", or any SEO-stub template. Link text must belong in the sentence.';
    const overviewLinkRulesMd =
      "- Each bullet: **2-3 word label**: one short sentence with exactly ONE in-page link ([2-4 word phrase](#exact-id)).\n" +
      "- The IN-PAGE anchor tagged ILLUSTRATIVE MUST use bullet label **Real-World Example** (exact words).\n" +
      overviewLinkRulesShared;
    const overviewLinkRulesHtml =
      "- Each bullet: <strong>2-3 word label</strong>: one short sentence with exactly ONE in-page link (<a href=\"#exact-id\">2-4 words</a> or [[SCROLL:#exact-id|2-4 word phrase]]).\n" +
      "- The IN-PAGE anchor tagged ILLUSTRATIVE MUST use bullet label <strong>Real-World Example</strong> (exact words). Never **Real-World Example** markdown.\n" +
      overviewLinkRulesShared;
    if (useMarkdown) {
      return `## Overview
Rules:
- Lead with what remaining sections cover. Do not answer the article question again. Forbidden: restating Answer's dates, rates, percentages, dollar figures, statute-name stack, or closing company sentence. Do not open with "{keyword} offers/are/provide" or "This article/guide". The keyword may appear later in the lead, not as the first clause.
- Output ## Overview, 1-2 short lead paragraphs, then a mandatory - bullet list (one item per IN-PAGE anchor).
${overviewLinkRulesMd}
- Use exact #ids from IN-PAGE ANCHORS in the user prompt. Stop after the bullet list.
- Markdown only.
${FORBIDDEN_WORDS_USER_PROMPT_REMINDER}`;
    }
    return `<h2>Overview</h2>
Rules:
- Lead with what remaining sections cover. Do not answer the article question again. Forbidden: restating Answer's dates, rates, percentages, dollar figures, statute-name stack, or closing company sentence. Do not open with "{keyword} offers/are/provide" or "This article/guide". The keyword may appear later in the lead, not as the first clause.
- Output <h2>Overview</h2>, 1-2 short <p> lead paragraphs, then mandatory <ul><li> list (never markdown * or - bullets).
${overviewLinkRulesHtml}
- Use exact #ids from IN-PAGE ANCHORS in the user prompt. Stop after </ul>.
- HTML only. Every bullet must be <li><strong>Label</strong>: sentence with <a href="#id">2-4 words</a> woven before the period.
${HARNESS_LABELED_LIST_HTML_RULE}
${FORBIDDEN_WORDS_USER_PROMPT_REMINDER}`;
  }

  const hasFAQFeature =
    agent.features?.some((f) => {
      if (typeof f !== 'string') return false;
      const lower = f.toLowerCase().trim();
      if (lower.startsWith('[forbidden_words')) return false;
      return lower.includes('[faq]') || lower.includes('faq');
    }) ?? false;

  if (hasFAQFeature) {
    if (useMarkdown) {
      return `Do NOT write an FAQ section in this body. FAQ is appended later as H2 "FAQ" + intro + Question/Answer table. Omit FAQ headings, tables, and Q/A pairs. Output nothing for this section.`;
    }
    return `Do NOT write an FAQ section in this body. FAQ is appended later as flo-faq with H2 id="faq" "FAQ" + intro + HTML Question/Answer table. Omit FAQ headings, tables, and Q/A pairs. Output nothing for this section.`;
  }

  const isFirstAgent = agent.step === 1;
  const sectionTitle = extractChecklistItemTitle(agent.title?.trim() || "");
  const isSeoOpenerSection =
    contentKind !== "press_release" &&
    agent.id !== BLOG_HARNESS_SUMMARY_AGENT_ID &&
    agent.id !== BLOG_HARNESS_ANSWER_AGENT_ID &&
    agent.step === 1;

  const hasIllustrativeFeature =
    agent.features?.some((f) => {
      if (typeof f !== "string") return false;
      return f.toLowerCase().trim().startsWith("[illustrative]");
    }) ?? false;
  const illustrativeContext = hasIllustrativeFeature;
  const illustrativeH2 = sectionTitle;

  const featureInstructions = agent.features
    .filter((f) => typeof f === "string" && !f.trim().toLowerCase().startsWith("[forbidden_words"))
    .map((f) => mapFeatureToInstruction(f, format, { illustrativeContext }))
    .join(", ");
  const hasListFeature = agent.features.some((f) => f.toLowerCase().trim().startsWith('[list]'));
  const hasBlockquoteFeature = agent.features.some((f) => f.toLowerCase().trim().startsWith('[blockquote]'));
  const illustrativeBlockquoteNote =
    hasIllustrativeFeature && contentKind !== "press_release"
      ? `\n**ILLUSTRATIVE SCENARIO (NON-NEGOTIABLE — ONLY section allowed to output this)**: ${ILLUSTRATIVE_PERSONA_OUTPUT_SHAPE} Ground economic numbers to Answer + VERIFIED FACTS; do not exceed Answer qualification. ILLUSTRATIVE EXAMPLE block is mandatory — copy personaName and all assigned fields exactly; forbidden to rename or invent a persona.`
      : "";
  const illustrativeHarnessContract =
    hasIllustrativeFeature && contentKind !== "press_release"
      ? `\n**ILLUSTRATIVE SECTION CONTRACT**: Copy ILLUSTRATIVE EXAMPLE exactly — ONE decision matching Answer and Keyword, compact. H2 MUST be this section's planner title "${illustrativeH2}" (unique topical H2, never a stock label, never Section N). First <p> is general reader context only (situationHook — no persona name). Named persona scenario in <blockquote> only. The place name belongs inside the blockquote sentence as the CITY INTERNAL LINK [[LINK]] from the ILLUSTRATIVE EXAMPLE block. Forbidden: a location cite as the first child of the blockquote; "{place} —" or "{place} -" above the quote. Forbidden: "Scenario:" label anywhere; Homeowner A/B; a second homeowner H2; links in headings; keyword+place slug in H2; "A realistic local situation".`
      : "";
  const nonIllustrativeHypotheticalBan =
    !hasIllustrativeFeature &&
    contentKind !== "press_release" &&
    agent.id !== BLOG_HARNESS_SUMMARY_AGENT_ID &&
    agent.id !== BLOG_HARNESS_ANSWER_AGENT_ID
      ? `\n**NO DUPLICATE HYPOTHETICAL**: This section does NOT carry [ILLUSTRATIVE]. Forbidden: H2 titled "${illustrativeH2}", Scenario h3 blocks, Recommendation h3 blocks, blockquote hypotheticals, Homeowner A/B, or copying ILLUSTRATIVE EXAMPLE text.`
      : "";
  const isNumberedList =
    hasListFeature &&
    agent.features.some((f) => {
      const lower = f.toLowerCase();
      return (
        lower.includes('numbered') ||
        lower.includes('ordered') ||
        lower.includes('step') ||
        lower.includes('sequence') ||
        lower.includes('process')
      );
    });
  const allowsThreeParagraphs = sectionAllowsThreeParagraphs(agent);
  const markerBlob = [agent.title, agent.description, ...(agent.features ?? [])].join(" ").toLowerCase();
  const requiresTableOrList =
    markerBlob.includes("[decision]") ||
    markerBlob.includes("[tradeoff]") ||
    markerBlob.includes("[numbers]") ||
    markerBlob.includes("[table]") ||
    markerBlob.includes("[list]");
  const authenticityNote =
    contentKind !== "press_release" &&
    agent.id !== BLOG_HARNESS_SUMMARY_AGENT_ID &&
    agent.id !== BLOG_HARNESS_ANSWER_AGENT_ID
      ? `\n${AUTHENTICITY_WRITER_RULE}`
      : "";
  const harnessHeadingTitleCaseNote =
    contentKind !== "press_release" &&
    agent.id !== BLOG_HARNESS_SUMMARY_AGENT_ID &&
    agent.id !== BLOG_HARNESS_ANSWER_AGENT_ID
      ? `\n${UNIFIED_COPY_FORMATTING_RULE}`
      : "";
  const laterSectionOpeningNote =
    contentKind !== "press_release" &&
    agent.id !== BLOG_HARNESS_SUMMARY_AGENT_ID &&
    agent.id !== BLOG_HARNESS_ANSWER_AGENT_ID &&
    !isSeoOpenerSection
      ? `\n${SECTION_OPENING_VARIETY_RULE}`
      : "";

  let sublistPreventionNote: string;
  let listFormatNote: string;
  let firstAgentSpecialInstructions: string;
  let contentInstruction: string;
  const hTag = htmlHeadingTag(agent.headingLevel);

  if (useMarkdown) {
    sublistPreventionNote = !hasListFeature
      ? "\nBreakdowns/steps/series MUST use - bullets or 1. 2. 3. numbered - NEVER separate paragraphs."
      : "";
    listFormatNote = hasListFeature
      ? isNumberedList
        ? "\n**LIST FORMAT**: Numbered list. Each item is one line: 1. Sentence here. NEVER bullets. Forbidden: 1. on its own line then the sentence below."
        : "\n**LIST FORMAT**: Use - bullets for unordered, or 1. 2. 3. for steps. Markdown only. Number and sentence on the same line."
      : "";
    const quoteFormatNote = hasBlockquoteFeature ? `\n**QUOTE FORMAT**: ${MARKDOWN_QUOTE_OUTPUT_RULE}` : "";
    const prLaterSectionNote =
      contentKind === "press_release" && !isFirstAgent
        ? "\n**NOT THE OPENING BLOCK**: Do NOT repeat the wire dateline or start any paragraph with a calendar date. Do NOT use today announced, grand opening, newly launched, expansion announced, or similar invented news. Write about TARGET SITE and the release topic keyword in steady editorial voice."
        : "";
    firstAgentSpecialInstructions =
      isFirstAgent && contentKind === "press_release"
        ? "\n**PRESS RELEASE OPENING (SECTION 1 ONLY)**: First output line is ## plus a topical headline for the keyword (service/expertise angle, not a fake launch). Next paragraph: start with the exact Wire dateline from ACF when provided (once only in the full release); otherwise city, region, and full date in AP style. Never [CITY], [STATE], [Month DD, YYYY], or bracket templates. Then a lead about the business and topic. Neutral AP tone. Do not frame as a new announcement unless user context says so."
        : isSeoOpenerSection
          ? "\n**CRITICAL FIRST BODY SECTION**: Write exactly 3 short paragraphs (2-3 sentences each). Sentence 1 must be a sourced fact NEW to this H2's job (number, named constraint, process step), not Answer's headline fact, not a dictionary definition, and not the company name as a greeting. Do not start with the writing keyword as the subject (\"{keyword} offers/provides/involves\"). The keyword may appear later in the paragraph. Then expand. **INTERNAL LINKS**: Same as other body H2s — follow INTERNAL LINKS PER SECTION rules in the system prompt (THIS SECTION LINK ASSIGNMENTS when present). **CRITICAL**: H2 MUST be active and SEO-friendly (e.g. 'Child-Safe Window Treatment Key Rules') - NEVER 'Introduction', 'Intro', 'Understanding…', 'Navigating…', or colon subtitles. Markdown only."
          : "";
    const prTopicBlock =
      contentKind === "press_release" && topicAnchor?.trim()
        ? `\n**RELEASE TOPIC (light touch)**: ${topicAnchor.trim()} — shape the story around this; do not repeat the exact phrase in every section.`
        : "";
    const prHeadingRule =
      contentKind === "press_release"
        ? "\n**## LINE**: Invent a topical subhead tied to the keyword and business (service, expertise, or reader need). Not a template label; not a fake launch headline unless user context requires it."
        : "";
    const prInternalLinkRule =
      contentKind === "press_release"
        ? "\n**INTERNAL LINKS**: Include at least 2 [[LINK:query|anchor]] placeholders in this section, woven into complete sentences. Query is PAGES or BLOG POSTS title words, never a raw URL. Forbidden: markdown [text](https://...) to third-party or competitor URLs; raw https:// internal URLs."
        : "";
    const harnessBodyContract =
      contentKind !== "press_release" &&
      agent.id !== BLOG_HARNESS_SUMMARY_AGENT_ID &&
      agent.id !== BLOG_HARNESS_ANSWER_AGENT_ID
        ? hasIllustrativeFeature
          ? `\n**NON-NEGOTIABLE OUTPUT CONTRACT**:
- Exactly ONE ## heading: inner text MUST be exactly "${illustrativeH2}" — no paraphrase, no links, no place names, no keyword slug.
- Flat structure: never nest ## inside ##. Never output a second ##.
${illustrativeHarnessContract}
- Write ONLY this section. No Overview scroll-link bullet list.
- STOP: after the recommendation paragraph, output nothing else.`
          : `\n**NON-NEGOTIABLE OUTPUT CONTRACT**:
- Exactly ONE ## heading: text MUST be exactly "${sectionTitle}" — no paraphrase or substitute wording. NEVER use checklist meta-instructions (forbidden: "Create an agent", "Create a first section agent", "Create an H2 section"). NEVER use placeholder titles (Section, Intro, Introduction, Content, Overview).
- Flat structure: never nest ## inside ##. Never output a second ##.
- Body prose: at least one lead paragraph before any list or table. First 1-2 sentences after the ## heading must directly answer the heading. At most **${allowsThreeParagraphs ? "3" : "2"}** paragraphs. ${requiresTableOrList ? "This marked section MUST include the required table or list plus those paragraphs. Forbidden: definition-only prose." : allowsThreeParagraphs ? "Up to 3 paragraphs. Forbidden: definition-only prose." : "Unmarked: 1-2 paragraphs only. No extra table or list unless this block requires it."} Each paragraph: at most **3** sentences. Every paragraph ends with a complete sentence.
- Write ONLY this section. Do not cover topics assigned to other ## sections in the plan. No Overview scroll-link bullet list.
- STOP: after your last paragraph, table, or list, output nothing else. No preview of sibling sections.`
        : "";
    const harnessScopeNote =
      contentKind !== "press_release"
        ? hasIllustrativeFeature
          ? `\n**SECTION SCOPE**: Keep this section within the harness word budget (full article max ${ARTICLE_MAX_WORDS} words). ### only for the short Recommendation label. Forbidden: Scenario as ###. No extra topics beyond this section block.`
          : `\n**SECTION SCOPE**: Keep this section within the harness word budget (full article max ${ARTICLE_MAX_WORDS} words). No ### unless h3Enabled; no extra topics beyond this section block.`
        : "";
    const harnessKeywordNote =
      contentKind !== "press_release"
        ? isSeoOpenerSection
          ? "\n**HARNESS KEYWORD**: Weave the **writing keyword** phrase at least once inside a complete sentence (see KEYWORD PUNCTUATION block). After a period, the next sentence starts with a capital letter. Forbidden leftover after a period: \". durable window coverings\". If you cannot weave it mid-sentence, STOP. Canonical hyphens required (X-ray, e-commerce). Semantic synonyms elsewhere only."
          : "\n**HARNESS KEYWORD**: Weave the **writing keyword** phrase once inside a complete sentence, not in the first sentence and never as the last words of a sentence. After a period, the next sentence starts with a capital letter. Forbidden leftover after a period: \". durable window coverings\". If you cannot weave it mid-sentence, STOP. Never wrap it in **markdown** or <strong>. Canonical hyphens required (X-ray, e-commerce). Semantic synonyms elsewhere only."
        : "";
    contentInstruction = `[Write content in Markdown. Based on: ${agent.description}${agent.features.length > 0 ? `\nKey points: ${featureInstructions}` : ''}${harnessBodyContract}${authenticityNote}${harnessHeadingTitleCaseNote}${laterSectionOpeningNote}${illustrativeBlockquoteNote}${nonIllustrativeHypotheticalBan}${prTopicBlock}${firstAgentSpecialInstructions}${prLaterSectionNote}${prHeadingRule}${prInternalLinkRule}${harnessScopeNote}${harnessKeywordNote}${sublistPreventionNote}${listFormatNote}${quoteFormatNote} Use ##, ###, paragraphs, - or 1. lists, [[LINK:query|anchor]] internals, | table |, quotes as > sentence. NEVER HTML. NEVER [text](https://...) for same-site links. Never wrap a quote with the word blockquote. Never dump a keyword or [[LINK]] after the final period.]`;
  } else {
    sublistPreventionNote = !hasListFeature
      ? "\nBreakdowns/steps/series MUST use <ul><li> or <ol><li> - NEVER separate <p> paragraphs."
      : "";
    listFormatNote = hasListFeature
      ? isNumberedList
        ? "\n**LIST FORMAT**: Numbered steps. Use <ol><li>one sentence on the same line as the number</li></ol> ONLY. NEVER bullets. Forbidden: <p> or <br> inside <li>; typing 1. inside the <li>; a number on its own line; a bold heading then a paragraph as the item. Correct: <ol><li>Prepare your data. Organize titles, authors, and SEO metadata into a CSV.</li></ol>."
        : "\n**LIST FORMAT**: HTML only. Unordered: <ul><li>one sentence</li></ul>. Numbered steps: <ol><li>one sentence on the same line as the number</li></ol>. NEVER markdown (- or 1. or **Label**:). Forbidden: <p> or <br> inside <li>; a number on its own line; typing 1. inside the <li>; a bold mini-heading then a paragraph as the item; linking <strong> or **bold**."
      : "";
    const quoteFormatNoteHtml = hasBlockquoteFeature ? `\n**QUOTE FORMAT**: ${HTML_QUOTE_OUTPUT_RULE}` : "";
    firstAgentSpecialInstructions = isSeoOpenerSection
      ? "\n**CRITICAL FIRST BODY SECTION**: Write exactly 2 short <p> paragraphs (2-3 sentences each). Sentence 1 must be a sourced fact NEW to this H2's job (number, named constraint, process step), not Answer's headline fact, not a dictionary definition, and not the company name as a greeting. Do not start with the writing keyword as the subject (\"{keyword} offers/provides/involves\"). The keyword may appear later in the paragraph. Then expand. **INTERNAL LINKS**: Same as other body H2s — follow INTERNAL LINKS PER SECTION rules in the system prompt (THIS SECTION LINK ASSIGNMENTS when present). **H2 TITLE (NON-NEGOTIABLE)**: Use the exact <h2> title from this section block — do not paraphrase or invent a different heading. HTML only."
      : "";
    const harnessBodyContract =
      contentKind !== "press_release" &&
      agent.id !== BLOG_HARNESS_SUMMARY_AGENT_ID &&
      agent.id !== BLOG_HARNESS_ANSWER_AGENT_ID
        ? hasIllustrativeFeature
          ? `\n**NON-NEGOTIABLE OUTPUT CONTRACT**:
- Exactly ONE <h2>: inner text MUST be exactly "${illustrativeH2}" — no paraphrase, no <a> tags, no place names, no keyword slug.
- Flat structure: never nest <h2> inside <h2>. Never output a second <h2>.
${illustrativeHarnessContract}
- Write ONLY this H2 block. No Overview scroll-link <ul>.
- STOP: after the recommendation </p>, output nothing else.`
          : `\n**NON-NEGOTIABLE OUTPUT CONTRACT**:
- Exactly ONE <h2>: inner text MUST be exactly "${sectionTitle}" — no paraphrase or substitute wording. NEVER use checklist meta-instructions (forbidden: "Create an agent", "Create a first section agent"). NEVER use placeholder titles (Section, Intro, Introduction, Content, Overview).
- Flat structure: never nest <h2> inside <h2>. Never output a second <h2>.
- Body prose: at most **${allowsThreeParagraphs ? "3" : "2"}** <p> tags. ${requiresTableOrList ? "This marked section MUST include the required <table> or <ul>/<ol> plus those <p> tags (3 <p> + table/list). Forbidden: definition-only prose." : allowsThreeParagraphs ? "Up to 3 <p> tags. Forbidden: definition-only prose." : "Unmarked: 1-2 <p> only. No extra table or list unless this block requires it."} First <p> after the <h2> must directly answer the heading in 1-2 sentences. Each <p>: at most **3** sentences. Every paragraph ends with a complete sentence — never a standalone word or partial link text. If tight on length, finish the current sentence and STOP — never mid-sentence.
- Write ONLY this H2 block. Do not cover topics assigned to other H2s in the plan. No Overview scroll-link <ul>.
- STOP: after your last </p>, </table>, or </ol>, output nothing else. No preview of sibling sections.`
        : "";
    const harnessScopeNote =
      contentKind !== "press_release"
        ? hasIllustrativeFeature
          ? `\n**SECTION SCOPE**: Keep this section within the harness word budget (full article max ${ARTICLE_MAX_WORDS} words). <h3> only for the short Recommendation label. Forbidden: Scenario as <h3>. No extra topics beyond this section block.`
          : `\n**SECTION SCOPE**: Keep this section within the harness word budget (full article max ${ARTICLE_MAX_WORDS} words). No H3 unless h3Enabled; no extra topics beyond this section block.`
        : "";
    const harnessKeywordNote =
      contentKind !== "press_release"
        ? isSeoOpenerSection
          ? "\n**HARNESS KEYWORD**: Weave the **writing keyword** phrase at least once inside a complete sentence (see KEYWORD PUNCTUATION block). After a period, the next sentence starts with a capital letter. Forbidden leftover after a period: \". durable window coverings\". If you cannot weave it mid-sentence, STOP. Canonical hyphens required (X-ray, e-commerce). Semantic synonyms elsewhere only."
          : "\n**HARNESS KEYWORD**: Weave the **writing keyword** phrase once inside a complete sentence, not in the first sentence and never as the last words of a sentence. After a period, the next sentence starts with a capital letter. Forbidden leftover after a period: \". durable window coverings\". If you cannot weave it mid-sentence, STOP. Never wrap it in **markdown** or <strong>. Canonical hyphens required (X-ray, e-commerce). Semantic synonyms elsewhere only."
        : "";
    const harnessLabeledListNote =
      contentKind !== "press_release" &&
      agent.id !== BLOG_HARNESS_ANSWER_AGENT_ID &&
      agent.id !== BLOG_HARNESS_SUMMARY_AGENT_ID
        ? `\n${HARNESS_LABELED_LIST_HTML_RULE}`
        : "";
    const harnessBodyInternalLinksNote =
      contentKind !== "press_release" &&
      agent.id !== BLOG_HARNESS_ANSWER_AGENT_ID &&
      agent.id !== BLOG_HARNESS_SUMMARY_AGENT_ID &&
      !hasFAQFeature
        ? `\n${INTERNAL_LINKS_PER_SECTION_RULE}`
        : "";
    contentInstruction = `[Write content in HTML. Based on: ${agent.description}${agent.features.length > 0 ? `\nKey points: ${featureInstructions}` : ''}${harnessBodyContract}${authenticityNote}${harnessHeadingTitleCaseNote}${laterSectionOpeningNote}${illustrativeBlockquoteNote}${nonIllustrativeHypotheticalBan}${firstAgentSpecialInstructions}${harnessScopeNote}${harnessKeywordNote}${harnessBodyInternalLinksNote}${harnessLabeledListNote}${sublistPreventionNote}${listFormatNote}${quoteFormatNoteHtml} Use <${hTag}>, <p>, <ul><li>, <ol><li>, <table>, <blockquote><p>. Same-site links MUST be [[LINK:query|anchor]] placeholders only (from PAGES and BLOG POSTS / LINK TARGETS PLAN). FORBIDDEN: raw same-site <a href=\"https://...\"> and homepage-only links. External Wikipedia only when explicitly allowed. NEVER markdown, never **asterisks**, never a keyword or [[LINK]] after the final period or as the last words of a sentence. After a period, capitalize the next sentence. Never wrap a quote with the word blockquote.]`;
  }

  let sectionPrompt =
    useMarkdown && contentKind === "press_release"
      ? contentInstruction
      : useMarkdown
        ? `## ${sectionTitle}\n${contentInstruction}`
        : `<${hTag}>${sectionTitle}</${hTag}>\n${contentInstruction}`;

  if (agent.h3Enabled && agent.h3Count > 0) {
    const cappedH3 = Math.min(agent.h3Count, 5);
    const hasListFeatureForH3 = agent.features.some((f) => f.toLowerCase().trim().startsWith('[list]'));
    const sublistPreventionNoteForH3 = !hasListFeatureForH3
      ? useMarkdown
        ? "\nBreakdowns/steps MUST use - or 1. 2. 3., never separate paragraphs."
        : "\nBreakdowns/steps MUST use <ul><li> or <ol><li>, never separate <p> paragraphs."
      : "";
    const listFormatNoteForH3 =
      hasListFeatureForH3 && isNumberedList
        ? useMarkdown
          ? "\n**LIST**: Numbered steps = 1. 2. 3. ONLY."
          : "\n**LIST**: Numbered steps = <ol><li> ONLY. Never bullets for sequential content."
        : "";
    const introInstruction = useMarkdown
      ? `[Write a brief introduction. Based on: ${agent.description}${agent.features.length > 0 ? `\nKey points: ${featureInstructions}` : ''}${sublistPreventionNoteForH3}${listFormatNoteForH3}]\n(Following ${cappedH3} H3s only - MAX 5 per section. Markdown only.)`
      : `[Write a brief <p> introduction. Based on: ${agent.description}${agent.features.length > 0 ? `\nKey points: ${featureInstructions}` : ''}${sublistPreventionNoteForH3}${listFormatNoteForH3}]\n(Following ${cappedH3} H3s only - MAX 5 per section. HTML only.)`;
    sectionPrompt = useMarkdown
      ? `## ${sectionTitle}\n${introInstruction}`
      : `<${hTag}>${sectionTitle}</${hTag}>\n${introInstruction}`;

    const hasListFeatureForH3Subsections = agent.features.some((f) =>
      f.toLowerCase().trim().startsWith('[list]'),
    );
    const sublistPreventionNoteForH3Subsections = !hasListFeatureForH3Subsections
      ? useMarkdown
        ? "\nBreakdowns/steps MUST use - or 1. 2. 3.."
        : "\nBreakdowns/steps MUST use <ul><li> or <ol><li>."
      : "";
    const listFormatNoteForH3Subsections =
      hasListFeatureForH3Subsections && isNumberedList
        ? useMarkdown
          ? " Steps/sequences = 1. 2. 3. ONLY."
          : " Steps/sequences = <ol><li> ONLY, never <ul>."
        : "";
    for (let i = 1; i <= cappedH3; i++) {
      sectionPrompt += useMarkdown
        ? `\n\n### [Compose SEO-optimized H3 title for this subsection]\n[Write detailed content in Markdown${sublistPreventionNoteForH3Subsections}${listFormatNoteForH3Subsections}]`
        : `\n\n<h3>[Compose SEO-optimized H3 title for this subsection]</h3>\n[Write detailed content in HTML${sublistPreventionNoteForH3Subsections}${listFormatNoteForH3Subsections}]`;
    }
  }

  return `${sectionPrompt}\n${FORBIDDEN_WORDS_USER_PROMPT_REMINDER}`;
};

export const generateSectionsPrompt = (agents: AgentConfig[], format: 'markdown' | 'html' = 'html'): string => {
  return agents.map((agent) => generateSingleSectionPrompt(agent, format)).join("\n\n");
};
