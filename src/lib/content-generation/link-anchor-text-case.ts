/** Sentence-case internal link anchors; brand/proper tokens stay capitalized. */

const COMMON_ANCHOR_WORDS = new Set([
  "rechargeable",
  "battery",
  "wand",
  "wands",
  "motorization",
  "motorized",
  "operating",
  "systems",
  "system",
  "solar",
  "chargers",
  "charger",
  "repair",
  "blinds",
  "shades",
  "window",
  "treatments",
  "coverings",
  "automated",
  "smart",
  "manual",
  "traditional",
  "features",
  "options",
  "guide",
  "services",
  "installation",
  "maintenance",
  "parts",
  "service",
  "power",
  "drapery",
  "cellular",
  "roman",
  "roller",
  "vertical",
  "horizontal",
  "wood",
  "fabric",
  "control",
  "controls",
  "remote",
  "home",
  "homeowner",
  "homeowners",
  "local",
  "near",
  "best",
  "top",
  "how",
  "what",
  "why",
  "when",
  "where",
  "buy",
  "cost",
  "costs",
  "price",
  "pricing",
  "types",
  "type",
  "benefits",
  "benefit",
  "comparison",
  "comparing",
  "choosing",
  "choose",
  "common",
  "issues",
  "issue",
  "maximize",
  "lifespan",
  "explained",
  "related",
  "page",
]);

const MULTI_WORD_BRANDS: string[][] = [
  ["hunter", "douglas"],
  ["blind", "magic"],
];

export const INTERNAL_LINK_ANCHOR_CASE_RULE = `**INTERNAL LINK ANCHOR CASE (NON-NEGOTIABLE)**:
- Link anchor text ([[LINK:...|anchor]], same-site <a> tags, Overview # scroll links) uses **sentence case**.
- Capitalize **only** proper nouns, registered product lines, and brand names (e.g. Hunter Douglas, PowerView, Blind Magic).
- Generic descriptive words stay lowercase: rechargeable battery wands, solar chargers, operating systems — NOT Rechargeable Battery Wands, Solar Chargers.
- Title Case applies to H2/H3 headings, post titles, and WRITING KEYWORD mentions — **not** to link anchor phrases.
- When LINK TARGETS PLAN lists suggestedAnchor, use that casing exactly.`;

/** Minimum [[LINK]] placeholders required in each body H2 section (Overview/FAQ excluded). */
export const MIN_INTERNAL_LINKS_PER_BODY_H2 = 2;

/** Target [[LINK]] count per body H2 (tables and longer sections). */
export const TARGET_INTERNAL_LINKS_PER_BODY_H2 = 5;

export const INTERNAL_LINKS_PER_SECTION_RULE = `**INTERNAL LINKS PER SECTION (NON-NEGOTIABLE)**:
- Every body H2 section (not Overview, not FAQ, not Answer) MUST include **${MIN_INTERNAL_LINKS_PER_BODY_H2} to ${TARGET_INTERNAL_LINKS_PER_BODY_H2}** distinct [[LINK:query|anchor]] placeholders. Aim for **${TARGET_INTERNAL_LINKS_PER_BODY_H2}** when the section has a table or 3+ paragraphs.
- Spread links across prose paragraphs and table cells. Weave each [[LINK]] mid-sentence with words before and after the token.
- When THIS SECTION LINK ASSIGNMENTS or LINK TARGETS PLAN lists entries for this H2, emit one [[LINK]] for each assigned query (exact query string) before using any other inventory title.
- Forbidden: a leftover keyword, page title, or [[LINK]] after the last period (". durable window coverings"). Never write "Related reading:" or "See [link]." tails at the end of a paragraph. All internal links must be woven in context mid-sentence. If you cannot weave a remaining link inside a sentence you are already writing, STOP. Do not append it.
- Forbidden: shipping a body H2 with fewer than ${MIN_INTERNAL_LINKS_PER_BODY_H2} internal links when PAGES or BLOG POSTS inventory exists.`;

function isMixedCaseBrand(word: string): boolean {
  if (word.length < 3 || !/^[A-Z]/.test(word)) return false;
  const rest = word.slice(1);
  return /[a-z]/.test(rest) && /[A-Z]/.test(rest);
}

function shouldCapitalizeWord(word: string): boolean {
  if (isMixedCaseBrand(word)) return true;
  const lower = word.toLowerCase();
  if (COMMON_ANCHOR_WORDS.has(lower)) return false;
  return /^[A-Z][a-z]+$/.test(word) && word.length >= 3;
}

function formatWordForAnchor(word: string): string {
  if (isMixedCaseBrand(word)) return word;
  if (shouldCapitalizeWord(word)) {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }
  return word.toLowerCase();
}

function applyMultiWordBrands(phrase: string): string {
  let out = phrase;
  for (const parts of MULTI_WORD_BRANDS) {
    const pattern = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
    const canonical = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
    out = out.replace(new RegExp(`\\b${pattern}\\b`, "gi"), canonical);
  }
  return out;
}

/** Short sentence-case anchor from a destination page title (default 2–3 words). */
export function toSentenceCaseLinkAnchor(title: string, maxWords = 3): string {
  const cleaned = title.replace(/<[^>]+>/g, "").replace(/[^\w\s'-]/g, " ").trim();
  const words = cleaned.split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return "";
  const pick = words.length <= maxWords ? words : words.slice(0, maxWords);
  const phrase = pick.map(formatWordForAnchor).join(" ");
  return applyMultiWordBrands(phrase);
}
