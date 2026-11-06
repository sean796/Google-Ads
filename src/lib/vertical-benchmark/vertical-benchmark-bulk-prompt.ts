import type { WordPressSite } from "@/components/integrations/types";
import { appendMasterInstructionsToSystemPrompt } from "@/lib/master-instructions-storage";
import {
  BENCHMARK_SEO_CONTENT_SPECIALIST_PERSONA,
  BENCHMARK_SITE_INVENTORY_CANNIBALIZATION,
  buildInventoryCannibalPromptBlock,
  countInventoryPromptRows,
} from "@/lib/vertical-benchmark/vertical-benchmark-inventory-cannibal";
import {
  BULK_BENCHMARK_TOPIC_EXCLUSIONS_BLOCK,
  BULK_CANNIBALIZATION_INSTRUCTIONS,
  globalExclusionBlockForPrompt,
  type GlobalBulkDedupeState,
} from "@/lib/vertical-benchmark/vertical-benchmark-bulk-dedupe";
import {
  buildGscClusterPromptBlock,
  type BrandProductLineCluster,
} from "@/lib/vertical-benchmark/vertical-benchmark-gsc-clusters";
import {
  normalizeGscPositionForTokens,
  type GscTop10RagPage,
  type GscTop10RagPayload,
} from "@/lib/vertical-benchmark/vertical-benchmark-gsc-rag";
import { buildForbiddenInventoryOutputsBlock } from "@/lib/vertical-benchmark/vertical-benchmark-inventory-gsc";
import { CLIENT_OFFERINGS_PROMPT_RULES } from "@/lib/vertical-benchmark/vertical-benchmark-site-context";
import type { VerticalBenchmarkContentKind } from "@/lib/vertical-benchmark/vertical-benchmark-types";
import type { BenchmarkPipelineStep } from "@/lib/vertical-benchmark/vertical-benchmark-pipeline-types";

export type BenchmarkClientPlan = {
  site: WordPressSite;
  siteUrl: string;
  categoryLabel: string;
  contentKind: VerticalBenchmarkContentKind;
  siteInventoryJson: string;
  clientOfferingsBlock: string;
  verifiedBrands: string[];
  gscPayload: GscTop10RagPayload;
  gscClusters: BrandProductLineCluster[];
  /** GSC pages that receive a CSV row (merged cluster members excluded). */
  outputPages: GscTop10RagPage[];
  /** Bulk rows to produce = outputPages.length (may be less than raw GSC URL count). */
  expectedRows: number;
  /** When set, Local Dominator grid is appended to the Gemini user prompt (GSC + grid RAG). */
  gridRagBlock?: string;
};

function buildDedupeRulesBlock(rowCount: number): string {
  return `
NO DUPLICATES (mandatory):
- Every title in rows[] must be unique — no exact repeats and no light rephrases.
- Every keyword must be unique in rows[].
- Vary title format across rows: not every "X vs Y", not every "Guide to…".
${BENCHMARK_SITE_INVENTORY_CANNIBALIZATION}
${BULK_CANNIBALIZATION_INSTRUCTIONS}
ROW COUNT LOCK (overrides omit/merge): rows[] MUST contain exactly ${rowCount} object(s). Never omit a numbered GSC line. If two lines share intent or a line overlaps SITE_INVENTORY, pivot keyword and title — do not drop the row. Ignore any instruction that says to omit a row or keep only the stronger one by deleting the other.
Within rows[] for this client: apply cannibalization rules across all ${rowCount} row(s) and against every SITE_INVENTORY entry before returning JSON.`;
}

/** Short content-type labels for bulk CSV `modifier` (drives prompt_modifier at publish). */
export const BULK_BENCHMARK_MODIFIER_VALUES = [
  "comparison",
  "explainer",
  "guide",
  "how-to",
  "product review",
  "service",
  "consultation",
  "opinion",
  "trends",
  "future",
] as const;

export type BulkBenchmarkModifier = (typeof BULK_BENCHMARK_MODIFIER_VALUES)[number];

