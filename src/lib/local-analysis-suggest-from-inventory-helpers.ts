import {
  propagateSeedEntityHintsToMembers,
  type SapRoughClusterRow,
} from "@/lib/local-analysis-keyword-cluster";
import type { EntityGeographicLevel } from "@/lib/entity-geographic-level";
import type { SuggestedKeywordTarget } from "@/lib/local-analysis-suggest-keyword-targets";
import type { CompetitorKeywordRow } from "@/lib/competitor-research/types";
import type { GridKeywordWeight, PlaceWeaknessWeight } from "@/lib/process-local-dominator-upload";
import { isInternalGridPlaceBucketLabel } from "@/lib/local-dominator-csv";
import type { PromptBulkSitemapInventoryBuckets } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import type { GscSiteQueryRow } from "@/lib/competitor-research/types";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import {
  backfillEntityHintFromGridPlaceHints,
  backfillEntityHintFromWikipediaPool,
  finalizeEntityHintForKeywordTarget,
} from "@/lib/local-analysis-entity-hint-dedupe";
import { snapAllEntityHintsToWikipediaPoolTitles } from "@/lib/wikipedia/extract-wikipedia-pool-titles";

export type SuggestKeywordTargetsFromInventoryOptions = {
  gridKeywordWeights?: GridKeywordWeight[] | null;
  /** Per City, ST from grid CSV: higher weight = weaker avg rank; drives SAP allocation + RAG. */
  gridPlaceWeaknessWeights?: PlaceWeaknessWeight[] | null;
  /** @deprecated Prefer full grid markdown + CSV; model reads geography from attachments. */
  gridPlaceHints?: string[] | null;
  /** Full grid scan markdown (same as after CSV parse) - sent verbatim to the model after the JSON block. */
  gridSummaryMarkdown?: string | null;
  /** Full uploaded grid CSV file text - sent verbatim to the model after the JSON block. */
  uploadedGridCsvFull?: string | null;
  /** Business name (as for Google / storefront) - included in JSON payload. */
  businessName?: string | null;
  /** Public website URL - included in JSON payload. */
  businessWebsiteUrl?: string | null;
  /** Full DataForSEO `google_my_business_info` API response JSON string - verbatim RAG block for the model. */
  dataForSeoGmbGoogleBusinessInfoLiveJson?: string | null;
  /** Wikipedia search + intros for sub-metro places (neighbourhood/district/etc.) - primary geography for entityHint when present. */
  wikipediaGranularEntityPoolMarkdown?: string | null;
  siteId?: string;
  apiKey?: string;
  /** @deprecated Use businessWebsiteUrl; kept for callers that only pass seed URL. */
  seedSiteUrl?: string;
  /** DataForSEO Labs ranked phrases for the seed domain - optional; omit for grid+GBP-only suggest. */
  seedRankedKeywordsFromDataForSeo?: CompetitorKeywordRow[] | null;
  /**
   * Optional service/product theme: most (not all) suggested `keyword` strings will center on this,
   * with distinct modifiers per row; remaining rows use complementary intents from the RAG.
   */
  focusKeyword?: string | null;
  /**
   * Optional geographic anchor (city, province/state, country, etc.): all **entityHint** places should sit
   * inside or align with this area; never put this text in **keyword** strings.
   */
  focusLocation?: string | null;
  /** Session-wide geographic scope for entityHint + SAP entity (default city = hyperlocal). */
  entityGeographicLevel?: EntityGeographicLevel;
  /** Optional subset of taxonomy labels to prioritize in prompts. */
  entityTypeFocus?: string[] | null;
  /** Optional client-provided audience / brand markdown (SAP Generate flow). */
  clientAudienceContextMarkdown?: string | null;
  /** Pages + Posts + SAP sitemap JSON buckets (same as Prompt Ideas). */
  siteInventoryBuckets?: PromptBulkSitemapInventoryBuckets;
  /** Full site GSC query rows (stats sorted at fetch). OpenRouter gets keyword strings only. */
  gscQueries?: GscSiteQueryRow[];
};

export function roughRowsToSuggestedTargets(rows: SapRoughClusterRow[]): SuggestedKeywordTarget[] {
  return rows.map((r) =>
    r.clusterRole === "member"
      ? {
          keyword: r.keyword,
          sapPages: r.sapPages,
          clusterId: r.clusterId,
          clusterRole: "member",
          ...(r.entityHint ? { entityHint: r.entityHint } : {}),
        }
      : {
          keyword: r.keyword,
          sapPages: r.sapPages,
          ...(r.entityHint ? { entityHint: r.entityHint } : {}),
          clusterId: r.clusterId,
          clusterRole: "seed",
        },
  );
}

