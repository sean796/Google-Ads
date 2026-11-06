import type { KeywordAIAnalysis } from "../keyword-types";
import type { PromptBulkSitemapInventoryBuckets } from "../bulk/prompt-bulk-sitemap-inventory";
import {
  BULK_CONTENT_BLOG_TITLE_COLON_BAN,
  BULK_SERVICE_AREA_GAP_CSV_FEATURED_IMAGE,
  CONTENT_VARIETY,
  INVENTORY_CANNIBALIZATION,
  TITLE_FORMAT_VARIETY,
  TITLE_RULES,
  type BulkBlogIdeasContentKind,
} from "./bulk-ideas-rules";

export function buildGeneralIntentBlock(flowPurpose: string, n: number): string {
  if (!flowPurpose?.trim()) return "";
  return `
=== CONTENT TOPIC / GENERAL INTENT (MANDATORY - EVERY SINGLE IDEA) ===
General intent: "${flowPurpose.trim()}"

**EVERY idea - Idea #1 through Idea #${n} - MUST be strictly about this topic.** Every keyword and every title must fit "${flowPurpose.trim()}".

**CRITICAL:** Do NOT lift topics from the site inventory. Inventory = cannibalization only. Each idea must align with the content topic; fill gaps the inventory does not cover.
=== END CONTENT TOPIC ===`;
}

export function buildContentVarietyInstruction(hasSiteInventory: boolean): string {
  if (hasSiteInventory) {
    return "At least 2 content types (e.g. versus, how-to, guide). Mix types across ideas. When sitemap inventory blocks are present: do **not** prioritize versus/comparison posts if any bucket already contains the same comparison intent or search angle—pick formats and angles that clearly do not overlap any existing url/title/keyword.";
  }
  return CONTENT_VARIETY;
}

export function buildTargetSiteBlock(connectedSite: { name: string; siteUrl: string }): string {
  return `
=== TARGET SITE ===
Site: ${connectedSite.name} (${connectedSite.siteUrl})
Use for topics, tone, context - not as entity. All ideas relevant to ${connectedSite.name}.
**Keyword / Title — never own trading name (fuzzy)**: Do NOT use the company trading name from "${connectedSite.name}" as Keyword (fuzzy / word-reorder: e.g. "Blind Magic" ↔ "Magic Blinds"). Blocked topics (Bali Blinds) stay out. Product/service phrases and dealer product lines (Hunter Douglas, Alta, etc.) are fine.
=== END TARGET SITE ===`;
}

export function buildKbBlock(
  activeKnowledgeBaseText: string,
  connectedSite?: { name: string; siteUrl: string }
): string {
  const siteLine = connectedSite ? ` Align with ${connectedSite.name}.` : "";
  return `
=== KNOWLEDGE BASE (PRIMARY SOURCE - RAG FOR NEW IDEAS ONLY) ===
${activeKnowledgeBaseText}
Use ONLY this block for ideation: topics, services, products, themes, and any JSON/strategy files you uploaded here. Extract keywords and gaps; ideas = natural extensions.${siteLine}
Do not use SITE_INVENTORY_POSTS_JSON, SITE_INVENTORY_PAGES_JSON, or SITE_INVENTORY_SAP_JSON (in the user message) as topic sources - they are exclude-only.
=== END KNOWLEDGE BASE ===`;
}

export function hasSitemapInventory(
  siteInventoryBuckets?: PromptBulkSitemapInventoryBuckets,
  siteInventoryJson?: string,
): boolean {
  if (siteInventoryJson?.trim()) return true;
  if (!siteInventoryBuckets) return false;
  return countNonemptySitemapBuckets(siteInventoryBuckets) > 0;
}

export function countNonemptySitemapBuckets(buckets: PromptBulkSitemapInventoryBuckets): number {
  return [buckets.posts, buckets.pages, buckets.sap].filter((b) => b.json.trim()).length;
}