const MODIFIER_RULES_BLOCK = `
MODIFIER column (mandatory — separate from featuredImage):
- modifier is a short content-type label (writer brief). Never use "y", "n", or "google-maps" in modifier — those belong only in featuredImage.
- Use exactly one value per row from: ${BULK_BENCHMARK_MODIFIER_VALUES.join(", ")}.
- Match title/GSC URL intent: "A vs B" / Showdown → comparison; how-to / remove / clean / safely / explained → how-to or explainer; "Guide" → guide; named product evaluation → product review; repair / when to call a pro → service; worth it / are they → opinion; trends / design trends → trends; smart / automated / future tech → future; consultation / book → consultation.
- Vary modifier across rows when titles differ; do not default every row to the same type.`;

const NO_GEO_IN_TITLE_BLOCK = `
TITLE — NO PLACES (mandatory):
- Title must NEVER include city, state, province, region, country, or neighborhood names.
- Forbidden patterns: "Florida Interior Design…", "Calgary Blinds", "Design Trends in Texas", "Edmonton Window Treatments", "near [Place]", "in [City]".
- Use national or generic educational framing only (product, comparison, how-to, guide) with zero geography in Title.
- Keyword already must have no place names; Title must follow the same rule.`;

const ENTITY_TITLE_BLOCK = `
TITLE — SERVICE AREA (entity mode):
- Adapt each GSC service-area / location URL into one row for that market.
- Title may include city or region when it matches the GSC page and CLIENT_OFFERINGS_CONTEXT (location landing pages).
- keyword: short-tail intent; place names allowed when the exemplar URL is a location page.`;

const ENTITY_TITLE_WITH_GRID_BLOCK = `
TITLE — SERVICE AREA (entity mode + grid):
- Adapt each GSC service-area URL using LOCAL_DOMINATOR_GRID for place names (hyperlocal first segment, then city).
- entity column must use place labels from the grid evidence; do not invent cities outside the grid footprint.
- Title may include city/region when it matches the GSC URL and grid hints.`;

function postEntityColumnRules(): string {
  return `- entity must be "" on every row. featuredImage must be "y" on every row.`;
}

function entityEntityColumnRules(): string {
  return `- entity is REQUIRED on every row: geographic place label for this client (from the GSC service-area URL, GMB, and CLIENT_OFFERINGS_CONTEXT). Not the literal word "entity".
- featuredImage must be "y" on every row.`;
}


