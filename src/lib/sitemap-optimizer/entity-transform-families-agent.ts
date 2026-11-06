import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { getCompetitorReportMaxOutputTokens } from "@/lib/competitor-research/competitor-report-openrouter-limits";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import {
  stripHtmlToPlainText,
  truncatePlainText,
  urlPathTail,
} from "@/lib/sitemap-optimizer/build-cluster-catalog-payload";
import {
  SITEMAP_OPTIMIZER_ENTITY_REDIRECT_PLAN_BATCH_SIZE,
  SITEMAP_OPTIMIZER_ENTITY_TRANSFORM_CONCURRENCY,
  SITEMAP_OPTIMIZER_GSC_TOP_QUERIES,
  SITEMAP_OPTIMIZER_MERGE_CONTENT_MAX,
} from "@/lib/sitemap-optimizer/constants";
import {
  entityNeighborhoodFromPathTail,
  entityRedirectGroupingKey,
} from "@/lib/sitemap-optimizer/entity-redirect-grouping-key";
import { collapseEntityFamiliesByIntent } from "@/lib/sitemap-optimizer/collapse-entity-families-by-intent";
import {
  familyHasCompleteAiStrategy,
  type EntityRedirectFamily,
  type EntityRedirectPlan,
} from "@/lib/sitemap-optimizer/entity-redirect-plan-parse";
import {
  isPlaceholderKeyword,
  isPlaceholderSapEntity,
  isPlaceholderStrategyField,
} from "@/lib/sitemap-optimizer/entity-strategy-placeholders";
import { parseAssistantJsonObject } from "@/lib/competitor-research/competitor-report-json-parse";
import { z } from "zod";
import type { SitemapOptimizerPostRow } from "@/lib/sitemap-optimizer/types";
import { fillFamilyStrategyFromPillar } from "./entity-transform-families-strategy";
export * from "./entity-transform-families-strategy";
export {
  isPlaceholderKeyword,
  isPlaceholderSapEntity,
  isPlaceholderStrategyField,
} from "@/lib/sitemap-optimizer/entity-strategy-placeholders";
const TRANSFORM_SYSTEM = `You are a senior SEO strategist writing replacement briefs for service-area redirect families.

Return ONLY valid JSON (no markdown fences):
{
  "families": [
    {
      "familyId": "redirect-family-1",
      "destinationPostId": "wp:123",
      "sourcePostIds": ["wp:123", "wp:456"],
      "recommendedPrimaryKeyword": "blinds shades shutters",
      "recommendedTitle": "Blinds, Shades, and Shutters in Snug Harbour, Florida",
      "recommendedMeta": "Shop blinds, shades, and shutters in Snug Harbour, Florida. Local measure and install.",
      "sapEntity": "Snug Harbour, Florida",
      "sapModifier": "Consolidate legacy Snug Harbour and nearby service-area URLs. Also covers: Snug Harbour.",
      "combinedOutline": ["Local service overview", "Also covers: Snug Harbour", "Products and options", "Next steps"],
      "whatToKeepFromEach": [{ "url": "https://example.com/service-area/blinds-snug-harbour/", "title": "Blinds Snug Harbour", "bullets": ["Local angle for Snug Harbour"] }],
      "rationale": "Same-place thin duplicates consolidating into one Snug Harbour landing page."
    }
  ]
}

Rules:
- Output one family object per input family. Keep familyId, destinationPostId, and sourcePostIds exactly as provided.
- recommendedPrimaryKeyword MUST be a real searchable phrase (service words; place optional). Never copy instructional prose.
- Across this batch, each recommendedPrimaryKeyword + sapEntity pair MUST be unique. Duplicate pairs = duplicate new posts (forbidden). If two families truly share the same searcher intent, keep distinct hyperlocal sapEntity values from each family's pillar place; do not lift every street family to the same city keyword/entity.
- sapEntity MUST be a real place from the pillar catalog row (urlPathTail, neighborhood, groupingKey, or title). Prefer the specific place on the destination post (street/neighbourhood) over a shared city-only label when multiple families sit in the same city.
- NEVER output schema or placeholder entity strings such as Hyperlocal Place, City, Place, City, Example, City, Service Area, or Neighborhood.
- sapModifier MUST name every redirected place from the family catalog so writers cover those locales.
- combinedOutline MUST include a section that lists or covers every redirected place from the family sources.
- whatToKeepFromEach: one entry per sourcePostId; bullets must keep that URL's local place angle.
- Both recommendedPrimaryKeyword and sapEntity are required on every family (SAP sitemap sheet contract).
- All strategy fields required on every family.`;

