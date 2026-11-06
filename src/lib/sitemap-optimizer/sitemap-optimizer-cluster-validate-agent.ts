import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { buildCatalogEntries } from "@/lib/sitemap-optimizer/build-cluster-catalog-payload";
import { clusterSystemRulesPreamble } from "@/lib/sitemap-optimizer/cluster-merge-policy";
import {
  SITEMAP_OPTIMIZER_MAX_MERGE_GROUP_SIZE,
  SITEMAP_OPTIMIZER_MIN_MERGE_GROUP_SIZE,
  SITEMAP_OPTIMIZER_PREFERRED_MAX_MERGE_GROUP_SIZE,
} from "@/lib/sitemap-optimizer/constants";
import { parseClusterResultJson } from "@/lib/sitemap-optimizer/sitemap-optimizer-parse";
import { remapBareNumericPostId } from "@/lib/sitemap-optimizer/resolve-catalog-post-id";
import type {
  SitemapOptimizerCatalogEntry,
  SitemapOptimizerClusterResult,
  SitemapOptimizerPostRow,
} from "@/lib/sitemap-optimizer/types";

const VALIDATE_SYSTEM = `${clusterSystemRulesPreamble()}
- Drop clusters that are really one post with a renamed title suggestion (not a merge).
- Drop clusters where members do not share overlapping intent (same city when local, same topic type).
- Reject umbrella clusters that combine multiple cities, or repair + styles + commercial + events.
- Return ONLY valid JSON (no markdown fences).`;

function compactCatalogForValidate(catalog: SitemapOptimizerCatalogEntry[]) {
  return catalog.map((c) => ({
    postId: c.postId,
    title: c.title,
    url: c.url,
    urlPathTail: c.urlPathTail,
  }));
}

function allowedPostIdSet(catalog: SitemapOptimizerCatalogEntry[]): Set<string> {
  return new Set(catalog.map((c) => c.postId));
}

function normalizeMemberPostIds(
  ids: string[],
  catalogSet: Set<string>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = raw.trim();
    if (!id) continue;
    const resolved = catalogSet.has(id) ? id : remapBareNumericPostId(id, catalogSet);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

/**
 * Structural filter: cluster must have 2+ ids that exist in catalog (after optional numeric remap).
 */
export function filterClustersWithResolvableMembers(
  result: SitemapOptimizerClusterResult,
  catalogSet: Set<string>,
): SitemapOptimizerClusterResult {
  const clusters = result.clusters
    .map((c) => ({
      ...c,
      memberPostIds: normalizeMemberPostIds(c.memberPostIds, catalogSet),
    }))
    .filter(
      (c) =>
        c.memberPostIds.length >= SITEMAP_OPTIMIZER_MIN_MERGE_GROUP_SIZE &&
        c.memberPostIds.length <= SITEMAP_OPTIMIZER_MAX_MERGE_GROUP_SIZE,
    );

  const assigned = new Set<string>();
  for (const c of clusters) {
    for (const id of c.memberPostIds) assigned.add(id);
  }
  const singletonSet = new Set(
    [...result.singletons, ...result.clusters.flatMap((c) => c.memberPostIds)].map((id) => id.trim()).filter(Boolean),
  );
  for (const id of assigned) singletonSet.delete(id);
  for (const c of result.clusters) {
    for (const id of normalizeMemberPostIds(c.memberPostIds, catalogSet)) {
      if (!assigned.has(id)) singletonSet.add(id);
    }
  }

  return { clusters, singletons: [...singletonSet] };
}

export async function runSitemapOptimizerClusterValidateAgent(
  draft: SitemapOptimizerClusterResult,
  rows: SitemapOptimizerPostRow[],
  apiKey: string,
  signal?: AbortSignal,
): Promise<SitemapOptimizerClusterResult> {
  const catalog = buildCatalogEntries(rows);
  const catalogSet = allowedPostIdSet(catalog);
  const allowedPostIds = [...catalogSet];

  if (draft.clusters.length === 0) {
    return filterClustersWithResolvableMembers(draft, catalogSet);
  }

  const model = getResearchModel();
  const user = JSON.stringify({
    task: "validate_merge_clusters",
    minMembersPerCluster: SITEMAP_OPTIMIZER_MIN_MERGE_GROUP_SIZE,
    maxMembersPerCluster: SITEMAP_OPTIMIZER_MAX_MERGE_GROUP_SIZE,
    preferredMaxPerCluster: SITEMAP_OPTIMIZER_PREFERRED_MAX_MERGE_GROUP_SIZE,
    allowedPostIds,
    catalog: compactCatalogForValidate(catalog),
    draft,
    outputSchema: {
      clusters: [
        {
          clusterId: "string",
          label: "string",
          intent: "string",
          memberPostIds: ["postId from allowedPostIds only"],
          confidence: "high|medium|low",
          rationale: "string",
        },
      ],
      singletons: ["postId from allowedPostIds only"],
    },
  });

  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model,
    system: VALIDATE_SYSTEM,
    user,
    maxTokens: 8000,
    temperature: 0.15,
    responseFormat: { type: "json_object" },
    signal,
  });

  const parsed = parseClusterResultJson(content);
  const validated =
    parsed.clusters.length > 0 ? parsed : filterClustersWithResolvableMembers(draft, catalogSet);
  return filterClustersWithResolvableMembers(validated, catalogSet);
}
