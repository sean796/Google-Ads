import { sanitizeWordPressSlugSegment } from "@/lib/rank-math-redirect-csv";
import { stripApostrophesForSlug } from "@/lib/slug-word-normalize";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import {
  SAP_SLUG_KEYWORD_MAX_WORDS,
  SAP_SLUG_MAX_LENGTH,
  limitServiceWords,
} from "@/lib/sap-brand-and-brevity";

const SLUG_MAX_LENGTH = SAP_SLUG_MAX_LENGTH;

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}+/gu, "");
}

function normalizeWords(value: string): string[] {
  return stripDiacritics(stripApostrophesForSlug(value.trim().toLowerCase()))
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

type ParsedEntity = {
  neighborhoodWords: string[];
  cityWords: string[];
  trailingWords: string[];
};

/** "Neighbourhood, City" or "Neighbourhood, City, ST" — city is always before trailing region code. */
function parseEntityParts(entity: string): ParsedEntity {
  const segments = stripDiacritics(entity.trim().toLowerCase())
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return { neighborhoodWords: [], cityWords: [], trailingWords: [] };
  }

  if (segments.length === 1) {
    return { neighborhoodWords: normalizeWords(segments[0]!), cityWords: [], trailingWords: [] };
  }

  const last = segments[segments.length - 1]!;
  const hasTrailingRegion = /^[a-z]{2}$/.test(last) && segments.length >= 3;

  const cityIndex = hasTrailingRegion ? segments.length - 2 : segments.length - 1;
  const neighborhoodText = segments.slice(0, cityIndex).join(" ");
  const cityText = segments[cityIndex] ?? "";
  const trailingText = hasTrailingRegion ? last : "";

  return {
    neighborhoodWords: normalizeWords(neighborhoodText),
    cityWords: normalizeWords(cityText),
    trailingWords: normalizeWords(trailingText),
  };
}

/** Keyword segment: dashed words; drops entity city tokens so city can sit last on the entity block. */
function slugifyKeywordPart(keyword: string, entityCityWords: string[]): string {
  const normalized = stripDiacritics(
    stripApostrophesForSlug(limitServiceWords(keyword.trim().toLowerCase(), SAP_SLUG_KEYWORD_MAX_WORDS)),
  );
  if (!normalized) return "";
  const citySet = new Set(entityCityWords);
  const words = normalized
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !citySet.has(word));
  return words.slice(0, SAP_SLUG_KEYWORD_MAX_WORDS).join("-");
}

function keywordWordSet(keyword: string, entityCityWords: string[]): Set<string> {
  return new Set(slugifyKeywordPart(keyword, entityCityWords).split("-").filter(Boolean));
}

/** Entity place tokens: undashed neighbourhood, dashed before city and region code. */
function slugifyEntityPlaceParts(entity: string, keyword: string): string[] {
  const { neighborhoodWords, cityWords, trailingWords } = parseEntityParts(entity);
  if (neighborhoodWords.length === 0 && cityWords.length === 0 && trailingWords.length === 0) return [];

  const kwWords = keywordWordSet(keyword, cityWords);
  const neighborhoodSlug = neighborhoodWords.filter((word) => !kwWords.has(word)).join("");
  const citySlug = cityWords.join("");
  const trailingSlug = trailingWords.join("");

  return [neighborhoodSlug, citySlug, trailingSlug].filter(Boolean);
}

/** Entity SAP URL segment: dashed keyword + neighbourhood + city (city always last before region). */
export function buildSapSlugFromKeywordEntity(keyword: string, entity: string): string {
  const { cityWords } = parseEntityParts(entity);
  const kwSlug = slugifyKeywordPart(keyword, cityWords);
  const entParts = slugifyEntityPlaceParts(entity, keyword);
  const parts = [kwSlug, ...entParts].filter(Boolean);
  if (parts.length === 0) return "";
  let slug = parts.join("-");
  slug = sanitizeWordPressSlugSegment(slug);
  if (slug.length > SLUG_MAX_LENGTH) {
    slug = slug.slice(0, SLUG_MAX_LENGTH).replace(/-$/, "");
  }
  return slug;
}

export function applySapTargetSlugsFromKeywordEntity(rows: CSVRow[]): CSVRow[] {
  return rows.map((r) => ({
    ...r,
    target_slug: buildSapSlugFromKeywordEntity(r.keyword, r.entity ?? ""),
  }));
}
