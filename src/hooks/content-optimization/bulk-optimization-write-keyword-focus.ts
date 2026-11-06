import { logger } from "@/lib/logger";
import type { WordPressSite } from "@/components/integrations/types";
import { updateWordPressAcfFields } from "@/lib/wordpress-api";
import { WORDPRESS_BULK_READ_CHUNK } from "@/lib/wordpress-api/bulk-read-chunk";

type PendingPostRef = { id?: unknown; postTypeSubtype?: unknown; postTypeEndpoint?: unknown };
type PendingResolvedRef = { id?: unknown; subtype?: unknown; endpoint?: unknown };

function postIdFromPending(pending: Record<string, unknown>): number | null {
  const existingPost = pending.existingPost as PendingPostRef | undefined;
  const resolved = pending.resolved as PendingResolvedRef | undefined;
  const id = existingPost?.id ?? resolved?.id;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function postSubtypeFromPending(pending: Record<string, unknown>): string {
  const existingPost = pending.existingPost as PendingPostRef | undefined;
  const resolved = pending.resolved as PendingResolvedRef | undefined;
  const sub = existingPost?.postTypeSubtype ?? resolved?.subtype ?? "post";
  return typeof sub === "string" && sub.trim() ? sub.trim() : "post";
}

function postEndpointFromPending(pending: Record<string, unknown>): string | undefined {
  const existingPost = pending.existingPost as PendingPostRef | undefined;
  const resolved = pending.resolved as PendingResolvedRef | undefined;
  const ep = existingPost?.postTypeEndpoint ?? resolved?.endpoint;
  return typeof ep === "string" && ep.trim() ? ep.trim() : undefined;
}

/**
 * Writes newly researched `keyword_focus` values back to WordPress ACF (non-fatal on failure).
 */
export async function writeBulkResearchedKeywordFocusToWordPress(opts: {
  site: WordPressSite;
  researchedIndices: number[];
  prefetchedPendingCache: Map<
    number,
    { pending: Record<string, unknown>; primaryKeyword: string }
  >;
  prefetchedAcfFieldsCache: Map<number, Record<string, unknown>>;
  muteToasts?: boolean;
}): Promise<void> {
  const { site, researchedIndices, prefetchedPendingCache, prefetchedAcfFieldsCache, muteToasts } =
    opts;

  if (!site.username || !site.appPassword || researchedIndices.length === 0) return;

  const unique = [...new Set(researchedIndices)].filter((i) => i >= 0);

  for (let c = 0; c < unique.length; c += WORDPRESS_BULK_READ_CHUNK) {
    const slice = unique.slice(c, c + WORDPRESS_BULK_READ_CHUNK);
    await Promise.all(
      slice.map(async (i) => {
        const kw = String(prefetchedAcfFieldsCache.get(i)?.["keyword_focus"] ?? "").trim();
        if (!kw) return;

        const pend = prefetchedPendingCache.get(i);
        if (!pend?.pending || typeof pend.pending !== "object") return;

        const pending = pend.pending as Record<string, unknown>;
        const postId = postIdFromPending(pending);
        if (!postId) return;

        const res = await updateWordPressAcfFields(
          site.siteUrl,
          site.username!,
          site.appPassword!,
          postId,
          postSubtypeFromPending(pending),
          postEndpointFromPending(pending),
          { keyword_focus: kw },
        );

        if (!res.success) {
          logger.warn(
            `[Bulk Optimization] keyword_focus write-back failed (index ${i}, post ${postId}):`,
            res.error,
          );
          if (!muteToasts) {
            const url = typeof pending.url === "string" ? pending.url : "";
            logger.warn(`[Bulk Optimization] Could not save keyword_focus for ${url || postId}`);
          }
        }
      }),
    );
  }
}
