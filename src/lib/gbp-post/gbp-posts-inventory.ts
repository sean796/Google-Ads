import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { readGbpApiError } from "@/lib/gbp-post/gbp-api-error";

export type GbpInventoryRow = {
  name: string;
  createTime: string;
  updateTime: string;
  state: string;
  topicType: string;
  summary: string;
  ctaActionType: string;
  ctaUrl: string;
  mediaSourceUrl: string;
};

export type GbpPostsInventoryPayload = {
  siteName: string;
  gbpLocationId: string;
  fetchedAt: string;
  posts: GbpInventoryRow[];
};

export type GbpPostsInventoryResult = {
  posts: GbpInventoryRow[];
  excludeCtaUrls: string[];
  /** Image URLs from the 10 most recent GBP posts (dedup for new picks). */
  excludeRecentMediaUrls: string[];
  count: number;
};

export const GBP_RECENT_MEDIA_CAP = 10;

export type GbpPostsInventoryHostedLink = {
  href: string;
  filename: string;
  rowCount: number;
};

function siteSlugForInventoryFile(siteName: string): string {
  const s = siteName.replace(/[^\w-]+/g, "-").slice(0, 60).replace(/-+$/, "");
  return s || "gbp-posts";
}

/**
 * One NEO Pulse call; server paginates Google localPosts until complete.
 */
export async function fetchGbpPostsInventory(
  gbpLocationId: string,
  siteName?: string,
  siteUrl?: string,
): Promise<GbpPostsInventoryResult> {
  const id = gbpLocationId.trim();
  if (!id) {
    throw new Error("Google Business Profile Location ID is required.");
  }
  const res = await fetch(`${BACKEND_API_BASE}/api/gmb/posts-inventory`, {
    method: "POST",
    credentials: "include",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      gbpLocationId: id,
      ...(siteName?.trim() ? { siteName: siteName.trim() } : {}),
      ...(siteUrl?.trim() ? { siteUrl: siteUrl.trim() } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !data.success) {
    throw new Error(readGbpApiError(data, res, "Failed to load existing GBP posts"));
  }
  const posts = Array.isArray(data.posts) ? (data.posts as GbpInventoryRow[]) : [];
  const excludeCtaUrls = Array.isArray(data.excludeCtaUrls)
    ? data.excludeCtaUrls.map((u: unknown) => String(u ?? "").trim()).filter((u: string) => u.startsWith("http"))
    : [];
  const excludeRecentMediaUrls = Array.isArray(data.excludeRecentMediaUrls)
    ? data.excludeRecentMediaUrls
        .map((u: unknown) => String(u ?? "").trim())
        .filter((u: string) => u.startsWith("http"))
    : [];
  const count = typeof data.count === "number" ? data.count : posts.length;
  return { posts, excludeCtaUrls, excludeRecentMediaUrls, count };
}

/** In-session blob URL (open in new tab). Same pattern as blog generator site inventory JSON. */
export function createGbpPostsInventoryHostedLink(
  payload: GbpPostsInventoryPayload,
): GbpPostsInventoryHostedLink {
  const filename = `gbp-posts-${siteSlugForInventoryFile(payload.siteName)}-${Date.now()}.json`;
  const json = JSON.stringify(payload, null, 2);
  const href = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
  return {
    href,
    filename,
    rowCount: payload.posts?.length ?? 0,
  };
}

export function revokeGbpPostsInventoryHostedLink(href: string | null | undefined): void {
  if (href?.startsWith("blob:")) {
    URL.revokeObjectURL(href);
  }
}
