import { normalizedPageUrlForCompare } from "@/lib/pulse-redirect-redirect-csv";

/** Canonical key for matching GSC page URLs to WordPress inventory rows. */
export function normalizePageUrlKey(url: string): string {
  if (typeof url !== "string" || url.length === 0) return "";
  const norm = normalizedPageUrlForCompare(url);
  if (norm) return norm;
  return url.toLowerCase();
}
