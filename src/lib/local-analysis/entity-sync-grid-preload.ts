import type { WordPressSite } from "@/components/integrations/types";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import { entityTypeFocusWantsNeighbourhoods } from "@/lib/entity-geographic-level";
import {
  firstCityStateLabelFromAddress,
  parseLocalDominatorCsv,
  type LocalDominatorRow,
} from "@/lib/local-dominator-csv";
import {
  assignUniqueEntitiesToSlots,
  isBadPreloadEntityLabel,
  resolveSafeCityEntityLabel,
} from "@/lib/local-analysis/entity-preload-suggested-keywords";
import { expandEntityLabelsForLayout } from "@/lib/local-analysis/entity-ad-group-budget";
import {
  allocateSapPagesToLocationBuckets,
  buildCityLocationBucketsFromRows,
  buildGridLocationBucketsFromRows,
} from "@/lib/local-analysis/grid-location-buckets";
import {
  LOCAL_ANALYSIS_SAP_MAX,
  LOCAL_ANALYSIS_SUGGEST_SAP_MIN_PER_TARGET,
} from "@/lib/local-analysis-target-constants";
import { finalizeEntitySapRowsForAdGroups } from "@/lib/local-analysis/sap-entity-ad-groups";

const STREETISH_PREFIX =
  /\d|\b(St|Ave|Avenue|Road|Rd|Blvd|Boulevard|Dr|Drive|Lane|Way|Ct|Court|Hwy|Highway|Route|I-|Fwy|Pkwy|Pl|Place|Cir|Circle)\b/i;

function isStreetishPrefix(prefix: string): boolean {
  return STREETISH_PREFIX.test(prefix.trim());
}

function isCityLevelOnlyEntityLocal(entity: string, cityLabel: string | null | undefined): boolean {
  const norm = normalizeEntityHintCommaLabel(entity);
  if (!norm) return true;
  const parts = norm.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return true;
  const city = normalizeEntityHintCommaLabel(cityLabel ?? "");
  if (!city) return parts.length <= 2;
  const cityParts = city.split(",").map((s) => s.trim()).filter(Boolean);
  const cityName = (cityParts[0] ?? "").toLowerCase();
  const first = (parts[0] ?? "").toLowerCase();
  if (norm.toLowerCase() === city.toLowerCase()) return true;
  if (first === cityName && parts.length <= Math.max(cityParts.length, 2)) return true;
  return false;
}

/** Non-street address prefixes before City, ST (landmarks, malls, named areas). */
export function extractNonStreetPlaceLabelsFromCityRows(
  rows: LocalDominatorRow[],
  cityLabel: string,
): string[] {
  const cityKey = cityLabel.trim().toLowerCase();
  const counts = new Map<string, number>();
  for (const r of rows) {
    const addr = r.address?.trim();
    if (!addr) continue;
    const city = firstCityStateLabelFromAddress(addr);
    if (!city || city.toLowerCase() !== cityKey) continue;
    const idx = addr.toLowerCase().lastIndexOf(city.toLowerCase());
    if (idx <= 0) continue;
    let prefix = addr.slice(0, idx).trim().replace(/[,\s]+$/g, "");
    prefix = prefix.replace(/^\d+[\w/-]*\s+/, "").trim();
    if (prefix.length < 3 || isStreetishPrefix(prefix)) continue;
    const label =
      normalizeEntityHintCommaLabel(`${prefix}, ${city}`) || `${prefix}, ${city}`;
    if (isBadPreloadEntityLabel(label) || isCityLevelOnlyEntityLocal(label, cityLabel)) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label);
}

