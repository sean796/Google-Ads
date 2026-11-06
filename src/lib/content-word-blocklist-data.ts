/** Single banned words (any use in titles, body, meta, FAQ, rationale). */
export const GLOBAL_FORBIDDEN_WORDS = [
  "delve",
  "leverage",
  "robust",
  "comprehensive",
  "navigate",
  "landscape",
  "tapestry",
  "utilize",
  "seamlessly",
  "cutting-edge",
  "state-of-the-art",
  "ever-evolving",
  "myriad",
  "plethora",
  "paramount",
  "foster",
  "embark",
  "holistic",
  "synergy",
  "elevate",
  "revolutionary",
  "transformative",
  "unlock",
  "crucial",
  "vital",
] as const;

/** Banned multi-word phrases and importance-claim patterns. */
export const GLOBAL_FORBIDDEN_PHRASES = [
  "is crucial for",
  "is crucial to",
  "is vital for",
  "is vital to",
  "understanding these",
  "is essential for",
  "is essential to",
  "is key to",
  "plays a crucial role",
  "plays a vital role",
  "it's crucial that",
  "it is crucial that",
  "it's vital that",
  "it is vital that",
  "crucial to note",
  "vital to note",
  "it's important to note",
  "it is important to note",
  "needless to say",
  "dive into",
  "deep dive",
  "at the end of the day",
  "in today's world",
  "in conclusion",
  "game-changer",
  " for more.",
  "fits your SEO plan",
  "See how",
  "this article explores",
  "this article provides",
  "this article covers",
  "this article outlines",
  "this guide explores",
  "this guide provides",
  "this guide outlines",
  "this guide covers",
  "this article also presents",
  "in this article,",
  "in this guide,",
  "we will explore",
  "let's explore",
  "when it comes to",
  "whether you're looking",
  "look no further",
  "rest assured",
  "tailored to your needs",
  "functional and aesthetic",
  "aesthetic appeal and",
  "we often find",
  "we often observe",
  "we frequently recommend that",
  "we find that many",
  "this guide walks",
  "this guide walks through",
  "families can review",
  "readers can explore",
  "our team",
  "our experts",
  "our professionals",
  "it is worth noting",
  "it's worth noting",
  "in the realm of",
  "at the forefront",
  "stands as a testament",
  "peace of mind",
  "Related reading:",
  "related reading:",
] as const;

const FORBIDDEN_SENTENCE_SHAPES = `- Never write importance-claim openers like "Understanding [topic] is crucial/vital for [audience] to [verb]…". State facts and actions directly.
- Example NEVER to write: "Understanding these reforms is crucial for physicians to adapt their practices effectively."
- Write instead: "Physicians need to update billing workflows before the deadline." (direct fact, no padding.)
- Never open with a dictionary definition ("{topic} offers/are/provide {generic benefit}"). Lead with a sourced fact or number.
- Never use AI-template filler listed above (our team, this article provides, when it comes to, whether you're looking).`;

/** Max uses of understand-forms across one full article (title, body, FAQ, meta). Prefer 1. */
export const UNDERSTAND_FORMS_ARTICLE_MAX = 2;

export const UNDERSTAND_FORMS_USAGE_RULE = `- **HEADINGS (H2/H3/H4): ZERO TOLERANCE**: Never use understand, understanding, understands, understood, navigating, or navigate in any heading or agent title. Use active, direct titles (e.g. "5 New PST Categories", "2026 BC PST Expansion Rules", "How Businesses Comply").
- **Body copy**: understand-forms at most **once** per full article when possible; **hard maximum 2** total. Never repeat in every section.
- **Active voice (mandatory)**: Write direct statements ("Businesses must register by…") not passive padding ("Understanding X is important", "Navigating compliance requires…").`;

export const ACTIVE_VOICE_HEADING_RULE = `[HEADING STYLE]: Active, direct H2/H3 titles only. FORBIDDEN in headings: Understanding, Understand, Navigating, Navigate, Overview (except the fixed Overview block). Good: "5 New PST Categories", "2026 BC PST Rules for Businesses", "How to Register for PST". Bad: "Understanding the 5 New PST Categories", "Navigating the 2026 BC PST Expansion".`;

/** Full policy block (system prompts + saved artifact headers). */
export const GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK = `WORD BLACKLIST (mandatory; all clients, all sitemap/content output):
- Never use these words: ${GLOBAL_FORBIDDEN_WORDS.join(", ")}.
- Never use these phrases: ${GLOBAL_FORBIDDEN_PHRASES.join("; ")}.
- Punctuation: never use em dash (U+2014) or en dash (U+2013). Use a comma, period, or hyphen-minus for short joins. Never use HTML &mdash; or &ndash; entities in output.
- Trademarks & Copyrights (mandatory): always respect and include official registered trademark (®), trademark (™), or copyright (©) symbols on proprietary manufacturer product lines, automation systems, and brand names where applicable (infer from SERP research brief, page context, and official manufacturer naming, including inside link anchor text and prose).
- Customer-facing language in tables and prose (mandatory): never use internal estimator, invoice, or quote-sheet jargon such as "opening" / "openings" (e.g. "(Single Opening)", "(5 Openings)"), internal fabric/swatch SKU codes, or work-order shorthand in tables or prose. Always use plain customer-facing terms (e.g. "single window", "5 windows", or describe the fabric/opacity in plain English).
${FORBIDDEN_SENTENCE_SHAPES}
${UNDERSTAND_FORMS_USAGE_RULE}
- ${ACTIVE_VOICE_HEADING_RULE.replace(/\[HEADING STYLE\]: /, "")}
- Applies to titles, headings, body, meta, FAQ, excerpts, and rationale. Use plain, direct language.`;

export const FORBIDDEN_WORDS_MANDATORY_TAG = "[FORBIDDEN_WORDS - MANDATORY GLOBAL]";

export const FORBIDDEN_WORDS_USER_PROMPT_REMINDER = `[WORD BLACKLIST - NON-NEGOTIABLE]: Obey the full WORD BLACKLIST in the system prompt. Zero banned words in this section (headings, body, lists, link text). Never use crucial, vital, navigate, navigating, understand, understanding, or any word or phrase listed in the system blacklist.`;

export const FORBIDDEN_WORDS_CHECKLIST_SUFFIX = `${FORBIDDEN_WORDS_MANDATORY_TAG}: ${GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK}`;

export const FORBIDDEN_WORDS_BLUEPRINT_FEATURE = FORBIDDEN_WORDS_CHECKLIST_SUFFIX;

export const ARTICLE_WORD_FREQUENCY_CHECKLIST_ITEM = `[WORD_FREQUENCY]: Full article; understand-forms max ${UNDERSTAND_FORMS_ARTICLE_MAX} in body only (zero in headings). ${ACTIVE_VOICE_HEADING_RULE}`;
