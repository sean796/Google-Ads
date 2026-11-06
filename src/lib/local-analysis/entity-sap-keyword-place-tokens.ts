/** Collapse repeated comma segments (e.g. "Fort Saskatchewan, Fort Saskatchewan, AB"). */
export function collapseRepeatedPlaceSegmentsInKeyword(keyword: string): string {
  let out = keyword.trim();
  if (!out) return out;
  let prev = "";
  while (out !== prev) {
    prev = out;
    out = out.replace(/([^,]+),\s*\1(\s*,|\s*$)/gi, "$1$2");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

/** Collapse adjacent duplicate space-separated words (e.g. "Edmonton Edmonton"). */
function collapseRepeatedWords(text: string): string {
  let out = text.trim().replace(/\s{2,}/g, " ");
  let prev = "";
  while (out !== prev) {
    prev = out;
    out = out.replace(/\b(\w+)\s+\1\b/gi, "$1");
  }
  return out.trim();
}

/** Drop earlier copies of a word when the same word appears again later (case-insensitive). */
function collapseDuplicateWordsKeepLast(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words.join(" ");
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = words.length - 1; i >= 0; i--) {
    const key = words[i]!.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.unshift(words[i]!);
  }
  return out.join(" ");
}

/**
 * Remove from the service base any tokens that already appear in the place suffix
 * (e.g. base "blinds edmonton" + place "Westmount Edmonton" → "blinds").
 */
export function stripBaseTokensPresentInPlace(base: string, place: string): string {
  const placeWords = new Set(
    place
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 1),
  );
  if (placeWords.size === 0) return base.trim().replace(/\s+/g, " ");
  const words = base.trim().split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => !placeWords.has(w.toLowerCase()));
  return kept.join(" ");
}

/** Collect place tokens (length > 1) from entity / city labels. */
export function placeTokenSetFromLabels(placeLabels: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of placeLabels) {
    const place = keywordPlaceSuffixFromEntity(raw) || raw.trim().replace(/,/g, " ");
    for (const w of place.toLowerCase().split(/\s+/).filter((t) => t.length > 1)) {
      out.add(w);
    }
  }
  return out;
}

