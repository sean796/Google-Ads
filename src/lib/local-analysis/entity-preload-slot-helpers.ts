import type { WordPressSite } from "@/components/integrations/types";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import {
  extractTopPlaceHintsFromRows,
  isStreetCorridorPlaceLabel,
  parseLocalDominatorCsv,
} from "@/lib/local-dominator-csv";
import { buildCityLocationBucketsFromRows } from "@/lib/local-analysis/grid-location-buckets";
import {
  harvestGenericTailPlacesFromBases,
  harvestOrphanPlaceLabelsFromBases,
  harvestTrailingPlacePhrasesFromBases,
  stripAllPlaceTokensFromKeyword,
} from "@/lib/local-analysis/entity-sap-row-keyword-fill";
import { getPrimaryCityStateLabel } from "@/lib/primary-location-from-site";

export function normalizeKwKey(s: string): string {
  return s.trim().toLowerCase();
}

/** True when entity is metro/city-only (not a neighbourhood AdGroup). */
export function isCityLevelOnlyEntity(
  entity: string,
  cityLabel: string | null | undefined,
): boolean {
  const norm = normalizeEntityHintCommaLabel(entity);
  if (!norm) return true;
  const parts = norm.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return true;
  const city = normalizeEntityHintCommaLabel(cityLabel ?? "");
  if (!city) {
    return parts.length <= 2;
  }
  const cityParts = city.split(",").map((s) => s.trim()).filter(Boolean);
  const cityName = (cityParts[0] ?? "").toLowerCase();
  const first = (parts[0] ?? "").toLowerCase();
  if (norm.toLowerCase() === city.toLowerCase()) return true;
  if (first === cityName && parts.length <= Math.max(cityParts.length, 2)) return true;
  return false;
}

/** Street / NAP address lines are not place entities for AdGroups. */
export function isBadPreloadEntityLabel(label: string | undefined | null): boolean {
  const t = label?.trim() ?? "";
  if (!t) return true;
  if (/^\d+\s/.test(t)) return true;
  if (isStreetCorridorPlaceLabel(t)) return true;
  return false;
}

/** City/region place label only (never street address). */
export function resolveSafeCityEntityLabel(args: {
  suggestFocusLocation?: string;
  site: WordPressSite;
  gridCityLabels?: readonly string[];
}): string {
  const candidates = [
    args.suggestFocusLocation,
    getPrimaryCityStateLabel(args.site),
    ...(args.gridCityLabels ?? []),
  ];
  for (const raw of candidates) {
    const t = normalizeEntityHintCommaLabel(raw?.trim() ?? "") || raw?.trim() || "";
    if (!t || isBadPreloadEntityLabel(t)) continue;
    return t;
  }
  return "";
}

/** Pick up to `count` unique candidates not in alreadyUsed (case-insensitive). */
export function pickUniqueSuggestedKeywords(
  candidates: string[],
  count: number,
  alreadyUsed: readonly string[] = [],
): string[] {
  const used = new Set(alreadyUsed.map(normalizeKwKey).filter(Boolean));
  const out: string[] = [];
  for (const raw of candidates) {
    if (out.length >= count) break;
    const t = raw.trim();
    if (!t) continue;
    const key = normalizeKwKey(t);
    if (used.has(key)) continue;
    used.add(key);
    out.push(t);
  }
  return out;
}

/** Fill blank keyword slots left-to-right with suggestions; preserve non-blank. */
export function fillBlankEntitySlotKeywords(rows: CSVRow[], suggestions: string[]): CSVRow[] {
  let si = 0;
  return rows.map((row) => {
    if (row.keyword?.trim()) return row;
    const next = suggestions[si++]?.trim();
    if (!next) return row;
    return { ...row, keyword: next };
  });
}

/**
 * Stamp place entity on blank or street-address fields.
 * Does not overwrite a real neighbourhood / city entity the user already set.
 */
export function fillBlankEntitySlotEntities(rows: CSVRow[], defaultEntity: string): CSVRow[] {
  const ent = defaultEntity.trim();
  if (!ent || isBadPreloadEntityLabel(ent)) return rows;
  return rows.map((row) => {
    if (!isBadPreloadEntityLabel(row.entity)) return row;
    return { ...row, entity: ent };
  });
}

/** Assign unique place entities to slots that still need one. */
export function assignUniqueEntitiesToSlots(rows: CSVRow[], entities: string[]): CSVRow[] {
  let ei = 0;
  return rows.map((row) => {
    if (!isBadPreloadEntityLabel(row.entity)) return row;
    const next = entities[ei++]?.trim();
    if (!next || isBadPreloadEntityLabel(next)) return row;
    return { ...row, entity: next };
  });
}

/** Strip all place corpus tokens; empty if foreign locations remain. */
export function serviceKeywordForEntitySlot(
  base: string,
  entity: string | undefined,
  extraPlaceLabels: readonly string[] = [],
): string {
  const places = [entity, ...extraPlaceLabels].filter(Boolean) as string[];
  return stripAllPlaceTokensFromKeyword(base, places);
}

/** Build full place corpus from grid + row entities + orphan places in keyword bases. */
export function buildEntityKeywordPlaceCorpus(
  gridCsvText: string,
  rows: CSVRow[],
  keywordBases: readonly string[] = [],
): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | undefined) => {
    const t = raw?.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    labels.push(t);
  };
  if (gridCsvText.trim()) {
    const parsed = parseLocalDominatorCsv(gridCsvText);
    if (!parsed.error && parsed.rows.length > 0) {
      // Every grid city (not top-N) so foreign places like Sherwood Park strip cleanly.
      for (const b of buildCityLocationBucketsFromRows(parsed.rows)) add(b.placeLabel);
      for (const h of extractTopPlaceHintsFromRows(parsed.rows, 10_000)) add(h);
    }
  }
  for (const row of rows) add(row.entity);
  const bases = [
    ...keywordBases,
    ...rows.map((r) => r.keyword?.trim() ?? "").filter(Boolean),
  ];
  for (const trailing of harvestTrailingPlacePhrasesFromBases(bases)) add(trailing);
  for (const generic of harvestGenericTailPlacesFromBases(bases)) add(generic);
  for (const orphan of harvestOrphanPlaceLabelsFromBases(bases, labels)) add(orphan);
  return labels;
}