const keepSchema = z
  .object({
    url: z.string().optional(),
    title: z.string().optional(),
    bullets: z.array(z.string()).optional(),
  })
  .transform((k) => ({
    url: (k.url ?? "").trim(),
    title: (k.title ?? "").trim(),
    bullets: (k.bullets ?? []).map((b) => String(b).trim()).filter(Boolean),
  }));

const transformFamilySchema = z.object({
  familyId: z.string().optional(),
  destinationPostId: z.string().optional(),
  sourcePostIds: z.array(z.string()).optional(),
  rationale: z.string().optional(),
  recommendedPrimaryKeyword: z.string().optional(),
  recommendedTitle: z.string().optional(),
  recommendedMeta: z.string().optional(),
  sapEntity: z.string().optional(),
  sapModifier: z.string().optional(),
  combinedOutline: z.array(z.string()).optional(),
  whatToKeepFromEach: z.array(keepSchema).optional(),
  keyword: z.string().optional(),
  title: z.string().optional(),
  meta: z.string().optional(),
  entity: z.string().optional(),
  modifier: z.string().optional(),
});

const transformPlanSchema = z.object({
  families: z.array(transformFamilySchema),
});

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size) as T[]);
  }
  return out;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const n = items.length;
  const ret: R[] = new Array(n);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      if (signal?.aborted) return;
      const idx = next++;
      if (idx >= n) return;
      ret[idx] = await fn(items[idx]!);
    }
  }
  const workers = Math.min(Math.max(1, concurrency), n);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return ret;
}

function catalogRowsForFamily(
  family: EntityRedirectFamily,
  rowById: ReadonlyMap<string, SitemapOptimizerPostRow>,
) {
  return family.sourcePostIds.map((id) => {
    const row = rowById.get(id);
    if (!row) return { postId: id };
    const tail = urlPathTail(row.url);
    const body =
      row.contentSnippet ||
      truncatePlainText(stripHtmlToPlainText(row.seoResearch ?? ""), SITEMAP_OPTIMIZER_MERGE_CONTENT_MAX);
    return {
      postId: row.postId,
      url: row.url,
      urlPathTail: tail,
      groupingKey: entityRedirectGroupingKey(row.url),
      neighborhood: entityNeighborhoodFromPathTail(tail),
      title: row.title,
      keyword: row.keyword,
      meta: row.meta,
      contentSnippet: body,
      gscTopQueries: row.gscQueries.slice(0, SITEMAP_OPTIMIZER_GSC_TOP_QUERIES).map((q) => q.query),
      gscPageClicks: row.gscPageClicks ?? 0,
      gscPageImpressions: row.gscPageImpressions ?? 0,
    };
  });
}

function mergeStrategyOntoFamily(
  base: EntityRedirectFamily,
  raw: z.infer<typeof transformFamilySchema>,
): EntityRedirectFamily {
  const recommendedPrimaryKeyword = (raw.recommendedPrimaryKeyword ?? raw.keyword ?? "").trim();
  const recommendedTitle = (raw.recommendedTitle ?? raw.title ?? "").trim();
  const recommendedMeta = (raw.recommendedMeta ?? raw.meta ?? "").trim();
  const sapEntity = (raw.sapEntity ?? raw.entity ?? "").trim();
  const sapModifier = (raw.sapModifier ?? raw.modifier ?? "").trim();
  const combinedOutline = (raw.combinedOutline ?? []).map((s) => String(s).trim()).filter(Boolean);
  const whatToKeepFromEach = (raw.whatToKeepFromEach ?? []).filter(
    (k) => k.url || k.title || k.bullets.length,
  );
  return {
    ...base,
    rationale:
      (raw.rationale ?? base.rationale).trim() &&
      !isPlaceholderStrategyField((raw.rationale ?? base.rationale).trim())
        ? (raw.rationale ?? base.rationale).trim()
        : base.rationale,
    recommendedPrimaryKeyword: !isPlaceholderKeyword(recommendedPrimaryKeyword)
      ? recommendedPrimaryKeyword
      : base.recommendedPrimaryKeyword,
    recommendedTitle: !isPlaceholderStrategyField(recommendedTitle)
      ? recommendedTitle || base.recommendedTitle
      : base.recommendedTitle,
    recommendedMeta: !isPlaceholderStrategyField(recommendedMeta)
      ? recommendedMeta || base.recommendedMeta
      : base.recommendedMeta,
    sapEntity: !isPlaceholderSapEntity(sapEntity) ? sapEntity || base.sapEntity : base.sapEntity,
    sapModifier: !isPlaceholderStrategyField(sapModifier)
      ? sapModifier || base.sapModifier
      : base.sapModifier,
    combinedOutline: combinedOutline.length ? combinedOutline : base.combinedOutline,
    whatToKeepFromEach: whatToKeepFromEach.length ? whatToKeepFromEach : base.whatToKeepFromEach,
  };
}

