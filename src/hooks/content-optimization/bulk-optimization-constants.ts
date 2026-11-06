/** Bulk: no Google Search Console keyword research - empty payload for downstream types. */
export const DEATH_STAR_NO_GSC = { success: false as const, queries: [] as Array<{ query?: unknown }> };

/** Parallel bulk prep: per-URL prefetch and keyword derivation (OpenRouter / WP). */
export const BULK_PREP_PREFETCH_CONCURRENCY = 8;
export const BULK_KEYWORD_DERIVE_CONCURRENCY = 8;
/** SEO extra text generation workers per page slice. */
export const BULK_EXTRA_TEXT_GENERATE_CONCURRENCY = 6;

export function bulkOptimizationWpStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && "raw" in v && typeof (v as { raw?: string }).raw === "string")
    return (v as { raw: string }).raw;
  if (
    typeof v === "object" &&
    v !== null &&
    "rendered" in v &&
    typeof (v as { rendered?: string }).rendered === "string"
  )
    return (v as { rendered: string }).rendered;
  return String(v);
}

/** Display title from URL slug only (input to AI research, not used as final keyword). */
export function humanizeSlugFromUrl(url: string): string {
  let slug = "";
  try {
    const absolute = url.startsWith("http") ? url : `https://placeholder.local/${url.replace(/^\//, "")}`;
    slug = new URL(absolute).pathname.split("/").filter(Boolean).pop() || "";
  } catch {
    slug = String(url || "")
      .split("/")
      .filter(Boolean)
      .pop() || "";
  }
  slug = decodeURIComponent(slug).trim();
  if (!slug) return "";
  return slug.replace(/-/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
}
