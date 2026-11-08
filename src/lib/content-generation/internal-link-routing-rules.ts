import {
  INTERNAL_LINK_ANCHOR_CASE_RULE,
  MIN_INTERNAL_LINKS_PER_BODY_H2,
  TARGET_INTERNAL_LINKS_PER_BODY_H2,
} from "@/lib/content-generation/link-anchor-text-case";

/** Shared writer + resolver contract. No named brands or verticals. */
export const INTERNAL_LINK_ANCHOR_MATCH_RULE =
  "Anchor text must share at least one distinctive word from the resolved destination page title. When LINK TARGETS PLAN lists suggestedAnchor, use that anchor or a close variant with shared title tokens. Copy each [[LINK]] query EXACTLY from the plan. Forbidden: anchor names one product line while the plan URL is a different product page unless the destination title includes that brand term. Forbidden: raw same-site <a href> in body sections. " +
  INTERNAL_LINK_ANCHOR_CASE_RULE.replace(/\*\*/g, "");

export const INTERNAL_LINK_INTENT_ROUTING_RULE =
  `Brand, product, service, and commercial terms: [[LINK]] query uses PAGES title words (product and service pages from page-sitemap.xml). Informational keywords (how-to, guide, comparison, education): [[LINK]] query uses BLOG POSTS title words. If the same brand or product name appears in both PAGES and BLOG POSTS, the query must use the PAGES title, never the blog title. Every body H2 must include ${MIN_INTERNAL_LINKS_PER_BODY_H2}-${TARGET_INTERNAL_LINKS_PER_BODY_H2} [[LINK:PAGES title words|short anchor]] placeholders (target ${TARGET_INTERNAL_LINKS_PER_BODY_H2} when the section has a table or 3+ paragraphs). Weave links in prose and table cells. Same token in table cells and lists. Forbidden: raw <a href>, [text](https://...) markdown, or pasted internal URLs. Emit [[LINK:query|anchor]] only. ` +
  INTERNAL_LINK_ANCHOR_MATCH_RULE;
