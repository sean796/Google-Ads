import { applyBlogDestinationPolicy } from "@/lib/sitemap-optimizer/blog-destination-policy";
import type { BlogDestinationPolicy } from "@/lib/sitemap-optimizer/blog-destination-policy";
import {
  fullDestinationUrl,
  normalizeRedirectCsvRelativePath,
} from "@/lib/pulse-redirect-redirect-csv";
import {
  optimizeGridDestinationForAiseo,
  shortAiseoSlugFromKeyword,
} from "@/lib/sitemap-optimizer/grid-destination-aiseo-policy";
import type { SitemapOptimizerPostRow } from "@/lib/sitemap-optimizer/types";

/** Normalize model or sheet output to a full canonical destination URL. */
export function resolveGridLockedDestinationUrl(
  raw: string,
  members: readonly SitemapOptimizerPostRow[],
  blogDestination?: BlogDestinationPolicy | null,
): string | null {
  const trimmed = raw.trim();
  if (!trimmed || !members.length) return null;

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const u = new URL(trimmed);
      let path = u.pathname.replace(/\/+/g, "/");
      if (!path.endsWith("/")) path += "/";
      const normalized = `${u.origin}${path}`;
      return applyBlogDestinationPolicy(normalized, blogDestination);
    }
  } catch {
    /* fall through to relative resolve */
  }

  const base = members[0]?.url?.trim();
  if (!base) return null;
  const rel = normalizeRedirectCsvRelativePath(trimmed);
  if (!rel) return null;
  const built = fullDestinationUrl(base, rel);
  return built ? applyBlogDestinationPolicy(built, blogDestination) : null;
}

/** Fallback full destination when the model omits lockedDestinationUrl. */
export function buildFallbackGridLockedDestination(
  members: readonly SitemapOptimizerPostRow[],
  title: string,
  keyword: string,
  blogDestination?: BlogDestinationPolicy | null,
): string | null {
  const base = members[0]?.url?.trim();
  if (!base) return null;
  const slugSegment = shortAiseoSlugFromKeyword(keyword, title);
  if (!slugSegment) return null;
  const draft = fullDestinationUrl(
    base,
    slugSegment.endsWith("/") ? slugSegment : `${slugSegment}/`,
  );
  if (!draft) return null;
  const optimized =
    optimizeGridDestinationForAiseo(
      draft,
      keyword,
      title,
      members.map((m) => m.url),
      blogDestination,
    ) ?? draft;
  return applyBlogDestinationPolicy(optimized, blogDestination);
}