export function appendSiteInventoryBucketsToUserPrompt(
  out: string,
  buckets: PromptBulkSitemapInventoryBuckets,
): string {
  const sections: Array<{ key: string; label: string; json: string; rowCount: number }> = [
    { key: "POSTS", label: "Posts sitemap (blog posts)", ...buckets.posts },
    { key: "PAGES", label: "Pages sitemap (pages + page-bucket CPTs)", ...buckets.pages },
    { key: "SAP", label: "SAP / entity sitemap (service-area landings)", ...buckets.sap },
  ];

  let result = out;

  for (const section of sections) {
    if (!section.json.trim()) continue;
    result +=
      `\n=== SITE_INVENTORY_${section.key}_JSON (${section.label}; ${section.rowCount} URLs) ===\n` +
      section.json.trim() +
      `\n=== END SITE_INVENTORY_${section.key}_JSON ===\n`;
  }
  return result;
}

export function buildSiteInventorySystemBlock(bucketCount: number): string {
  return `
=== SITE INVENTORY (see user message - EXCLUSION LIST, NOT RAG) ===
The user message contains ${bucketCount} JSON block(s) marked SITE_INVENTORY_POSTS_JSON, SITE_INVENTORY_PAGES_JSON, and/or SITE_INVENTORY_SAP_JSON. Together they list every published post, page, and entity/service-area URL on the site.
${INVENTORY_CANNIBALIZATION}
=== END SITE INVENTORY INSTRUCTIONS ===`;
}

export function buildGscKeywordsBlock(gscExactKeywords: string[], n: number, flowPurpose?: string): string {
  const list = gscExactKeywords.map((kw, i) => `${i + 1}. "${kw}"`).join("\n");
  const intentOverride = flowPurpose?.trim()
    ? `\n**When content topic "${flowPurpose.trim()}" is set: use each GSC keyword ONLY if it fits this topic and passes inventory exclusion; if not, pick another SITE_KW_JSON line that fits.**\n`
    : "";
  return `
=== GSC KEYWORDS ===
${list}
${intentOverride}
These passed inventory review. Use only when they still do not overlap site inventory intent. Skip any that match existing post topics; pick a different line from SITE_KW_JSON instead. ${n} ideas. If USER KEYWORD SLOTS are present, assign GSC phrases to empty rows only. Never replace a locked user Keyword.
For the Keyword column: use each selected phrase as written only when it is already a clean short-tail commercial keyword. Distill longer commercial/question phrases into **complete 2–3 word intent keywords** and drop near-me / city / neighborhood proximity language. Examples: "how much do solar panels cost in alberta" -> "solar panels cost"; "how much does it cost to install solar panels" -> "solar panel installation cost". Never output broken fragments like "how much do solar panels" or "how much do solar energy". **Exception - government / policy / incentives / grants / rebates / regulations / tax credits:** keep jurisdiction (country and federal/provincial/state) already present in the selected keyword - do not strip it. The article body can still address the full query.
Never copy an existing inventory title. Write original titles for every row.
=== END GSC KEYWORDS ===`;
}

export function buildSiteKwJsonStepBlock(
  siteKwJsonText: string,
  selectedKeywords: string[] | undefined,
  filledUserSlotCount = 0,
): string {
  const hasSelected = Boolean(selectedKeywords?.length);
  const selected = hasSelected
    ? selectedKeywords!.map((kw, i) => `${i + 1}. "${kw}"`).join("\n")
    : "(none — you must pick from SITE_KW_JSON below)";
  const slotOverride =
    filledUserSlotCount > 0
      ? `USER KEYWORD SLOTS override this block. Do not assign a SITE_KW_JSON or SELECTED_LOW_HANGING_KEYWORDS phrase to any row that already has a user Keyword. Use this list only for empty slots.\n`
      : "";
  const selectionRules = hasSelected
    ? `Each empty-slot idea's Keyword should use SELECTED_LOW_HANGING_KEYWORDS when they pass inventory review, but the displayed Keyword must be the cleaned short-tail form. Skip any selected keyword that still overlaps inventory intent; pick another line from SITE_KW_JSON instead.\n`
    : `Before generating ideas, read SITE INVENTORY in this message. Then read SITE_KW_JSON below.\n` +
      `For each empty-slot idea, pick ONE gsc or semrush line whose search intent is NOT already covered in inventory.\n` +
      `- SKIP lines that match existing topics (example: skip "national seo" when inventory has national-seo-canada).\n` +
      `- SKIP lines that overlap any published post title or slug intent.\n` +
      `- Distill each chosen line to a clean 2-3 word short-tail keyword.\n` +
      `- Never copy an existing inventory title. Write original titles.\n`;
  return (
    `STEP 0 - READ SITE_KW_JSON (mandatory before ideas):\n` +
    `This JSON contains scraped Semrush and GSC keyword lists for the target site. Metrics were used to sort them locally, then removed to save tokens. Prioritize Semrush first, then GSC. Read it before generating ideas.\n` +
    slotOverride +
    selectionRules +
    `Distill question/long-tail entries into complete noun/intent keywords, not broken fragments. Preserve jurisdiction on government/policy/incentives/grants keywords.\n` +
    `Invented keywords: informational or transactional intent only; 2-3 words for commercial keywords (no near-me / city proximity spam); government/policy inventions must include jurisdiction inferred from the connected site context; no cannibalization with other ideas or the site inventory.\n\n` +
    `=== SELECTED_LOW_HANGING_KEYWORDS ===\n${selected}\n=== END SELECTED_LOW_HANGING_KEYWORDS ===\n\n` +
    `=== SITE_KW_JSON ===\n${siteKwJsonText.trim()}\n=== END SITE_KW_JSON ===\n\n`
  );
}

