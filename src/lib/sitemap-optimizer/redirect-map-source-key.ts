import {
  normalizeRedirectCsvRelativePath,
  rankMathSourceFromPageUrl,
} from "@/lib/pulse-redirect-redirect-csv";

/** Match NEO Pulse redirect relative paths to full WordPress URLs. */
export function redirectMapSourceMatchKey(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const fromFull = rankMathSourceFromPageUrl(trimmed);
  if (fromFull) return fromFull;
  return normalizeRedirectCsvRelativePath(trimmed);
}