export function buildClientGscBulkAdaptPrompt(
  plan: BenchmarkClientPlan,
  globalDedupe: GlobalBulkDedupeState,
): {
  system: string;
  user: string;
} {
  const pages = plan.outputPages;
  const n = pages.length;
  const urlList = pages
    .map(
      (p, i) =>
        `${i + 1}. exemplar_url=${p.url} clicks=${p.clicks} impressions=${p.impressions} position=${normalizeGscPositionForTokens(p.position)}`,
    )
    .join("\n");

  const hasClusters = plan.gscClusters.length > 0;
  const clusterBlock = hasClusters
    ? buildGscClusterPromptBlock(plan.gscPayload.topPages, plan.gscClusters, plan.outputPages)
    : "";

  const isEntity = plan.contentKind === "entity";
  const inventorySlim = buildInventoryCannibalPromptBlock(plan.siteInventoryJson);
  const inventoryCount = countInventoryPromptRows(plan.siteInventoryJson);
  const inventoryBlock = `
=== SITE_INVENTORY (cannibalization only — read every row; do not copy verbatim) ===
${inventorySlim}
=== END SITE_INVENTORY ===`;

  const forbiddenOutputsBlock = buildForbiddenInventoryOutputsBlock(plan.siteInventoryJson);

  let system = `${BENCHMARK_SEO_CONTENT_SPECIALIST_PERSONA}

You fill a bulk ${isEntity ? "entity / service-area" : "blog"} CSV for one WordPress client. Reply with JSON only:
{ "rows": [ { "keyword", "entity", "title", "modifier", "featuredImage", "source_exemplar_url" } ] }

Pre-output checklist (mandatory): for each row, confirm title and keyword do not overlap any SITE_INVENTORY entry (semantic search intent, not string equality).

Rules:
- Return exactly ${n} object(s) in rows[] — one per numbered GSC OUTPUT line below, same order (1..${n}).
${hasClusters ? "- When GSC MERGED CLUSTERS is present, merged URLs must not get their own extra row beyond the required count.\n" : ""}- Do NOT add or remove rows beyond the required count ${n}. Do NOT invent topics beyond the GSC lines below.
- source_exemplar_url MUST equal the exact exemplar_url from the matching numbered OUTPUT line.
- CURATE FOR THIS CLIENT only (${plan.site.name}). Exemplar URLs are from other sites. Write a new keyword and title for this client. Do not copy the peer slug, peer title, or peer keyword wording.
- Never use Bali or Bali blinds in keyword or title (any wording, including removal/DIY).
- Every keyword unique. Every title unique.
${isEntity ? entityEntityColumnRules() : postEntityColumnRules()}
- keyword: 2–4 word short-tail for this client${isEntity ? "" : " (no city/region/state/country names)"}.
- title: under 60 chars${isEntity ? "" : "; national/educational only"}.
${MODIFIER_RULES_BLOCK}
${isEntity ? (plan.gridRagBlock ? ENTITY_TITLE_WITH_GRID_BLOCK : ENTITY_TITLE_BLOCK) : NO_GEO_IN_TITLE_BLOCK}
${CLIENT_OFFERINGS_PROMPT_RULES}
${BULK_BENCHMARK_TOPIC_EXCLUSIONS_BLOCK}
${buildDedupeRulesBlock(n)}
${globalExclusionBlockForPrompt(globalDedupe)}`;

  system = appendMasterInstructionsToSystemPrompt(system, plan.site.id);

  const user = `CLIENT: ${plan.site.name}
Site URL: ${plan.siteUrl}
Category: ${plan.categoryLabel}

${inventoryBlock}
${forbiddenOutputsBlock}
Published inventory count: ${inventoryCount} — every proposed title/keyword must be checked against SITE_INVENTORY and FORBIDDEN OUTPUTS above before you write rows[].

${plan.clientOfferingsBlock}
${plan.gridRagBlock ? `\n${plan.gridRagBlock}\n` : ""}

${clusterBlock}

GSC EXEMPLARS (${n} unique topic(s) from other sites — write ${n} rows for ${plan.site.name}):
${urlList}

FIXED COUNT: Reply with exactly ${n} row object(s) for ${plan.site.name}. Never omit a line. Never repeat a keyword or title. Never mention Bali.`;

  return { system, user };
}

export function geminiPlanStepId(plan: BenchmarkClientPlan): string {
  return `gemini-${plan.site.id}-${plan.contentKind}`;
}

export function initGeminiSteps(plans: BenchmarkClientPlan[]): BenchmarkPipelineStep[] {
  return plans.map((p) => ({
    id: geminiPlanStepId(p),
    label:
      p.contentKind === "entity" ?
        `Entity rows: ${p.site.name}`
      : `Bulk rows: ${p.site.name}`,
    status: "waiting" as const,
  }));
}

export function finalReviewStep(): BenchmarkPipelineStep {
  return {
    id: "gemini-final",
    label: "Final sheet review",
    status: "waiting",
  };
}

export function gridEntityPackageStep(): BenchmarkPipelineStep {
  return {
    id: "grid-entity-package",
    label: "Grid entity (package)",
    status: "waiting",
  };
}

function percentFromSteps(steps: BenchmarkPipelineStep[], base: number, span: number): number {
  if (!steps.length) return base;
  const done = steps.filter((s) => s.status === "done").length;
  return Math.min(100, base + Math.round((done / steps.length) * span));
}
