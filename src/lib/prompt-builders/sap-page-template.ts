import { TABLE_NO_LINK_ONLY_COLUMN_RULE } from "@/lib/prompt-builders/table-prompt-rules";
import { UNIFIED_COPY_FORMATTING_RULE } from "@/lib/prompt-builders/title-rules";
import { UNIQUE_DYNAMIC_BODY_H2_RULE } from "@/lib/content-optimization/harness-heading-titles";

const SAP_PAGE_TEMPLATE_START = "--- SAP PAGE TEMPLATE (NON-NEGOTIABLE) ---";
const SAP_PAGE_TEMPLATE_END = "--- END SAP PAGE TEMPLATE ---";

/** Four-column chooser. Vertical-agnostic: rows come from this site's offerings and this place's jobs. */
export const SAP_LOCAL_RECOMMENDATION_TABLE_RULE = `**LOCAL RECOMMENDATION TABLE (SAP — NON-NEGOTIABLE)**:
This section is the [RECOMMENDATION] slot. It is a chooser, not an encyclopedia.
1. H2 title: write it from this connected site's trade and this place. Forbidden: a title copied from another trade.
2. First sentence names the recommendation for this place, then the HTML table. After the table, one closing sentence naming the connected business.
3. [TABLE] with exactly four columns: Product | Best for | Budget | Reason. Never a fifth link-only column. ${TABLE_NO_LINK_ONLY_COLUMN_RULE}
4. **Product:** Named offering from this connected site (Pages inventory title, first-party named line, or keyword-implied option this site sells). Link the name to the matching Pages URL when inventory has it: <a href="EXACT_URL" title="EXACT_PAGE_TITLE">anchor</a>. Forbidden: inventing an offering the site does not provide. Forbidden: hardcoded product lists from another trade.
5. **Best for:** One reader job-to-be-done for THIS trade in THIS place, derived from keyword + sourced local conditions + offerings. Not a restatement of the product name. Not a copied job list from another industry.
6. **Budget:** Sourced range with explicit CAD or USD and a unit when FIRST-PARTY / VERIFIED FACTS / audit provide figures. Qualify as illustrative. If no price source: "Quote; varies with {named drivers}". Forbidden: invented dollar ranges.
7. **Reason:** One sourced local condition or trade constraint that explains why this offering fits that job here. Forbidden: generic benefits that would work on any city page.
8. Rows: 4-6. Each row a different Best-for job. Product may repeat only when Reason differs.
9. Article table cap: this table plus What We Offer are the only two [TABLE] slots. [DECISION] must not add a third [TABLE].`;

export const SAP_FORBIDDEN_UNSUBSTANTIATED_LOCAL_EXPERTISE = `**FORBIDDEN UNSUBSTANTIATED LOCAL EXPERTISE (SAP)**: Claims such as "we understand [place] architecture / needs / market" are invalid unless the same paragraph names a sourced local condition from LLM audit, Wikipedia entity block, FIRST-PARTY CLAIMS, GBP, or existing HTML. If sources lack that condition, omit the expertise claim. Do not invent styles, projects, or businesses.`;

export function formatSapPageChecklistBlock(entity: string): string {
  const place = entity.trim() || "[Location]";
  return [
    SAP_PAGE_TEMPLATE_START,
    "This is a service-area (SAP) landing page. Do NOT emit encyclopedia how-it-works, vs-adjacent, or cost-guide jobs. Spine = location + specific customer problem for THIS connected site's trade + sourced local information + evidence + Local Recommendation table.",
    "Output exactly 7 numbered checklist items. Write each H2 title from the writing keyword and this connected site's trade. Every title is unique. Do not pin any H2.",
    UNIQUE_DYNAMIC_BODY_H2_RULE,
    `Place entity: ${place}`,
    UNIFIED_COPY_FORMATTING_RULE,
    "",
    "Required checklist items (write a unique topical H2 title, then [STRUCTURE] and markers):",
    `1. Local problem this writing keyword creates for this connected site's trade [STRUCTURE]: 2-3 paragraphs. Opener leads with a sourced local constraint that belongs to this trade. [LINK]: [[LINK:PAGES title words|anchor]] mid-sentence where a relevant PAGES target exists. **[EXACT PRIMARY PER H2]**: WRITING KEYWORD once in body only, not in the H2.`,
    `2. Local conditions that change the job for this trade [STRUCTURE]: 1-2 paragraphs. [LIST]: sourced facts that affect THIS connected site's service here. ${SAP_FORBIDDEN_UNSUBSTANTIATED_LOCAL_EXPERTISE} **[EXACT PRIMARY PER H2]**. [LINK]: [[LINK:PAGES title words|anchor]] mid-sentence where a relevant PAGES target exists.`,
    `3. Options that fit those conditions for this trade [STRUCTURE]: 2-3 paragraphs. [DECISION]: Situation | Importance list (not a third [TABLE]). **[EXACT PRIMARY PER H2]**. [LINK]: [[LINK:PAGES title words|anchor]] mid-sentence where a relevant PAGES target exists.`,
    `4. Unique topical H2 for the one worked example [STRUCTURE]: 1 summary paragraph, then scenario in <blockquote>. [ILLUSTRATIVE] + [BLOCKQUOTE]. No links in H2 or H3. Exactly one [ILLUSTRATIVE] on item 4 only. The example must be this connected site's buyer for the writing keyword, not a shopper of a product this site does not sell. Forbidden: a second homeowner or example H2.`,
    `5. What this connected site offers [STRUCTURE]: 1-2 short paragraphs. [TABLE]: Service/Product Name (Pages link) | Description. **[EXACT PRIMARY PER H2]**. [LINK]: in table names.`,
    `6. Recommendation for this place [RECOMMENDATION] + [TABLE]: follow LOCAL RECOMMENDATION TABLE. **[EXACT PRIMARY PER H2]**.`,
    `7. Next steps [STRUCTURE]: 1-2 paragraphs. [LIST]: numbered booking steps. [AGENT PERSONA]: friendly customer-service tone. [LINK]: [[LINK:PAGES title words|anchor]] mid-sentence where a relevant PAGES target exists.`,
    "",
    SAP_LOCAL_RECOMMENDATION_TABLE_RULE,
    "Article [TABLE] cap: What We Offer + Local Recommendation only.",
    "Forbidden H2 titles: Section N, colon subtitles, keyword slug in H2 text, \"We Care About [place]\", \"What is [topic]\", Introduction, a second homeowner or example heading.",
    SAP_PAGE_TEMPLATE_END,
  ].join("\n");
}