/** Lat/lng quadrant labels when grid has only street addresses (sync Neighbourhoods fallback). */
export function extractCompassClusterLabelsFromCityRows(
  rows: LocalDominatorRow[],
  cityLabel: string,
  maxLabels: number,
): string[] {
  const cityKey = cityLabel.trim().toLowerCase();
  const points: Array<{ lat: number; lng: number }> = [];
  for (const r of rows) {
    const city = firstCityStateLabelFromAddress(r.address);
    if (!city || city.toLowerCase() !== cityKey) continue;
    if (!Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) continue;
    points.push({ lat: r.latitude, lng: r.longitude });
  }
  if (points.length === 0) return [];
  const meanLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const meanLng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  const cityParts = cityLabel.split(",").map((s) => s.trim()).filter(Boolean);
  const cityName = cityParts[0] ?? cityLabel;
  const st = cityParts[1] ?? "";
  const quadrantCounts = new Map<string, number>();
  for (const p of points) {
    const ns = p.lat >= meanLat ? "North" : "South";
    const ew = p.lng >= meanLng ? "East" : "West";
    const label = st
      ? normalizeEntityHintCommaLabel(`${ns} ${ew} ${cityName}, ${cityName}, ${st}`) ||
        `${ns} ${ew} ${cityName}, ${cityName}, ${st}`
      : normalizeEntityHintCommaLabel(`${ns} ${ew} ${cityName}, ${cityName}`) ||
        `${ns} ${ew} ${cityName}, ${cityName}`;
    if (isBadPreloadEntityLabel(label) || isCityLevelOnlyEntityLocal(label, cityLabel)) continue;
    quadrantCounts.set(label, (quadrantCounts.get(label) ?? 0) + 1);
  }
  const labels = [...quadrantCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label);
  return labels.slice(0, Math.max(1, maxLabels));
}

function distributeLabelsAcrossPages(labels: readonly string[], pages: number): string[] {
  if (pages <= 0 || labels.length === 0) return [];
  const out: string[] = [];
  for (let p = 0; p < pages; p++) {
    out.push(labels[p % labels.length]!);
  }
  return out;
}

function entityLabelKey(label: string): string {
  return normalizeEntityHintCommaLabel(label).trim().toLowerCase();
}

function pushDistinctCandidate(out: string[], seen: Set<string>, label: string): void {
  const trimmed = label.trim();
  if (!trimmed || isBadPreloadEntityLabel(trimmed)) return;
  const key = entityLabelKey(trimmed);
  if (seen.has(key)) return;
  seen.add(key);
  out.push(trimmed);
}

type CityCandidateLists = Array<{ cityLabel: string; candidates: string[] }>;

function collectNeighbourhoodCandidatesByCity(gridRows: LocalDominatorRow[]): CityCandidateLists {
  const cityBuckets = buildCityLocationBucketsFromRows(gridRows);
  const lists: CityCandidateLists = [];
  for (const bucket of cityBuckets) {
    const cityRows = gridRows.filter(
      (r) =>
        firstCityStateLabelFromAddress(r.address)?.toLowerCase() === bucket.placeLabel.toLowerCase(),
    );
    const seen = new Set<string>();
    const candidates: string[] = [];
    for (const label of extractNonStreetPlaceLabelsFromCityRows(cityRows, bucket.placeLabel)) {
      pushDistinctCandidate(candidates, seen, label);
    }
    if (candidates.length > 0) {
      lists.push({ cityLabel: bucket.placeLabel, candidates });
    }
  }
  return lists;
}

function pickDistinctAdGroupEntitiesRoundRobin(
  cityLists: CityCandidateLists,
  adGroupCount: number,
): string[] {
  const picked: string[] = [];
  const pickedKeys = new Set<string>();
  const indices = cityLists.map(() => 0);
  while (picked.length < adGroupCount) {
    let added = false;
    for (let c = 0; c < cityLists.length; c++) {
      if (picked.length >= adGroupCount) break;
      const list = cityLists[c]!;
      while (indices[c]! < list.candidates.length) {
        const label = list.candidates[indices[c]!]!;
        indices[c]! += 1;
        const key = entityLabelKey(label);
        if (pickedKeys.has(key)) continue;
        pickedKeys.add(key);
        picked.push(label);
        added = true;
        break;
      }
    }
    if (!added) break;
  }
  return picked;
}

