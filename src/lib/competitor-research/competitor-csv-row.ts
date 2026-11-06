import type { CompetitorComparisonResult } from "@/lib/competitor-research/types";

const COMPETITOR_CSV_KEYWORD_PREFIX = "competitor - ";

/** Bulk CSV keyword cell: signals competitor-comparison rows to the generator. */
export function buildCompetitorCsvKeyword(competitorName: string): string {
  const name = competitorName.trim();
  if (!name) {
    throw new Error("Competitor name is required for CSV keyword.");
  }
  return `${COMPETITOR_CSV_KEYWORD_PREFIX}${name}`;
}

export function isCompetitorCsvKeyword(keyword: string | undefined): boolean {
  return /^competitor\s*-\s*.+/i.test((keyword ?? "").trim());
}

/** Row or keyword-only check for competitor-comparison bulk routing and prompts. */
export function isCompetitorComparisonRow(row: { keyword?: string } | undefined): boolean {
  return isCompetitorCsvKeyword(row?.keyword);
}

/** ACF `competitor_fields` value: "{competitor name}, {focus keyword}". */
export function buildCompetitorFieldsValue(competitorName: string, focusKeyword: string): string {
  const competitor = competitorName.trim();
  const focus = focusKeyword.trim();
  if (!competitor || !focus) {
    throw new Error("Competitor name and focus keyword are required for competitor_fields.");
  }
  return `${competitor}, ${focus}`;
}

/** Injected into bulk checklist/blueprint prompts for competitor-comparison CSV rows. */
export const COMPETITOR_COMPARISON_PROSE_PROMPT_BLOCK = `COMPETITOR COMPARISON ROW (READER-FACING COPY — MANDATORY):
- The CSV keyword cell looks like "competitor - Business Name". That prefix is for bulk research routing only.
- NEVER write "competitor -", "Competitor –", "Competitor:", "choosing a competitor", or similar in titles, headings, intros, tables, or body copy.
- Primary SEO phrase for the article (exact primary per H2, Rank Math focus): the competitor business name from keyword_focus / entity — write that name normally, not the "competitor - …" label.
- Service or product category context (e.g. blinds, window coverings) comes from the row modifier and title, not from the Clusters search keyword field.
- The connected site (your client) is the host brand; entity is the other local business you compare against by name.
- NEVER label the connected site as a competitor.
- NEVER treat the competitor business name as a geography: forbidden "near {competitor}", "in {competitor} area", "homes in {competitor}", "shoppers near {competitor}".
- Write Edmonton / area climate and home-style context as regional facts, not as if the competitor were a place entity.
- Use first-person "we" for the connected site offerings only. Contrast through examples (Hunter Douglas depth, PowerView, in-home measure, repair/service longevity), not superlatives ("best", "#1", "the right choice", "you should choose").`;

/** Editorial modifier for bulk CSV (not JSON). */
export function buildCompetitorRowModifier(args: {
  focusKeyword: string;
  competitorName: string;
  connectedSiteName: string;
  comparison: CompetitorComparisonResult;
  promptModifier?: string;
}): string {
  const focus = args.focusKeyword.trim();
  const competitor = args.competitorName.trim();
  const connected = args.connectedSiteName.trim();
  if (!focus || !competitor || !connected) {
    throw new Error("Focus keyword, competitor name, and connected site are required for row modifier.");
  }

  const parts: string[] = [
    `Competitor comparison for ${focus}. Compare ${competitor} with ${connected}. Editorial comparison for Edmonton-area homeowners; show connected-site strengths through product examples and scenarios, not slogans or "best choice" claims.`,
  ];

  const positioning = args.comparison.positioningNotes.trim();
  if (positioning) {
    parts.push(positioning);
  }

  const userMod = args.promptModifier?.trim();
  if (userMod) {
    parts.push(userMod);
  }

  return parts.join(" ");
}