function parseTransformResponse(
  content: string,
  inputFamilies: readonly EntityRedirectFamily[],
): EntityRedirectFamily[] {
  let parsed: unknown;
  try {
    parsed = parseAssistantJsonObject(content);
  } catch {
    return [...inputFamilies];
  }
  const result = transformPlanSchema.safeParse(parsed);
  if (!result.success) return [...inputFamilies];

  const byId = new Map(
    result.data.families.map((f) => [(f.familyId ?? "").trim(), f]),
  );
  return inputFamilies.map((base) => {
    const raw = byId.get(base.familyId) ?? result.data.families.find(
      (f) => (f.destinationPostId ?? "").trim() === base.destinationPostId,
    );
    if (!raw) return base;
    return mergeStrategyOntoFamily(base, raw);
  });
}

async function transformOneBatch(
  families: readonly EntityRedirectFamily[],
  rowById: ReadonlyMap<string, SitemapOptimizerPostRow>,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<EntityRedirectFamily[]> {
  if (!families.length) return [];

  const maxTokens = getCompetitorReportMaxOutputTokens(model);
  const payload = families.map((family) => ({
    familyId: family.familyId,
    destinationPostId: family.destinationPostId,
    sourcePostIds: family.sourcePostIds,
    rationale: family.rationale,
    catalog: catalogRowsForFamily(family, rowById),
  }));
  const user = `Write strategy fields for each family. Keep familyId, destinationPostId, and sourcePostIds unchanged.

families:
${JSON.stringify(payload, null, 2)}`;

  const runOnce = async (): Promise<EntityRedirectFamily[]> => {
    try {
      const { content, finishReason } = await callOpenRouterChatCompletion({
        apiKey,
        model,
        system: TRANSFORM_SYSTEM,
        user,
        maxTokens,
        temperature: 0.35,
        responseFormat: { type: "json_object" },
        signal,
      });
      if (finishReason === "length") return [...families];
      return parseTransformResponse(content ?? "", families);
    } catch {
      return [...families];
    }
  };

  let out = await runOnce();
  const incomplete = out.filter((f) => !familyHasCompleteAiStrategy(f));
  if (incomplete.length > 0) {
    out = await runOnce();
  }
  return out.map((f) => fillFamilyStrategyFromPillar(f, rowById));
}

/** Stage 3: write titles/meta/SAP strategy onto compress families. Never drops families. */
export async function runEntityTransformFamiliesAgent(
  plan: EntityRedirectPlan,
  consolidateRows: readonly SitemapOptimizerPostRow[],
  apiKey: string,
  options?: {
    signal?: AbortSignal;
    onProgress?: (completed: number, total: number) => void;
  },
): Promise<EntityRedirectPlan> {
  if (!plan.families.length) return plan;

  const model = getResearchModel();
  const rowById = new Map(consolidateRows.map((r) => [r.postId, r]));
  const batches = chunk(plan.families, Math.max(1, Math.floor(SITEMAP_OPTIMIZER_ENTITY_REDIRECT_PLAN_BATCH_SIZE / 2)));
  let completed = 0;
  const total = plan.families.length;

  const batchResults = await mapWithConcurrency(
    batches,
    SITEMAP_OPTIMIZER_ENTITY_TRANSFORM_CONCURRENCY,
    async (batch) => {
      const transformed = await transformOneBatch(batch, rowById, apiKey, model, options?.signal);
      completed += batch.length;
      options?.onProgress?.(completed, total);
      return transformed;
    },
    options?.signal,
  );

  const transformed: EntityRedirectPlan = { families: batchResults.flat() };
  return collapseEntityFamiliesByIntent(transformed);
}