/** One distinct grid location per ad group (upload preload; not SAP page allocation). */
export function syncAdGroupEntityLabelsFromGridRows(
  gridRows: LocalDominatorRow[],
  adGroupCount: number,
  options?: { wantsNeighbourhoods?: boolean },
): string[] {
  if (adGroupCount <= 0 || gridRows.length === 0) return [];
  const wantsNh = options?.wantsNeighbourhoods ?? false;

  if (!wantsNh) {
    const picked: string[] = [];
    const seen = new Set<string>();
    for (const bucket of buildGridLocationBucketsFromRows(gridRows)) {
      if (picked.length >= adGroupCount) break;
      pushDistinctCandidate(picked, seen, bucket.placeLabel);
    }
    return picked;
  }

  return pickDistinctAdGroupEntitiesRoundRobin(
    collectNeighbourhoodCandidatesByCity(gridRows),
    adGroupCount,
  );
}

/**
 * Synchronous neighbourhood / corridor entities from grid rows (no OpenRouter).
 * Used for Amount-slot AdGroup preview and Clusters neighbourhood fallback.
 */
export function syncEntityLabelsFromGridRows(
  gridRows: LocalDominatorRow[],
  totalPages: number,
  options?: { wantsNeighbourhoods?: boolean },
): string[] {
  if (totalPages <= 0 || gridRows.length === 0) return [];
  const wantsNh = options?.wantsNeighbourhoods ?? false;

  if (!wantsNh) {
    const corridors = buildGridLocationBucketsFromRows(gridRows);
    if (corridors.length === 0) return [];
    const pageCounts = allocateSapPagesToLocationBuckets(
      corridors,
      totalPages,
      LOCAL_ANALYSIS_SUGGEST_SAP_MIN_PER_TARGET,
      LOCAL_ANALYSIS_SAP_MAX,
    );
    const entities: string[] = [];
    for (let i = 0; i < corridors.length; i++) {
      const label = corridors[i]!.placeLabel.trim();
      if (!label || isBadPreloadEntityLabel(label)) continue;
      entities.push(...distributeLabelsAcrossPages([label], pageCounts[i] ?? 0));
    }
    return entities.slice(0, totalPages);
  }

  const cityBuckets = buildCityLocationBucketsFromRows(gridRows);
  if (cityBuckets.length === 0) return [];
  const pageCounts = allocateSapPagesToLocationBuckets(
    cityBuckets,
    totalPages,
    LOCAL_ANALYSIS_SUGGEST_SAP_MIN_PER_TARGET,
    LOCAL_ANALYSIS_SAP_MAX,
  );
  const entities: string[] = [];
  for (let i = 0; i < cityBuckets.length; i++) {
    const bucket = cityBuckets[i]!;
    const pages = pageCounts[i] ?? 0;
    if (pages < 1) continue;
    const cityRows = gridRows.filter(
      (r) => firstCityStateLabelFromAddress(r.address)?.toLowerCase() === bucket.placeLabel.toLowerCase(),
    );
    const labels = extractNonStreetPlaceLabelsFromCityRows(cityRows, bucket.placeLabel);
    if (labels.length === 0) continue;
    entities.push(...distributeLabelsAcrossPages(labels, pages));
  }
  return entities.slice(0, totalPages);
}

export type BuildSyncPreloadRowsFromGridOptions = {
  rows: CSVRow[];
  gridCsvText: string;
  suggestFocusLocation?: string;
  entityTypeFocus?: readonly string[];
  site?: WordPressSite;
  adGroupCount?: number;
  adsPerGroup?: number;
};

function stampEntitiesOnRowsFromLayout(
  rows: CSVRow[],
  entityLabels: string[],
  adGroupLabels?: readonly (string | undefined)[],
): CSVRow[] {
  return rows.map((row, index) => {
    const existing = row.entity?.trim();
    if (existing && !isBadPreloadEntityLabel(existing)) {
      const parent = adGroupLabels?.[index]?.trim();
      return parent ? { ...row, ad_group_label: parent } : row;
    }
    const next = entityLabels[index]?.trim();
    if (!next || isBadPreloadEntityLabel(next)) return row;
    const parent = adGroupLabels?.[index]?.trim();
    return {
      ...row,
      entity: next,
      ...(parent ? { ad_group_label: parent } : {}),
    };
  });
}