export function buildKeywordAnalysisBlock(
  keywordAnalysisResults: Map<string, KeywordAIAnalysis>,
  n: number
): string {
  const entries = Array.from(keywordAnalysisResults.entries()).slice(0, n);
  const lines = entries.map(([keyword, a], i) => {
    const v = a.keywordSuggestions?.variations?.slice(0, 5) || [];
    const lt = a.keywordSuggestions?.longTail?.slice(0, 3) || [];
    const sem = a.keywordSuggestions?.semantic?.slice(0, 3) || [];
    const h2s = a.h2Suggestions?.slice(0, 5) || [];
    const gaps = a.contentGaps?.slice(0, 3) || [];
    return `${i + 1}. "${keyword}"\n   Variations: ${v.length ? v.map((x) => `"${x}"`).join(", ") : "None"}\n   Long-tail: ${lt.length ? lt.map((x) => `"${x}"`).join(", ") : "None"}\n   Semantic: ${sem.length ? sem.map((x) => `"${x}"`).join(", ") : "None"}${h2s.length ? `\n   H2 ideas: ${h2s.map((h) => h.heading).join(", ")}` : ""}${gaps.length ? `\n   Gaps: ${gaps.map((g) => g.topic).join(", ")}` : ""}`;
  }).join("\n\n");
  return `
=== KEYWORD AI ANALYSIS ===
${lines}
Use for: variations, structure (H2), content gaps. When picking a primary keyword for each idea, prefer 2–3 word short-tail intent phrases derived from this analysis.
=== END KEYWORD AI ANALYSIS ===`;
}

export function buildTitleInstruction(_titleTemplate: string, n: number, contentKind: BulkBlogIdeasContentKind): string {
  const base = `${TITLE_RULES} ${TITLE_FORMAT_VARIETY} All ${n} titles under 60 chars, no pipe, different formats.`;
  return contentKind === "content_blog" ? `${base}\n${BULK_CONTENT_BLOG_TITLE_COLON_BAN}` : base;
}

