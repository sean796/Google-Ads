import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import {
  SITEMAP_OPTIMIZER_STANDALONE_REFRESH_BATCH_SIZE,
  SITEMAP_OPTIMIZER_STANDALONE_REFRESH_CONCURRENCY,
  SITEMAP_OPTIMIZER_STANDALONE_REFRESH_MAX_RETRIES,
  SITEMAP_OPTIMIZER_STANDALONE_REFRESH_MAX_TOKENS,
} from "@/lib/sitemap-optimizer/constants";
import { buildDeterministicStandaloneProposal } from "@/lib/sitemap-optimizer/deterministic-standalone-proposal";
import { displayPostTitle } from "@/lib/sitemap-optimizer/merge-results-display";
import { parseStandaloneRefreshBatchJson } from "@/lib/sitemap-optimizer/sitemap-optimizer-parse";
import { resolveCatalogPostId } from "@/lib/sitemap-optimizer/resolve-catalog-post-id";
import {
  STANDALONE_REFRESH_OUTPUT_RULES,
  TECHNICAL_SEO_STRATEGIST_ROLE,
} from "@/lib/sitemap-optimizer/seo-strategist-prompts";
import type {
  SitemapOptimizerPostRow,
  SitemapOptimizerStandaloneProposal,
} from "@/lib/sitemap-optimizer/types";

const REFRESH_SYSTEM = `${TECHNICAL_SEO_STRATEGIST_ROLE}

For EVERY WordPress URL in allowedPostIds you MUST return exactly one proposal object.

${STANDALONE_REFRESH_OUTPUT_RULES}`;

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  signal?: AbortSignal,
  onItemDone?: (completed: number, total: number) => void,
): Promise<R[]> {
  const n = items.length;
  const ret: R[] = new Array(n);
  let next = 0;
  let finished = 0;
  async function worker(): Promise<void> {
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const idx = next++;
      if (idx >= n) return;
      ret[idx] = await fn(items[idx]!);
      finished += 1;
      onItemDone?.(finished, n);
    }
  }
  const workers = Math.min(Math.max(1, concurrency), n);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return ret;
}

function chunkPostIds(postIds: string[], size: number): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < postIds.length; i += size) {
    batches.push(postIds.slice(i, i + size));
  }
  return batches;
}

function normalizeProposal(
  p: SitemapOptimizerStandaloneProposal,
  row: SitemapOptimizerPostRow,
): SitemapOptimizerStandaloneProposal {
  const title = p.proposedTitle.trim() || row.title.trim();
  const keyword = p.proposedPrimaryKeyword.trim() || row.keyword.trim();
  const meta = p.proposedMeta.trim() || row.meta.trim();
  const safeTitle = title || displayPostTitle(row.title) || p.postId;
  return {
    postId: p.postId,
    action: p.action === "keep" ? "keep" : "refresh",
    proposedTitle: safeTitle,
    proposedPrimaryKeyword: keyword,
    proposedMeta: meta,
    priority: p.priority,
    rationale: p.rationale,
  };
}

async function refreshOneBatch(
  batchPostIds: string[],
  rowById: Map<string, SitemapOptimizerPostRow>,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<SitemapOptimizerStandaloneProposal[]> {
  const catalog = batchPostIds
    .map((id) => rowById.get(id))
    .filter((r): r is SitemapOptimizerPostRow => r != null)
    .map((r) => ({
      postId: r.postId,
      url: r.url,
      title: r.title,
      keyword: r.keyword,
      meta: r.meta,
      gscTopQueries: r.gscQueries.map((q) => q.query),
      gscPageClicks: r.gscPageClicks,
      gscPageImpressions: r.gscPageImpressions,
    }));

  if (!catalog.length) return [];

  const user = JSON.stringify({
    task: "standalone_url_refresh_all",
    requiredCount: catalog.length,
    allowedPostIds: catalog.map((c) => c.postId),
    catalog,
    outputSchema: {
      proposals: [
        {
          postId: "string",
          action: "refresh",
          proposedTitle: "string",
          proposedPrimaryKeyword: "string",
          proposedMeta: "string",
          priority: "high|medium|low",
          rationale: "string",
        },
      ],
    },
  });

  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model,
    system: REFRESH_SYSTEM,
    user,
    maxTokens: SITEMAP_OPTIMIZER_STANDALONE_REFRESH_MAX_TOKENS,
    temperature: 0.25,
    responseFormat: { type: "json_object" },
    signal,
  });

  const parsed = parseStandaloneRefreshBatchJson(content);
  const allowedIds = catalog.map((c) => c.postId);
  const byId = new Map<string, SitemapOptimizerStandaloneProposal>();
  for (const p of parsed) {
    const resolvedId = resolveCatalogPostId(p.postId, allowedIds);
    if (!resolvedId) continue;
    const row = rowById.get(resolvedId);
    if (!row) continue;
    byId.set(resolvedId, normalizeProposal({ ...p, postId: resolvedId }, row));
  }
  return [...byId.values()];
}

export async function runSitemapOptimizerStandaloneRefreshAgent(
  standalonePostIds: string[],
  rows: SitemapOptimizerPostRow[],
  apiKey: string,
  signal?: AbortSignal,
  onProgress?: (completed: number, total: number) => void,
): Promise<SitemapOptimizerStandaloneProposal[]> {
  if (!standalonePostIds.length) return [];

  const rowById = new Map(rows.map((r) => [r.postId, r]));
  const model = getResearchModel();
  const byPostId = new Map<string, SitemapOptimizerStandaloneProposal>();

  let missing = [...standalonePostIds];
  let batchSize = SITEMAP_OPTIMIZER_STANDALONE_REFRESH_BATCH_SIZE;
  let attempt = 0;

  while (missing.length > 0 && attempt < SITEMAP_OPTIMIZER_STANDALONE_REFRESH_MAX_RETRIES) {
    const effectiveBatchSize =
      missing.length <= 3 ? 1 : batchSize;
    const batches = chunkPostIds(missing, effectiveBatchSize);
    let completedBatches = 0;

    await mapWithConcurrency(
      batches,
      SITEMAP_OPTIMIZER_STANDALONE_REFRESH_CONCURRENCY,
      async (batch) => {
        const part = await refreshOneBatch(batch, rowById, apiKey, model, signal);
        for (const p of part) byPostId.set(p.postId, p);
        completedBatches += 1;
        onProgress?.(byPostId.size, standalonePostIds.length);
        return part;
      },
      signal,
    );

    missing = standalonePostIds.filter((id) => !byPostId.has(id));
    attempt += 1;
    if (missing.length > 0 && batchSize > 8) {
      batchSize = Math.max(8, Math.floor(batchSize / 2));
    }
    if (missing.length > 0 && completedBatches === 0 && effectiveBatchSize > 1) {
      batchSize = 1;
    }
  }

  for (const id of standalonePostIds) {
    if (byPostId.has(id)) continue;
    const row = rowById.get(id);
    if (row) byPostId.set(id, buildDeterministicStandaloneProposal(row));
  }

  onProgress?.(byPostId.size, standalonePostIds.length);

  return standalonePostIds.map((id) => byPostId.get(id)!);
}
