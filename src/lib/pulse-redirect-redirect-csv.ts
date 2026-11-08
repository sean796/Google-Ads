/**
 * NEO Pulse redirect redirect import CSV (Tools → Redirections → Import).
 * Columns: id, source, matching, destination, type, category, status, ignore
 */

import { stripApostrophesForSlug } from "@/lib/slug-word-normalize";

function csvQuote(s: string): string {
  return `"${String(s).replace(/"/g, '""')}"`;
}

/**
 * Human-readable focus keyword for NEO Pulse redirect / UI: spaces between words only.
 * Replaces slug hyphens/underscores and trims stray punctuation from AI output.
 */
export function normalizeFocusKeywordPhrase(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  let s = raw.trim();
  if (!s) return "";
  s = s.replace(/[-_]+/g, " ");
  s = s.replace(/[/\\]+/g, " ");
  s = s.replace(/[.,;:!?'"()[\]{}|]+/g, " ");
  s = s.replace(/[^\w\s\u00C0-\u024F]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Path like `news/foo/` for CSV `source` (no leading slash, trailing slash). */
export function rankMathSourceFromPageUrl(fullUrl: string): string | null {
  try {
    const u = new URL(fullUrl.trim());
    let path = u.pathname.replace(/^\/+/, "").replace(/\/+/g, "/");
    if (!path) return null;
    if (!path.endsWith("/")) path += "/";
    return path;
  } catch {
    return null;
  }
}

/**
 * Normalize AI output or user path: strip host if present, lowercase segments, trailing slash.
 */
export function normalizeRedirectCsvRelativePath(raw: string): string | null {
  let p = raw.trim().replace(/^["']+|["']+$/g, "");
  if (!p) return null;
  try {
    if (/^https?:\/\//i.test(p)) {
      p = new URL(p).pathname;
    }
  } catch {
    return null;
  }
  p = p.replace(/^\/+/, "").replace(/\/+/g, "/").toLowerCase();
  if (!p) return null;
  if (!p.endsWith("/")) p += "/";
  return p;
}

/**
 * Parent path before the post slug (e.g. `blog/` for `/blog/my-post/`).
 * Empty string when the post lives at site root.
 */
export function permalinkParentPrefixFromPageUrl(fullUrl: string): string {
  try {
    let path = new URL(fullUrl.trim()).pathname.replace(/\/+/g, "/");
    if (!path.endsWith("/")) path += "/";
    const segments = path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    if (segments.length <= 1) return "";
    return `${segments.slice(0, -1).join("/")}/`;
  } catch {
    return "";
  }
}

/** Shared parent prefix when every URL agrees; otherwise the most common prefix. */
export function permalinkParentPrefixFromPageUrls(urls: readonly string[]): string {
  if (urls.length === 0) return "";
  const prefixes = urls.map((u) => permalinkParentPrefixFromPageUrl(u));
  const first = prefixes[0] ?? "";
  if (prefixes.every((p) => p === first)) return first;
  const counts = new Map<string, number>();
  for (const p of prefixes) counts.set(p, (counts.get(p) ?? 0) + 1);
  let best = "";
  let bestN = 0;
  for (const [p, n] of counts) {
    if (n > bestN) {
      best = p;
      bestN = n;
    }
  }
  return best;
}

/** Full canonical URL for destination column. */
export function fullDestinationUrl(pageUrl: string, suggestedRelativePath: string): string | null {
  try {
    const base = new URL(pageUrl.trim());
    let norm = normalizeRedirectCsvRelativePath(suggestedRelativePath);
    if (!norm) return null;
    const segments = norm.replace(/\/+$/, "").split("/").filter(Boolean);
    if (segments.length === 1) {
      const parent = permalinkParentPrefixFromPageUrl(pageUrl);
      if (parent) norm = `${parent}${norm}`;
    }
    const path = `/${norm}`.replace(/\/{2,}/g, "/");
    return `${base.origin}${path}`;
  } catch {
    return null;
  }
}

/**
 * Focus keyword → single relative path segment (lowercase, hyphens, trailing slash).
 * Strips grammar/punctuation; keeps hyphens already inside words (e.g. top-down).
 */
/** WordPress-safe slug segment for locked CSV `target_slug` (no AI). */
export function sanitizeWordPressSlugSegment(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function slugifyFocusKeywordToRelativePath(keyword: string): string | null {
  const t = keyword.trim();
  if (!t) return null;
  let s = stripApostrophesForSlug(t.toLowerCase());
  s = s.replace(/&/g, " and ");
  s = s.replace(/[/\\]+/g, " ");
  s = s.replace(/[._,;:!?'"()[\]{}|]+/g, " ");
  s = s.replace(/[^a-z0-9\s-]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return null;
  const joined = s
    .split(/\s+/)
    .filter(Boolean)
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!joined) return null;
  return normalizeRedirectCsvRelativePath(joined);
}

/**
 * True when the **last** path segment **exactly equals** the focus-keyword slug (best practice:
 * permalink slug is the keyword slug - not “contains” the keyword, not extra intent words).
 * Case-insensitive; strips trailing `.html` / `.php` on the segment.
 */
export function pathnameReflectsKeywordSlug(pathname: string, slugNoSlashes: string): boolean {
  const slug = slugNoSlashes.replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!slug) return false;

  const normPath = pathname.toLowerCase().replace(/^\/+|\/+$/g, "");
  if (!normPath) return false;
  const segments = normPath.split("/").filter(Boolean);
  if (!segments.length) return false;
  const lastSeg = segments[segments.length - 1].replace(/\.(html?|php)$/i, "");
  return lastSeg === slug;
}

export type MetaOptimizerKeywordPathOutcome =
  | { kind: "set"; path: string }
  | { kind: "clear" }
  | { kind: "noop" };

/**
 * Meta Optimizer "AI URL": suggested path is the **slugified primary keyword only** (single segment).
 * No redirect suggestion only when the last URL segment **exactly matches** that keyword slug.
 */
export function suggestedPathFromFocusKeywordForMetaOptimizer(
  pathname: string,
  focusKeyword?: string | null,
): MetaOptimizerKeywordPathOutcome {
  const pathNorm = slugifyFocusKeywordToRelativePath((focusKeyword || "").trim());
  if (!pathNorm) return { kind: "noop" };
  const slugCore = pathNorm.replace(/^\/+|\/+$/g, "");
  if (pathnameReflectsKeywordSlug(pathname, slugCore)) return { kind: "clear" };
  return { kind: "set", path: pathNorm };
}

/** Compare page URL vs proposed destination (same page = no redirect needed). */
export function normalizedPageUrlForCompare(fullUrl: string): string | null {
  try {
    const u = new URL(fullUrl.trim());
    let path = u.pathname.replace(/\/+/g, "/");
    if (path !== "/" && !path.endsWith("/")) path += "/";
    return `${u.origin}${path}`.toLowerCase();
  } catch {
    return null;
  }
}

export function buildRedirectCsvRedirectCsv(rows: Array<{ source: string; destination: string }>): string {
  const header = "id,source,matching,destination,type,category,status,ignore";
  const lines = [header];
  rows.forEach((row, i) => {
    const id = String(i + 1);
    lines.push(
      [
        csvQuote(id),
        csvQuote(row.source),
        csvQuote("exact"),
        csvQuote(row.destination),
        csvQuote("301"),
        csvQuote(""),
        csvQuote("active"),
        csvQuote(""),
      ].join(","),
    );
  });
  return lines.join("\n");
}
