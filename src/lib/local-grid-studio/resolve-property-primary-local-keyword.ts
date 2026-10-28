import type { WordPressSite } from "@/components/integrations/types";
import {
  isLocalDominatorAutoGridKeyword,
  isLocalDominatorPropertyGridKeyword,
} from "@/lib/local-dominator/local-dominator-export-keyword";

export function readSitePrimaryLocalKeyword(site: WordPressSite | null | undefined): string {
  return String(site?.primaryLocalKeyword ?? "").trim();
}

/**
 * Resolve the keyword sent to Local Grid export / scan from stored task keyword + site profile.
 */
export function resolvePropertyPrimaryLocalKeyword(
  site: WordPressSite | null | undefined,
  storedKeyword: string | null | undefined,
): string {
  const stored = String(storedKeyword ?? "").trim();
  if (isLocalDominatorPropertyGridKeyword(stored)) {
    const fromSite = readSitePrimaryLocalKeyword(site);
    if (!fromSite) {
      throw new Error(
        "Set Primary keyword on the property profile before running Local Grid export with Property primary.",
      );
    }
    return fromSite;
  }
  if (isLocalDominatorAutoGridKeyword(stored)) {
    const fromSite = readSitePrimaryLocalKeyword(site);
    if (fromSite) return fromSite;
    return "";
  }
  return stored;
}

export function initialLocalGridKeywordForSite(
  site: WordPressSite,
  city?: string,
  inferHeuristic?: (site: WordPressSite, city?: string) => string,
): string {
  const fromProfile = readSitePrimaryLocalKeyword(site);
  if (fromProfile) return fromProfile;
  if (inferHeuristic) return inferHeuristic(site, city);
  return "";
}
