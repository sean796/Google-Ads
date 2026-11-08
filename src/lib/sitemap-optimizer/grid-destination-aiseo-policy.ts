import type { BlogDestinationPolicy } from "@/lib/sitemap-optimizer/blog-destination-policy";
import { blogPermalinkPrefixForPolicy } from "@/lib/sitemap-optimizer/blog-destination-policy";
import {
  fullDestinationUrl,
  normalizeFocusKeywordPhrase,
  permalinkParentPrefixFromPageUrl,
  slugifyFocusKeywordToRelativePath,
} from "@/lib/pulse-redirect-redirect-csv";

/** AISEO: shorten slug segment only; keep member permalink folders (including /YYYY/MM/DD/). */
export const GRID_DESTINATION_MAX_SLUG_WORDS = 5;
export const GRID_DESTINATION_MAX_SLUG_CHARS = 48;

function firstWordsPhrase(text: string, maxWords: number): string {
  const parts = normalizeFocusKeywordPhrase(text).split(" ").filter(Boolean);
  return parts.slice(0, maxWords).join(" ");
}

/** Build a short slug from focus keyword (2-5 words), not full headline. */
export function shortAiseoSlugFromKeyword(keyword: string, title: string): string | null {
  const phrase =
    firstWordsPhrase(keyword, GRID_DESTINATION_MAX_SLUG_WORDS) ||
    firstWordsPhrase(title, GRID_DESTINATION_MAX_SLUG_WORDS);
  const slug = slugifyFocusKeywordToRelativePath(phrase);
  if (!slug) return null;
  const bare = slug.replace(/^\/+|\/+$/g, "");
  if (bare.length <= GRID_DESTINATION_MAX_SLUG_CHARS) return bare;
  const shorter = slugifyFocusKeywordToRelativePath(
    firstWordsPhrase(keyword, 3) || firstWordsPhrase(title, 3),
  );
  return shorter?.replace(/^\/+|\/+$/g, "") ?? bare.slice(0, GRID_DESTINATION_MAX_SLUG_CHARS).replace(/-+$/g, "");
}

function slugWordCount(slug: string): number {
  return slug.split("-").filter(Boolean).length;
}

function slugFromPathname(pathname: string): string {
  const segments = pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  return segments.length ? segments[segments.length - 1]! : "";
}

/** Most common permalink folder among cluster members only (keeps /YYYY/MM/DD/ when present). */
export function permalinkParentPrefixFromClusterMembers(memberUrls: readonly string[]): string {
  if (!memberUrls.length) return "";
  const counts = new Map<string, number>();
  for (const url of memberUrls) {
    const prefix = permalinkParentPrefixFromPageUrl(url);
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  let best = "";
  let bestN = 0;
  for (const [prefix, n] of counts) {
    if (n > bestN) {
      best = prefix;
      bestN = n;
    }
  }
  return best;
}

/**
 * Build destination URL: same parent path as cluster members (date folders preserved), short slug only.
 */
export function buildGridDestinationPreservingPermalink(
  memberUrls: readonly string[],
  keyword: string,
  title: string,
  blogDestination?: BlogDestinationPolicy | null,
): string | null {
  const base = memberUrls[0]?.trim();
  if (!base) return null;
  const forcedBlog = blogPermalinkPrefixForPolicy(blogDestination);
  const parentPrefix = forcedBlog || permalinkParentPrefixFromClusterMembers(memberUrls);
  const slugSegment = shortAiseoSlugFromKeyword(keyword, title);
  if (!slugSegment) return null;
  const relativePath = parentPrefix ? `${parentPrefix}${slugSegment}/` : `${slugSegment}/`;
  return fullDestinationUrl(base, relativePath);
}

/**
 * AISEO pass: never remove /YYYY/MM/DD/ or other member permalink folders; shorten over-long slugs.
 */
export function optimizeGridDestinationForAiseo(
  destinationUrl: string,
  keyword: string,
  title: string,
  memberUrls: readonly string[],
  blogDestination?: BlogDestinationPolicy | null,
): string | null {
  if (!memberUrls.length) return null;

  const preserved = buildGridDestinationPreservingPermalink(
    memberUrls,
    keyword,
    title,
    blogDestination,
  );
  if (!preserved) return null;

  const trimmed = destinationUrl.trim();
  if (!trimmed) return preserved;

  try {
    const model = new URL(trimmed);
    const preservedUrl = new URL(preserved);
    if (model.origin !== preservedUrl.origin) return preserved;

    const modelSlug = slugFromPathname(model.pathname);
    const modelSlugOk =
      modelSlug.length > 0 &&
      modelSlug.length <= GRID_DESTINATION_MAX_SLUG_CHARS &&
      slugWordCount(modelSlug) <= GRID_DESTINATION_MAX_SLUG_WORDS;

    const forcedBlog = blogPermalinkPrefixForPolicy(blogDestination);
    const parentPrefix = forcedBlog || permalinkParentPrefixFromClusterMembers(memberUrls);
    const parentPrefixNorm = parentPrefix.replace(/^\/+|\/+$/g, "");
    const preservedPathNorm = preservedUrl.pathname.replace(/^\/+|\/+$/g, "");
    const modelPathNorm = model.pathname.replace(/^\/+|\/+$/g, "");

    if (
      modelSlugOk &&
      parentPrefixNorm &&
      modelPathNorm.startsWith(`${parentPrefixNorm}/`) &&
      modelPathNorm.endsWith(modelSlug)
    ) {
      let path = model.pathname.replace(/\/+/g, "/");
      if (!path.endsWith("/")) path += "/";
      return `${model.origin}${path}`;
    }
  } catch {
    /* use preserved */
  }

  return preserved;
}