export function formatSapPageWriterBlock(entity?: string): string {
  const place = entity?.trim() || "";
  return [
    SAP_PAGE_TEMPLATE_START,
    "Writer: this is a SAP landing page. Answer the local customer problem for THIS connected site's trade and the writing keyword. Use sourced local facts that belong to that trade. End recommendation sections with the Local Recommendation table, not extra encyclopedia paragraphs.",
    place ? `Place entity: ${place}` : "",
    UNIFIED_COPY_FORMATTING_RULE,
    UNIQUE_DYNAMIC_BODY_H2_RULE,
    SAP_LOCAL_RECOMMENDATION_TABLE_RULE,
    SAP_FORBIDDEN_UNSUBSTANTIATED_LOCAL_EXPERTISE,
    "When this section is [RECOMMENDATION]: 1-2 short paragraphs plus the four-column table. ILLUSTRATIVE still has no table.",
    `Exactly one [ILLUSTRATIVE] section on the whole page (checklist item 4 only). Forbidden: a second blockquote scenario, a second homeowner H2, or Recommendation h3 outside item 4.`,
    SAP_PAGE_TEMPLATE_END,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatSapChecklistExample(entity: string, _title: string): string {
  const place = entity.trim() || "[Location]";
  return `1. Local problem for this trade in ${place} [STRUCTURE]: 2-3 paragraphs. Opener leads with a sourced local constraint. **[EXACT PRIMARY PER H2]**. [LINK]: [[LINK:PAGES title words|anchor]] mid-sentence where a relevant PAGES target exists.
2. Local conditions that change the job [STRUCTURE]: 1-2 paragraphs. [LIST]: sourced facts for this trade. **[EXACT PRIMARY PER H2]**. [LINK]: [[LINK:PAGES title words|anchor]] mid-sentence where a relevant PAGES target exists.
3. Options that fit those conditions [STRUCTURE]: 2-3 paragraphs. [DECISION]: Situation | Importance list. **[EXACT PRIMARY PER H2]**. [LINK]: [[LINK:PAGES title words|anchor]] mid-sentence where a relevant PAGES target exists.
4. Unique topical H2 for the one worked example [STRUCTURE]: 1 intro paragraph, then scenario in body. [ILLUSTRATIVE]. [BLOCKQUOTE]. **[EXACT PRIMARY PER H2]**. [LINK]: in body only. Forbidden: a second homeowner or example H2.
5. What this site offers [STRUCTURE]: 1-2 short paragraphs. [TABLE]: Product/Service Name (Pages link) | Description. **[EXACT PRIMARY PER H2]**. [LINK]: in table names.
6. Recommendation in ${place} [STRUCTURE]: 1-2 paragraphs. [RECOMMENDATION]. [TABLE]: Product | Best for | Budget | Reason. **[EXACT PRIMARY PER H2]**.
7. Next steps [STRUCTURE]: 1-2 paragraphs. [LIST]: numbered booking steps. **[EXACT PRIMARY PER H2]**. [LINK]: [[LINK:PAGES title words|anchor]] mid-sentence where a relevant PAGES target exists.`;
}

export function sapPageTemplateIsActive(prompt: string): boolean {
  return prompt.includes(SAP_PAGE_TEMPLATE_START);
}
