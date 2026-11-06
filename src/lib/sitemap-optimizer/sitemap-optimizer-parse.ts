import { z } from "zod";
import { extractFirstBalancedJsonValue } from "@/lib/competitor-research/competitor-report-json-parse";
import type {
  SitemapOptimizerCluster,
  SitemapOptimizerClusterResult,
  SitemapOptimizerMergeRecommendation,
  SitemapOptimizerStandaloneProposal,
} from "@/lib/sitemap-optimizer/types";

const confidenceSchema = z.enum(["high", "medium", "low"]);

const clusterEntrySchema = z
  .object({
    clusterId: z.string().optional(),
    label: z.string().optional(),
    intent: z.string().optional(),
    memberPostIds: z.array(z.union([z.string(), z.number()])).optional(),
    memberIds: z.array(z.union([z.string(), z.number()])).optional(),
    confidence: confidenceSchema.optional(),
    rationale: z.string().optional(),
  })
  .transform((c) => ({
    clusterId: (c.clusterId ?? "").trim() || `cluster-${Math.random().toString(36).slice(2, 9)}`,
    label: (c.label ?? "Overlap group").trim() || "Overlap group",
    intent: (c.intent ?? "mixed").trim() || "mixed",
    memberPostIds: (c.memberPostIds ?? c.memberIds ?? []).map((id) => String(id).trim()).filter(Boolean),
    confidence: c.confidence ?? ("medium" as const),
    rationale: (c.rationale ?? "").trim(),
  }));

const clusterResultSchema = z
  .object({
    clusters: z.array(clusterEntrySchema).optional(),
    singletons: z.array(z.union([z.string(), z.number()])).optional(),
  })
  .transform((o) => {
    const clusters: SitemapOptimizerCluster[] = (o.clusters ?? [])
      .filter((c) => c.memberPostIds.length >= 2)
      .map((c) => ({
        clusterId: c.clusterId,
        label: c.label,
        intent: c.intent,
        memberPostIds: c.memberPostIds,
        confidence: c.confidence,
        rationale: c.rationale,
      }));
    const singletons = (o.singletons ?? []).map((id) => String(id).trim()).filter(Boolean);
    return { clusters, singletons } satisfies SitemapOptimizerClusterResult;
  });

const mergeKeepSchema = z
  .object({
    url: z.string().optional(),
    title: z.string().optional(),
    bullets: z.array(z.string()).optional(),
    keep: z.array(z.string()).optional(),
  })
  .transform((k) => ({
    url: (k.url ?? "").trim(),
    title: (k.title ?? "").trim(),
    bullets: (k.bullets ?? k.keep ?? []).map((b) => String(b).trim()).filter(Boolean),
  }));