function buildNeighbourhoodLayoutSlots(
  gridRows: LocalDominatorRow[],
  adGroupCount: number,
  adsPerGroup: number,
  cityGroupLabels: readonly string[],
): { entities: string[]; adGroupLabels: (string | undefined)[] } {
  const groups = Math.max(1, adGroupCount);
  const ads = Math.max(1, adsPerGroup);
  const cityBuckets = buildCityLocationBucketsFromRows(gridRows);
  const entities: string[] = [];
  const adGroupLabels: (string | undefined)[] = [];

  for (let g = 0; g < groups; g++) {
    const cityLabel =
      cityGroupLabels[g]?.trim() ||
      cityBuckets[g]?.placeLabel.trim() ||
      cityBuckets[0]?.placeLabel.trim() ||
      "";
    const cityKey = cityLabel.trim().toLowerCase();
    const cityRows =
      cityKey.length > 0
        ? gridRows.filter((r) => firstCityStateLabelFromAddress(r.address)?.toLowerCase() === cityKey)
        : gridRows;
    const subs = syncAdGroupEntityLabelsFromGridRows(
      cityRows.length > 0 ? cityRows : gridRows,
      ads,
      { wantsNeighbourhoods: true },
    );
    const parent = normalizeEntityHintCommaLabel(cityLabel) || undefined;
    for (let a = 0; a < ads; a++) {
      const sub =
        normalizeEntityHintCommaLabel(subs[a]?.trim() ?? "") ||
        normalizeEntityHintCommaLabel(subs[a % Math.max(1, subs.length)]?.trim() ?? "") ||
        parent ||
        "";
      entities.push(sub);
      adGroupLabels.push(parent && sub.toLowerCase() !== parent.toLowerCase() ? parent : undefined);
    }
  }

  return { entities, adGroupLabels };
}

/** Stamp Amount slots from grid immediately after upload (before async GSC / OpenRouter preload). */
export function buildSyncPreloadRowsFromGrid(
  options: BuildSyncPreloadRowsFromGridOptions,
): CSVRow[] {
  const text = options.gridCsvText.trim();
  if (!text || options.rows.length === 0) return options.rows;

  const parsed = parseLocalDominatorCsv(text);
  if (parsed.error || parsed.rows.length === 0) return options.rows;

  const adGroupCount = Math.max(1, options.adGroupCount ?? options.rows.length);
  const adsPerGroup = Math.max(1, options.adsPerGroup ?? 1);
  const wantsNh = entityTypeFocusWantsNeighbourhoods(options.entityTypeFocus);
  let uniqueEntities = syncAdGroupEntityLabelsFromGridRows(parsed.rows, adGroupCount, {
    wantsNeighbourhoods: wantsNh,
  });

  if (uniqueEntities.length < adGroupCount && options.site) {
    const gridCityLabels = buildCityLocationBucketsFromRows(parsed.rows).map((b) => b.placeLabel);
    const seen = new Set(uniqueEntities.map(entityLabelKey));
    for (const city of gridCityLabels) {
      if (uniqueEntities.length >= adGroupCount) break;
      const trimmed = city.trim();
      if (!trimmed || isBadPreloadEntityLabel(trimmed)) continue;
      const key = entityLabelKey(trimmed);
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueEntities.push(trimmed);
    }
    if (uniqueEntities.length === 0) {
      const city = resolveSafeCityEntityLabel({
        suggestFocusLocation: options.suggestFocusLocation,
        site: options.site,
        gridCityLabels,
      });
      if (city && adGroupCount === 1) uniqueEntities = [city];
    }
  }

  let next = options.rows;
  if (!wantsNh) {
    const distinctGroupCount =
      uniqueEntities.length > 0 ? Math.min(adGroupCount, uniqueEntities.length) : 0;
    const entityLabels = expandEntityLabelsForLayout(uniqueEntities, distinctGroupCount, adsPerGroup);
    next = stampEntitiesOnRowsFromLayout(options.rows, entityLabels);
    if (entityLabels.length === 0) {
      next = assignUniqueEntitiesToSlots(options.rows, uniqueEntities);
    }
  }
  if (wantsNh && !next.some((r) => r.entity?.trim())) {
    return next;
  }
  return finalizeEntitySapRowsForAdGroups(next);
}
