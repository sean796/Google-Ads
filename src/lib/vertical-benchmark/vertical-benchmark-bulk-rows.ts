import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { parseAssistantJsonObject } from "@/lib/competitor-research/competitor-report-json-parse";
import { QUARTER_EDITORIAL_POSTS_GOAL } from "@/lib/quarter-editorial-gap";
import type { BacklinkBlogPitchOption } from "@/lib/backlink-research/backlink-tile-enriched";
import {
  createGlobalBulkDedupeState,
  isBannedBulkBenchmarkTopic,
  type GlobalBulkDedupeState,
} from "@/lib/vertical-benchmark/vertical-benchmark-bulk-dedupe";
import { keywordFromPeerGscUrl } from "@/lib/vertical-benchmark/vertical-benchmark-peer-gsc";
import type { GscTop10RagPage } from "@/lib/vertical-benchmark/vertical-benchmark-gsc-rag";
import type { VerticalBenchmarkContentKind } from "@/lib/vertical-benchmark/vertical-benchmark-types";
import {
  buildClientGscBulkAdaptPrompt,
  BULK_BENCHMARK_MODIFIER_VALUES,
  type BenchmarkClientPlan,
  type BulkBenchmarkModifier,
} from "@/lib/vertical-benchmark/vertical-benchmark-bulk-prompt";
import {
  CLIENT_PARALLEL_LIMIT,
  mapPool,
} from "@/lib/vertical-benchmark/vertical-benchmark-bulk-stage-fetchers";

const DEFAULT_TEMPERATURE = 0.7;
const MAX_TOKENS_PER_CLIENT = 8192;
/** One editorial quarter across the whole export package (not per client). */
export const BENCHMARK_BULK_QUARTER_POST_ROW_CAP = QUARTER_EDITORIAL_POSTS_GOAL;

export type JsonBulkRow = {
  keyword?: string;
  entity?: string;
  title?: string;
  modifier?: string;
  featuredImage?: string;
  source_exemplar_url?: string;
};

function inferModifierFromTitle(title: string): BulkBenchmarkModifier {
  const t = title.toLowerCase();
  if (/\bvs\.?\b|\bversus\b|showdown/i.test(title)) return "comparison";
  if (/\bhow to\b|\bhow-to\b/i.test(t)) return "how-to";
  if (/\bguide\b/i.test(t)) return "guide";
  if (/\breview\b/i.test(t) || /\brated\b/i.test(t)) return "product review";
  if (/\brepair\b|\bwhen to call\b|\bprofessional\b/i.test(t)) return "service";
  if (/\bconsultation\b|\bbook\b/i.test(t)) return "consultation";
  if (/\bworth it\b|\bare they\b|\bshould you\b/i.test(t)) return "opinion";
  if (/\btrends?\b/i.test(t)) return "trends";
  if (/\bfuture\b|\bautomated\b|\bsmart\b/i.test(t)) return "future";
  if (/\bexplained\b|\bsafely\b|\beasy\b|\bwhat is\b/i.test(t)) return "explainer";
  return "explainer";
}

/** Normalize model modifier; never treat featuredImage flags as modifier. */
export function normalizeBulkBenchmarkModifier(
  raw: string | undefined,
  title: string,
): BulkBenchmarkModifier {
  const trimmed = (raw ?? "").trim().toLowerCase();
  if (!trimmed || trimmed === "y" || trimmed === "n" || trimmed === "google-maps") {
    return inferModifierFromTitle(title);
  }
  const exact = BULK_BENCHMARK_MODIFIER_VALUES.find((v) => v === trimmed);
  if (exact) return exact;
  if (trimmed.includes("compar") || trimmed === "versus") return "comparison";
  if (trimmed.includes("how") && trimmed.includes("to")) return "how-to";
  if (trimmed.includes("guide")) return "guide";
  if (trimmed.includes("review")) return "product review";
  if (trimmed.includes("service") || trimmed.includes("repair")) return "service";
  if (trimmed.includes("consult")) return "consultation";
  if (trimmed.includes("opinion") || trimmed.includes("worth")) return "opinion";
  if (trimmed.includes("trend")) return "trends";
  if (trimmed.includes("future") || trimmed.includes("autom")) return "future";
  if (trimmed.includes("explain")) return "explainer";
  return inferModifierFromTitle(title);
}

function parseJsonBulkRows(content: string): JsonBulkRow[] {
  try {
    const parsed = parseAssistantJsonObject(content) as { rows?: JsonBulkRow[] };
    return Array.isArray(parsed.rows) ? parsed.rows : [];
  } catch {
    return [];
  }
}