/**
 * Metro name for umbrella detection: focus location primary segment, else first grid **City, ST** segment.
 */
export function metroCityWordFromSuggestOptions(
  opt: SuggestKeywordTargetsFromInventoryOptions | undefined,
  placeWeightsSorted: PlaceWeaknessWeight[],
): string | undefined {
  const foc = (opt?.focusLocation ?? "").trim().split(",")[0]?.trim();
  if (foc && foc.length > 0) return foc;
  const gw = placeWeightsSorted[0]?.place?.trim().split(",")[0]?.trim();
  return gw && gw.length > 0 ? gw : undefined;
}

/**
 * After snap: if several seeds share the same hint while **orderedPoolTitles** has unused titles,
 * assign the next unused title in pool order so clusters stay distinguishable vs grid diversification.
 */
export function dedupeSeedEntityHintsOntoOrderedPool(
  rough: SapRoughClusterRow[],
  orderedPoolTitles: string[],
): SapRoughClusterRow[] {
  if (orderedPoolTitles.length === 0) return rough;
  const seeds = rough.filter((r) => r.clusterRole === "seed");
  if (seeds.length <= 1) return rough;
  const used = new Set<string>();
  return rough.map((r) => {
    if (r.clusterRole !== "seed") return r;
    const hint = (r.entityHint ?? "").trim();
    const k = hint.toLowerCase();
    if (hint && !used.has(k)) {
      used.add(k);
      return r;
    }
    const next = orderedPoolTitles.find((t) => !used.has(t.trim().toLowerCase()));
    if (next) {
      used.add(next.trim().toLowerCase());
      return { ...r, entityHint: normalizeEntityHintCommaLabel(next) };
    }
    if (hint && !used.has(k)) used.add(k);
    return hint ? r : { ...r, entityHint: normalizeEntityHintCommaLabel(orderedPoolTitles[0]!) };
  });
}

/**
 * Snap each **seed** wikiEntityHint / entityHint to the filtered Wikipedia `###` pool (neighbourhood-first when possible).
 */
export function snapSeedEntityHintsToFilteredWikipediaPool(
  rough: SapRoughClusterRow[],
  poolTitles: string[],
): SapRoughClusterRow[] {
  if (poolTitles.length === 0) return rough;
  const seeds = rough.filter((r) => r.clusterRole === "seed");
  if (seeds.length === 0) return rough;
  const snapped = snapAllEntityHintsToWikipediaPoolTitles(
    seeds.map((r) => ({
      keyword: r.keyword,
      sapPages: r.sapPages,
      entityHint: r.entityHint,
    })),
    poolTitles,
  );
  let si = 0;
  return rough.map((r) => {
    if (r.clusterRole !== "seed") return r;
    const row = snapped[si++]!;
    const eh = row.entityHint?.trim();
    return eh ? { ...r, entityHint: normalizeEntityHintCommaLabel(eh) } : r;
  });
}

export function uniqGridBackfillHints(
  opts: SuggestKeywordTargetsFromInventoryOptions | undefined,
  placeWeightsSorted: PlaceWeaknessWeight[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of opts?.gridPlaceHints ?? []) {
    const t = String(h ?? "").trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  for (const p of placeWeightsSorted) {
    const t = String(p.place ?? "").trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    if (isInternalGridPlaceBucketLabel(t)) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

/**
 * Strip keyword-like / service-like entity hints; backfill seeds from Wikipedia pool order then grid place labels.
 */
export function applyFinalizeEntityHintsAndPropagate(
  rough: SapRoughClusterRow[],
  orderedPoolTitles: string[],
  gridHintsForBackfill: string[],
): SapRoughClusterRow[] {
  let seedIdx = 0;
  const withSeeds = rough.map((r) => {
    if (r.clusterRole !== "seed") return r;
    const kw = r.keyword;
    let h = finalizeEntityHintForKeywordTarget(kw, r.entityHint);
    if (!h && orderedPoolTitles.length > 0) {
      h = backfillEntityHintFromWikipediaPool(kw, orderedPoolTitles, seedIdx) ?? "";
    }
    if (!h && gridHintsForBackfill.length > 0) {
      h = backfillEntityHintFromGridPlaceHints(kw, gridHintsForBackfill, seedIdx) ?? "";
    }
    seedIdx++;
    const trimmed = h.trim();
    const entityHint = trimmed.length > 0 ? normalizeEntityHintCommaLabel(trimmed) : undefined;
    return { ...r, ...(entityHint ? { entityHint } : {}) };
  });
  return propagateSeedEntityHintsToMembers(withSeeds);
}