const mergeRecommendationSchema = z
  .object({
    clusterId: z.string().optional(),
    recommendedTitle: z.string().optional(),
    recommendedPrimaryKeyword: z.string().optional(),
    recommendedMeta: z.string().optional(),
    combinedOutline: z.union([z.array(z.string()), z.string()]).optional(),
    whatToKeepFromEach: z.array(mergeKeepSchema).optional(),
    redirectOrCanonicalNote: z.string().optional(),
    priority: confidenceSchema.optional(),
    confidence: confidenceSchema.optional(),
    rationale: z.string().optional(),
    lockedDestinationUrl: z.string().optional(),
  })
  .transform((m) => {
    const outlineRaw = m.combinedOutline;
    const combinedOutline = Array.isArray(outlineRaw)
      ? outlineRaw.map((s) => String(s).trim()).filter(Boolean)
      : typeof outlineRaw === "string"
        ? outlineRaw
            .split(/\n+/)
            .map((s) => s.replace(/^#+\s*/, "").trim())
            .filter(Boolean)
        : [];
    return {
      clusterId: (m.clusterId ?? "").trim(),
      recommendedTitle: (m.recommendedTitle ?? "").trim(),
      recommendedPrimaryKeyword: (m.recommendedPrimaryKeyword ?? "").trim(),
      recommendedMeta: (m.recommendedMeta ?? "").trim(),
      combinedOutline,
      whatToKeepFromEach: m.whatToKeepFromEach ?? [],
      redirectOrCanonicalNote: (m.redirectOrCanonicalNote ?? "").trim(),
      priority: m.priority ?? ("medium" as const),
      confidence: m.confidence ?? ("medium" as const),
      rationale: (m.rationale ?? "").trim(),
      lockedDestinationUrl: (m.lockedDestinationUrl ?? "").trim() || undefined,
    };
  });

/**
 * Parse a cluster model response. Throws on missing or invalid JSON so a
 * failed call is an explicit error, not an all-singletons result that looks
 * like "no merges found".
 */
export function parseClusterResultJson(content: string): SitemapOptimizerClusterResult {
  const sub = extractFirstBalancedJsonValue(content);
  if (!sub) {
    throw new Error("Sitemap cluster response contained no JSON");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(sub) as unknown;
  } catch {
    throw new Error("Sitemap cluster response was not valid JSON");
  }
  try {
    return clusterResultSchema.parse(raw);
  } catch {
    throw new Error("Sitemap cluster response did not match the cluster schema");
  }
}

export function parseMergeRecommendationJson(
  content: string,
  clusterId: string,
): SitemapOptimizerMergeRecommendation | null {
  const sub = extractFirstBalancedJsonValue(content);
  if (!sub) return null;
  try {
    const raw = JSON.parse(sub) as unknown;
    const parsed = mergeRecommendationSchema.parse(raw);
    return { ...parsed, clusterId: parsed.clusterId || clusterId };
  } catch {
    return null;
  }
}

const standaloneActionSchema = z.enum(["refresh", "keep"]);

const standaloneProposalEntrySchema = z
  .object({
    postId: z.union([z.string(), z.number()]).optional(),
    action: z.union([z.literal("refresh"), z.literal("keep"), z.string()]).optional(),
    proposedTitle: z.string().optional(),
    proposedPrimaryKeyword: z.string().optional(),
    proposedMeta: z.string().optional(),
    priority: confidenceSchema.optional(),
    rationale: z.string().optional(),
  })
  .transform((p) => {
    const action: "refresh" | "keep" = p.action === "keep" ? "keep" : "refresh";
    return {
      postId: String(p.postId ?? "").trim(),
      action,
      proposedTitle: (p.proposedTitle ?? "").trim(),
      proposedPrimaryKeyword: (p.proposedPrimaryKeyword ?? "").trim(),
      proposedMeta: (p.proposedMeta ?? "").trim(),
      priority: p.priority ?? ("medium" as const),
      rationale: (p.rationale ?? "").trim(),
    };
  });

const standaloneRefreshBatchSchema = z
  .object({
    proposals: z.array(standaloneProposalEntrySchema).optional(),
    rows: z.array(standaloneProposalEntrySchema).optional(),
  })
  .transform((o) => (o.proposals ?? o.rows ?? []).filter((p) => p.postId.length > 0));

export function parseStandaloneRefreshBatchJson(content: string): SitemapOptimizerStandaloneProposal[] {
  const sub = extractFirstBalancedJsonValue(content);
  if (!sub) {
    throw new Error("Standalone proposal response contained no JSON");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(sub) as unknown;
  } catch {
    throw new Error("Standalone proposal response was not valid JSON");
  }
  try {
    if (Array.isArray(raw)) {
      return z.array(standaloneProposalEntrySchema).parse(raw);
    }
    return standaloneRefreshBatchSchema.parse(raw);
  } catch {
    throw new Error("Standalone proposal response did not match the proposal schema");
  }
}

/** Exported for unit tests. */
export const sitemapOptimizerClusterResultSchema = clusterResultSchema;
export const sitemapOptimizerMergeRecommendationSchema = mergeRecommendationSchema;
export const sitemapOptimizerStandaloneProposalSchema = standaloneProposalEntrySchema;