function titleFromPulledKeyword(keyword: string): string {
  return keyword
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** One CSV row per picked GSC page. Never drop a picked keyword. */
export function jsonRowsToPitchRows(
  jsonRows: JsonBulkRow[],
  outputPages: GscTop10RagPage[],
  contentKind: VerticalBenchmarkContentKind,
): BacklinkBlogPitchOption[] {
  return outputPages.map((page, i) => {
    const url = page.url?.trim() ?? "";
    const r = jsonRows[i];
    const pulled = keywordFromPeerGscUrl(url);
    const modelKeyword = r?.keyword?.trim() ?? "";
    const keyword =
      modelKeyword && !isBannedBulkBenchmarkTopic(modelKeyword) ? modelKeyword : pulled;
    const title = r?.title?.trim() || titleFromPulledKeyword(keyword);
    return {
      keyword,
      entity: contentKind === "entity" ? (r?.entity?.trim() ?? "") : "",
      title,
      modifier: normalizeBulkBenchmarkModifier(r?.modifier, title),
      featuredImage: (r?.featuredImage?.trim() || "y") === "n" ? "n" : "y",
      publish_date_gmt: "",
    };
  });
}

export async function callGeminiBulkRowsForPlan(
  plan: BenchmarkClientPlan,
  apiKey: string,
  model: string,
  globalDedupe: GlobalBulkDedupeState,
): Promise<BacklinkBlogPitchOption[]> {
  const pages = plan.outputPages;

  const { system, user } = buildClientGscBulkAdaptPrompt(plan, globalDedupe);
  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model,
    system,
    user,
    maxTokens: MAX_TOKENS_PER_CLIENT,
    temperature: DEFAULT_TEMPERATURE,
    responseFormat: { type: "json_object" },
  });

  const jsonRows = parseJsonBulkRows(content);
  return jsonRowsToPitchRows(jsonRows, pages, plan.contentKind);
}

export type BulkRowWithClient = BacklinkBlogPitchOption & {
  clientName: string;
  verifiedBrands: string[];
  gscClicks: number;
  gscImpressions: number;
  contentKind: VerticalBenchmarkContentKind;
};

/** Combined export order: highest GSC clicks, then impressions (not grouped by client). */
export function sortBulkBenchmarkRowsByGsc<T extends { gscClicks: number; gscImpressions: number }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (b.gscClicks !== a.gscClicks) return b.gscClicks - a.gscClicks;
    return b.gscImpressions - a.gscImpressions;
  });
}

type BulkRowWithGscMetrics = { gscClicks: number; gscImpressions: number; contentKind: VerticalBenchmarkContentKind };

/** Keep only the strongest post rows for one quarter package (GSC top-10 sourced). */
export function capBulkBenchmarkPostRowsToQuarterGoal<T extends BulkRowWithGscMetrics>(
  rows: T[],
  cap: number = BENCHMARK_BULK_QUARTER_POST_ROW_CAP,
): { rows: T[]; trimmed: number } {
  const posts = rows.filter((r) => r.contentKind === "post");
  const other = rows.filter((r) => r.contentKind !== "post");
  const keptPosts = sortBulkBenchmarkRowsByGsc(posts).slice(0, Math.max(0, cap));
  return {
    rows: sortBulkBenchmarkRowsByGsc([...keptPosts, ...other]),
    trimmed: Math.max(0, posts.length - keptPosts.length),
  };
}

export function attachGscMetricsAtIndices(
  plan: BenchmarkClientPlan,
  rowsByIndex: Array<BacklinkBlogPitchOption | undefined>,
): BulkRowWithClient[] {
  return plan.outputPages.map((page, i) => {
    const row = rowsByIndex[i];
    const pulled = keywordFromPeerGscUrl(page.url);
    const modelKeyword = row?.keyword?.trim() ?? "";
    const keyword =
      modelKeyword && !isBannedBulkBenchmarkTopic(modelKeyword) ? modelKeyword : pulled;
    const title = row?.title?.trim() || titleFromPulledKeyword(keyword);
    return {
      keyword,
      entity: row?.entity ?? "",
      title,
      modifier: normalizeBulkBenchmarkModifier(row?.modifier, title),
      featuredImage: (row?.featuredImage?.trim() || "y") === "n" ? "n" : "y",
      publish_date_gmt: row?.publish_date_gmt ?? "",
      clientName: plan.site.name,
      verifiedBrands: plan.verifiedBrands,
      gscClicks: page.clicks ?? 0,
      gscImpressions: page.impressions ?? 0,
      contentKind: plan.contentKind,
    };
  });
}

export function bulkRowToCsvExport(row: BulkRowWithClient): BacklinkBlogPitchOption {
  const {
    clientName: _c,
    verifiedBrands: _vb,
    gscClicks: _cl,
    gscImpressions: _im,
    contentKind: _k,
    ...csv
  } = row;
  return csv;
}

export async function callGeminiBulkRowsForPlans(args: {
  plans: BenchmarkClientPlan[];
  apiKey: string;
  model: string;
  onPlanComplete?: (plan: BenchmarkClientPlan) => void;
}): Promise<{
  rows: BulkRowWithClient[];
  failedClients: Array<{ plan: BenchmarkClientPlan; error: string | null }>;
}> {
  const parallelResults = await mapPool(
    args.plans,
    Math.min(CLIENT_PARALLEL_LIMIT, args.plans.length),
    async (plan) => {
      const perClientDedupe = createGlobalBulkDedupeState();
      const rows = await callGeminiBulkRowsForPlan(plan, args.apiKey, args.model, perClientDedupe);
      const rowsByIndex = plan.outputPages.map((_, i) => rows[i]);
      args.onPlanComplete?.(plan);
      return { plan, rowsByIndex, error: null as string | null };
    },
  );
  const combinedWithClient: BulkRowWithClient[] = [];
  for (const { plan, rowsByIndex, error } of parallelResults) {
    if (error) continue;
    combinedWithClient.push(...attachGscMetricsAtIndices(plan, rowsByIndex));
  }
  return {
    rows: combinedWithClient,
    failedClients: parallelResults.filter((r) => r.error),
  };
}