/** True when any keyword word appears in the place corpus. */
export function keywordStillContainsPlaceTokens(
  keyword: string,
  placeCorpus: ReadonlySet<string> | readonly string[],
): boolean {
  const set =
    placeCorpus instanceof Set ? placeCorpus : placeTokenSetFromLabels([...placeCorpus]);
  if (set.size === 0) return false;
  const words = keyword
    .trim()
    .toLowerCase()
    .replace(/,/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
  return words.some((w) => set.has(w));
}

/** Neighbourhood / city tails that can partially strip a foreign multi-word place. */
const GENERIC_PLACE_TAIL_TOKENS = new Set([
  "park",
  "grove",
  "street",
  "hill",
  "ridge",
  "woods",
  "heights",
  "valley",
  "view",
  "dale",
  "green",
  "court",
  "place",
  "circle",
  "gardens",
  "manor",
]);

/** Tokens that are service/product language — never treat as orphan place heads. */
const SERVICE_KEYWORD_TOKENS = new Set([
  "blinds",
  "blind",
  "shades",
  "shade",
  "curtains",
  "curtain",
  "repair",
  "repairs",
  "window",
  "windows",
  "coverings",
  "treatment",
  "treatments",
  "store",
  "stores",
  "cleaning",
  "custom",
  "motorized",
  "roller",
  "roman",
  "wood",
  "blackout",
  "venetian",
  "commercial",
  "hunter",
  "douglas",
  "alta",
]);

/**
 * Strip every place token from the corpus. Empty string if nothing service-like remains
 * or place tokens are still present after strip.
 *
 * When a generic place tail (park, grove, …) is removed from a multi-word foreign city
 * (e.g. "sherwood park"), also drop the orphan head word ("sherwood") so it cannot
 * survive into the service phrase.
 */
export function stripAllPlaceTokensFromKeyword(
  base: string,
  placeLabels: readonly string[],
): string {
  let out = base.trim().replace(/,/g, " ").replace(/\s+/g, " ");
  if (!out) return "";

  // Longest multi-word place phrases first (contiguous), then per-token strip.
  const phrases = placeLabels
    .map((p) => (keywordPlaceSuffixFromEntity(p) || p).toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ").trim())
    .filter((p) => p.split(/\s+/).filter(Boolean).length >= 2)
    .sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    const parts = out.toLowerCase().split(/\s+/).filter(Boolean);
    const needle = phrase.split(/\s+/).filter(Boolean);
    if (needle.length < 2) continue;
    const next: string[] = [];
    for (let i = 0; i < parts.length; ) {
      let match = i + needle.length <= parts.length;
      if (match) {
        for (let j = 0; j < needle.length; j++) {
          if (parts[i + j] !== needle[j]) {
            match = false;
            break;
          }
        }
      }
      if (match) {
        i += needle.length;
        continue;
      }
      next.push(parts[i]!);
      i++;
    }
    out = next.join(" ");
  }

  const corpus = placeTokenSetFromLabels(placeLabels);
  const words = out.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  const kept: string[] = [];
  for (const w of words) {
    if (!corpus.has(w)) {
      kept.push(w);
      continue;
    }
    // Generic tail removed: drop prior orphan head (sherwood before park) unless it is service.
    if (
      GENERIC_PLACE_TAIL_TOKENS.has(w) &&
      kept.length > 0 &&
      !corpus.has(kept[kept.length - 1]!) &&
      !SERVICE_KEYWORD_TOKENS.has(kept[kept.length - 1]!)
    ) {
      kept.pop();
    }
  }
  out = kept.join(" ").trim();
  if (!out) return "";
  if (keywordStillContainsPlaceTokens(out, corpus)) return "";
  return out;
}

/**
 * Trailing multi-word place phrases in GSC bases (e.g. "sherwood park" in
 * "blinds sherwood park"), excluding phrases that contain service tokens.
 */
export function harvestTrailingPlacePhrasesFromBases(bases: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (label: string) => {
    const t = label.trim().toLowerCase().replace(/\s+/g, " ");
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  for (const base of bases) {
    const words = base
      .trim()
      .toLowerCase()
      .replace(/,/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);
    if (words.length < 3) continue;
    for (const len of [3, 2]) {
      if (words.length <= len) continue;
      const phraseWords = words.slice(-len);
      if (phraseWords.some((w) => SERVICE_KEYWORD_TOKENS.has(w))) continue;
      const prefix = words.slice(0, -len).join(" ");
      const phrase = phraseWords.join(" ");
      const stripped = stripBaseTokensPresentInPlace(base, phrase);
      if (stripped.toLowerCase().replace(/\s+/g, " ").trim() === prefix) add(phrase);
    }
  }
  return out;
}

/**
 * "sherwood park" style pairs in GSC bases → add full phrase + head token so
 * leftover "blinds sherwood" still strips after park was eaten by another entity.
 */
export function harvestGenericTailPlacesFromBases(bases: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (label: string) => {
    const t = label.trim().toLowerCase().replace(/\s+/g, " ");
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  for (const base of bases) {
    const words = base
      .trim()
      .toLowerCase()
      .replace(/,/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);
    for (let i = 0; i < words.length - 1; i++) {
      const head = words[i]!;
      const tail = words[i + 1]!;
      if (!GENERIC_PLACE_TAIL_TOKENS.has(tail)) continue;
      if (SERVICE_KEYWORD_TOKENS.has(head)) continue;
      add(`${head} ${tail}`);
      add(head);
    }
  }
  return out;
}

/** Place labels orphaned when a generic tail token was stripped from a multi-word city. */
export function harvestOrphanPlaceLabelsFromBases(
  bases: readonly string[],
  seedPlaces: readonly string[],
): string[] {
  const seed = placeTokenSetFromLabels(seedPlaces);
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (label: string) => {
    const t = label.trim().toLowerCase().replace(/\s+/g, " ");
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  for (const base of bases) {
    const words = base
      .trim()
      .toLowerCase()
      .replace(/,/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);
    if (words.length < 2) continue;
    const stripped = stripAllPlaceTokensFromKeyword(base, seedPlaces);
    if (!stripped) continue;
    const strippedSet = new Set(stripped.toLowerCase().split(/\s+/).filter(Boolean));
    for (let i = 0; i < words.length; i++) {
      const w = words[i]!;
      if (!strippedSet.has(w)) continue;
      if (SERVICE_KEYWORD_TOKENS.has(w)) continue;
      const next = words[i + 1];
      const prev = words[i - 1];
      if (next && seed.has(next) && GENERIC_PLACE_TAIL_TOKENS.has(next)) {
        add(`${w} ${next}`);
        add(w);
      } else if (prev && seed.has(prev) && GENERIC_PLACE_TAIL_TOKENS.has(prev)) {
        add(`${prev} ${w}`);
        add(w);
      }
    }
  }
  return out;
}

/** AdGroup entity as keyword suffix: lowercase, spaces, no commas / region code. */
export function adGroupEntityKeywordSuffix(entity: string): string {
  return keywordPlaceSuffixFromEntity(entity).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Service phrase + AdGroup entity suffix (lowercase, no commas). */
export function composeServiceKeywordWithAdGroupEntity(service: string, entity: string): string {
  const svc = service.trim().replace(/\s+/g, " ");
  if (!svc) return "";
  const place = adGroupEntityKeywordSuffix(entity);
  if (!place) return svc.toLowerCase();
  const core = stripBaseTokensPresentInPlace(svc, place).trim();
  if (!core) return place;
  return `${core} ${place}`.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Unique AdGroup keywords: strip foreign places, append this entity (lowercase, no commas). */
export function sanitizeUniqueServiceKeywordsForAdGroup(
  bases: readonly string[],
  entity: string,
  placeCorpus: readonly string[] = [],
): string[] {
  const places = [entity, ...placeCorpus].filter((p) => p.trim());
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of bases) {
    const service = stripAllPlaceTokensFromKeyword(raw, places);
    if (!service) continue;
    const composed = composeServiceKeywordWithAdGroupEntity(service, entity);
    if (!composed) continue;
    const key = composed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(composed);
  }
  return out;
}

/**
 * Keyword place suffix from entity: every comma segment except a trailing 2-letter
 * region code, joined by spaces (e.g. "Ritchie, Edmonton, AB" → "Ritchie Edmonton").
 */
export function keywordPlaceSuffixFromEntity(entity: string): string {
  const parts = entity
    .trim()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  const deduped: string[] = [];
  for (const part of parts) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.toLowerCase() === part.toLowerCase()) continue;
    deduped.push(part);
  }
  if (deduped.length >= 2 && /^[A-Za-z]{2}$/.test(deduped[deduped.length - 1]!)) {
    deduped.pop();
  }
  return collapseRepeatedWords(deduped.join(" "));
}

/** Strip foreign places from keyword, then append AdGroup entity (lowercase, no commas). */
export function normalizeSapKeywordWithPlaceSuffix(
  keyword: string,
  entity: string,
  placeCorpus: readonly string[] = [],
): string {
  const places = [entity, ...placeCorpus].filter((p) => p.trim());
  const service = stripAllPlaceTokensFromKeyword(
    collapseRepeatedPlaceSegmentsInKeyword(keyword).replace(/,/g, " "),
    places,
  );
  if (!service) return "";
  return composeServiceKeywordWithAdGroupEntity(service, entity);
}

/** Service phrase only (no entity suffix) for SAP title agent and template fallback. */
export function serviceKeywordForSapTitle(keyword: string, entity: string): string {
  const ent = (entity ?? "").trim();
  const collapsed = collapseRepeatedPlaceSegmentsInKeyword(keyword).replace(/,/g, " ").trim();
  if (!ent) return collapsed;
  const service = stripAllPlaceTokensFromKeyword(collapsed, [ent]).trim();
  return service || collapsed;
}

/**
 * Strip foreign / native place tokens from the GSC base, then append this AdGroup
 * entity (lowercase, no commas). Place lives on the keyword for SEO.
 */
export function sapKeywordFromShortBaseAndEntity(
  baseKeyword: string,
  entity: string,
  placeCorpus: readonly string[] = [],
): string {
  const places = [entity, ...placeCorpus].filter((p) => p.trim());
  const service = stripAllPlaceTokensFromKeyword(baseKeyword, places);
  if (!service) return "";
  return composeServiceKeywordWithAdGroupEntity(service, entity);
}