export function buildExampleFormat(
  n: number,
  titleTemplate: string,
  entityMode: string,
  keywordMode: string,
  keywordValue: string,
  optionalPrompt: string,
  featuredImage: boolean,
  contentKind: BulkBlogIdeasContentKind,
): string {
  if (contentKind === "service_area_sap") {
    return `Example (local geo landing rows — vary title patterns; do not copy these verbatim):\n1. Keyword: "residential solar denver", Entity: "Denver CO", Title: "Residential Solar in Denver CO", MetaDescription: "Trusted residential solar in Denver. Compare options, incentives, and what to expect before you install. Request a consultation today.", Modifier: "", FeaturedImage: "${BULK_SERVICE_AREA_GAP_CSV_FEATURED_IMAGE}"\n2. Keyword: "custom blinds calgary", Entity: "Calgary AB", Title: "Custom Blinds Near Calgary", MetaDescription: "Explore custom blinds near Calgary: styles, light control, and expert fitting for Alberta homes. Book a consultation.", Modifier: "", FeaturedImage: "${BULK_SERVICE_AREA_GAP_CSV_FEATURED_IMAGE}"\n3. ... (Modifier must be empty on every line; FeaturedImage must be ${BULK_SERVICE_AREA_GAP_CSV_FEATURED_IMAGE} on every line; each new row a different title structure)`;
  }
  const entityVal = entityMode === "manual" ? "ScraperAPI" : entityMode === "blank" ? "" : "ScraperAPI";
  const kwVal = keywordMode === "same" ? keywordValue : "web scraping api";
  const fill = (kw: string, ent: string, num: string) =>
    titleTemplate
      .replace("[Keyword]", kw)
      .replace("[Entity]", ent)
      .replace("[Location]", "")
      .replace("[Number]", num)
      .trim();
  if (titleTemplate) {
    const e = entityMode === "blank" ? "" : entityVal;
    return `Example:\n1. Keyword: "python web scraping", Entity: "${e}", Title: "${fill("python web scraping", e, "1")}", MetaDescription: "Learn Python web scraping step-by-step. Compare libraries, avoid pitfalls, and build scrapers that work. Start here.", Modifier: "${optionalPrompt || "beginner-friendly"}", FeaturedImage: "${featuredImage ? "y" : "n"}"${optionalPrompt ? ', Rationale: "..."' : ""}\n2. ... (same pattern; Keyword always 2–3 words)`;
  }
  return `Example:\n1. Keyword: "${kwVal}", Entity: "${entityVal}", Title: "Web Scraping Vs API Which Should You Choose?", MetaDescription: "Web scraping vs API: pros, cons, and when to use each. Make the right integration choice for your project.", Modifier: "${optionalPrompt || "versus"}", FeaturedImage: "${featuredImage ? "y" : "n"}"${optionalPrompt ? ', Rationale: "..."' : ""}\n2. Keyword: "api integration", Entity: "...", Title: "...", MetaDescription: "...", ...\n3. ...`;
}

export function countFilledSlotKeywords(slotKeywords?: string[]): number {
  return slotKeywords?.filter((kw) => kw.trim()).length ?? 0;
}

export function buildSlotKeywordsBlock(slotKeywords: string[]): string {
  if (!slotKeywords.length) return "";
  const filled = countFilledSlotKeywords(slotKeywords);
  const lines = slotKeywords.map((kw, i) => {
    const trimmed = kw.trim();
    const row = i + 1;
    return trimmed
      ? `Row ${row}: Keyword is locked to exactly "${trimmed}". Copy it verbatim into the Keyword field only. Do not distill, shorten, reorder, or replace it. Do not paste this Keyword as Title. Title is a separate editorial headline written by the title agent from this topic.`
      : `Row ${row}: no user keyword — pick one unique 2–3 word short-tail intent keyword (no near-me / city spam; government/policy inventions must include jurisdiction). GSC / SITE_KW_JSON may fill this row only.`;
  });
  const lockRule =
    filled > 0
      ? `\nLocked-slot rule: short-tail / distill / GSC / low-hanging instructions apply ONLY to empty Keyword rows. A filled user Keyword stays in Keyword only. Title is never the Keyword string.`
      : "";
  return `\n=== USER KEYWORD SLOTS (${slotKeywords.length} rows, ${filled} locked) ===\n${lines.join("\n")}${lockRule}\n=== END USER KEYWORD SLOTS ===\n`;
}

export function buildSlotModifiersBlock(slotModifiers: string[]): string {
  if (!slotModifiers.length || !slotModifiers.some((m) => m.trim())) return "";
  const lines = slotModifiers.map((mod, i) => {
    const trimmed = mod.trim();
    const row = i + 1;
    return trimmed
      ? `Row ${row}: apply this modifier to title, angle, and checklist Modifier field: "${trimmed}".`
      : `Row ${row}: no per-row modifier.`;
  });
  return `\n=== USER MODIFICATION SLOTS (${slotModifiers.length} rows) ===\n${lines.join("\n")}\n=== END USER MODIFICATION SLOTS ===\n`;
}
