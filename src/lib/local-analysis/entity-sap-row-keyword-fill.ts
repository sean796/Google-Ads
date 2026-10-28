/**
 * Assign one unique keyword per Entity SAP row: GSC first, OpenRouter when GSC cannot fill.
 */

import type { WordPressSite } from "@/components/integrations/types";
import {
  ensureMasterInstructionsInMemory,
} from "@/lib/master-instructions-storage";
import type { PromptBulkSitemapInventoryBuckets, PromptBulkSitemapInventoryLink } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import {
  brandExclusionPhrasesFromNames,
  fetchEntityGscKeywordBundle,
  gscAllQueryStringsForEntityKeywordFill,
} from "@/lib/bulk/bulk-gsc-site-queries";
import {
  gscQueryMatchesTradingName,
  stripTradingNameFromPhrase,
} from "@/lib/sap-brand-and-brevity";
import {
  ensureEntitySiteWarmCache,
  gscAllQueriesFromWarmBundle,
} from "@/lib/local-analysis/entity-site-warm-cache";
import type { GscCompetitorDateRange, GscSiteQueryRow } from "@/lib/competitor-research/types";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { isLeakedInstructionEntityLabel } from "@/lib/local-analysis/entity-label-guards";
import { keywordUniquenessKey } from "@/lib/local-analysis-fill-keywords-from-wp-inventory";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import { buildEntityAdGroupSections, type EntityAdGroupSection } from "@/lib/local-analysis/sap-entity-ad-groups";
import {
  GLOBAL_BLOCKED_TOPIC_PROMPT_BLOCK,
} from "@/lib/content-topic-blocklist";
import { isOffensiveGscQuery } from "@/lib/gsc-offensive-word-blocklist";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import {
  collectBlockedForEntity,
  entityKeywordPairKey,
  findEntitySapRowCollision,
  reserveEntitySapSlug,
  type EntitySapOccupancy,
} from "@/lib/local-analysis/entity-sap-inventory-collision";

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
    placeCorpus instanceof Set ? placeCorpus : placeTokenSetFromLabels(placeCorpus);
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

const CLIENT_AWARE_SAP_SERVICE_RULES = `
- Pick **services the client actually offers** (from \`clientAudienceContextMarkdown\`, site inventory, and \`seedKeywords\` when present).
- Prefer transactional **client service lines** (e.g. tax preparation, bookkeeping, corporate accounting, bare trust reporting).
- Deprioritize generic informational queries (tax brackets, tax rates, income tax tables, provincial or federal reference lookups) unless they clearly map to a stated client service.
- Each base is a **2–3 word** service or product phrase only. Extract the service phrase from GSC; **never** return the full geographic GSC string as a base.
- Bad bases: "alberta tax brackets", "tax rates sherwood park", "blinds edmonton".
- Good bases: "tax preparation", "bookkeeping services", "bare trust reporting", "corporate accounting".`;

const GROUP_KEYWORDS_SYSTEM_BASE = `You assign focus keywords for **one entity ad group** of Local Analysis SAP landing pages.

Return **only** valid JSON: {"keywords":["..."]} with **exactly** \`count\` keywords.

Rules:
- Each keyword is the **full entity focus keyword** (service phrase + entity place). Every row in this ad group must have a **different keyword+entity pair** (case-insensitive). Duplicates across **other** ad groups are fine.
- Format: **2–3 word** service / product phrase only. Do **not** append city, neighbourhood, or province — code appends the AdGroup entity afterward.
${CLIENT_AWARE_SAP_SERVICE_RULES}
- Pick from **gscKeywords** (full site export). The same GSC phrase may appear in other ad groups with different entities. Within **this** group, each composed keyword+entity must differ from \`keywordsAlreadyUsedInGroup\`.
- When GSC runs out, invent distinct service angles from \`seedKeywords\` and site services (not the brand name).
- **NEVER** use the site's own trading name from \`siteName\` as the keyword (fuzzy / word-reorder matches).
- Never use vulgar, profane, or offensive language.
${GLOBAL_BLOCKED_TOPIC_PROMPT_BLOCK}
No markdown outside JSON.`;

const GROUP_KEYWORDS_INVENTORY_BLOCK = `
- **Existing SAP pages for this entity (mandatory):** Do not reuse any keyword, slug, or title angle already used for this place. Pick a different service or product line.
- Forbidden keywords (case-insensitive): any in \`blockedKeywords\`.
- Forbidden slugs: any in \`blockedSlugs\`.
- Forbidden titles: any in \`blockedTitles\`.
- See \`existingSapPagesForEntity\` for pages already live or scheduled for this entity.`;

const PICK_GSC_PRODUCT_BASES_SYSTEM_BASE = `You pick product/service keyword bases for Local Analysis SAP landing pages from a Google Search Console export.

Return **only** valid JSON: {"bases":["..."]} with **exactly** \`count\` strings.

Rules:
- Each base must come from **gscKeywords** (real GSC queries for this site).
${CLIENT_AWARE_SAP_SERVICE_RULES}
- Return **count** distinct bases when possible. Do not repeat the same base in the array.
- Do not use vulgar or offensive language.
${GLOBAL_BLOCKED_TOPIC_PROMPT_BLOCK}
No markdown outside JSON.`;

export type EntitySapKeywordPickPromptArgs = {
  mode: "pick" | "group";
  hasInventoryBlock?: boolean;
  clientAudienceContextMarkdown?: string;
  entityTypeFocus?: readonly string[];
};

export function buildEntitySapKeywordPickSystemPrompt(args: EntitySapKeywordPickPromptArgs): string {
  const base =
    args.mode === "pick" ? PICK_GSC_PRODUCT_BASES_SYSTEM_BASE : GROUP_KEYWORDS_SYSTEM_BASE;
  const inventory =
    args.mode === "group" && args.hasInventoryBlock ? GROUP_KEYWORDS_INVENTORY_BLOCK : "";
  const focus = args.entityTypeFocus?.map((f) => f.trim()).filter(Boolean);
  const focusBlock = focus?.length ? `\n- **Entity type emphasis:** ${focus.join(", ")}` : "";
  const clientCtx = args.clientAudienceContextMarkdown?.trim();
  const clientBlock = clientCtx
    ? `\n--- Client & site context (pick services this client actually offers) ---\n${clientCtx}\n`
    : "";
  return `${base}${inventory}${focusBlock}${clientBlock}`;
}

export type EntitySapKeywordPickUserPayloadArgs = {
  siteName: string;
  siteUrl: string;
  entity: string;
  count: number;
  seedKeywords: string[];
  gscKeywords: string[];
  gridLocations: string[];
  clientAudienceContextMarkdown?: string;
  entityTypeFocus?: readonly string[];
  keywordPlace?: string;
  keywordsAlreadyUsedInGroup?: string[];
  existingSapPagesForEntity?: Array<{ title: string; keyword: string; slug: string }>;
  blockedSlugs?: string[];
  blockedKeywords?: string[];
  blockedTitles?: string[];
};

export function buildEntitySapKeywordPickUserPayload(args: EntitySapKeywordPickUserPayloadArgs): string {
  const payload: Record<string, unknown> = {
    siteName: args.siteName,
    siteUrl: args.siteUrl,
    entity: args.entity,
    count: args.count,
    gscKeywords: args.gscKeywords,
    seedKeywords: args.seedKeywords,
    gridLocations: args.gridLocations,
  };
  if (args.keywordPlace) payload.keywordPlace = args.keywordPlace;
  if (args.keywordsAlreadyUsedInGroup) {
    payload.keywordsAlreadyUsedInGroup = args.keywordsAlreadyUsedInGroup;
  }
  if (args.existingSapPagesForEntity) {
    payload.existingSapPagesForEntity = args.existingSapPagesForEntity;
  }
  if (args.blockedSlugs) payload.blockedSlugs = args.blockedSlugs;
  if (args.blockedKeywords) payload.blockedKeywords = args.blockedKeywords;
  if (args.blockedTitles) payload.blockedTitles = args.blockedTitles;
  const clientCtx = args.clientAudienceContextMarkdown?.trim();
  if (clientCtx) payload.clientAudienceContextMarkdown = clientCtx;
  const focus = args.entityTypeFocus?.map((f) => f.trim()).filter(Boolean);
  if (focus?.length) payload.entityTypeFocus = focus;
  return JSON.stringify(payload);
}

/** Strip place tokens from AI/GSC bases; pad only with stripped service phrases. */
export function padGscProductBasesFromCandidates(args: {
  bases: string[];
  count: number;
  gscKeywords: string[];
  entity: string;
  gridLocations: readonly string[];
  siteName?: string;
}): string[] {
  const brandPhrases = args.siteName?.trim()
    ? brandExclusionPhrasesFromNames(args.siteName)
    : [];
  const company = args.siteName?.trim() ?? "";
  const places = [args.entity, ...args.gridLocations].filter((p) => p.trim());
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of args.bases) {
    let stripped = stripAllPlaceTokensFromKeyword(raw, places).trim();
    if (company) {
      stripped = stripTradingNameFromPhrase(stripped, company);
    }
    if (!stripped || isRejectedEntitySapKeywordSync(stripped, company)) continue;
    const key = stripped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(stripped);
  }
  let cursor = 0;
  while (out.length < args.count && args.gscKeywords.length > 0 && cursor < args.gscKeywords.length) {
    const candidate = args.gscKeywords[cursor]!;
    cursor += 1;
    let stripped = stripAllPlaceTokensFromKeyword(candidate, places).trim();
    if (company) {
      stripped = stripTradingNameFromPhrase(stripped, company);
    }
    if (!stripped || isRejectedEntitySapKeywordSync(stripped, company)) continue;
    const key = stripped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(stripped);
  }
  return out.slice(0, args.count);
}

export type EntitySapKeywordSources = {
  links: PromptBulkSitemapInventoryLink[];
  buckets: PromptBulkSitemapInventoryBuckets;
  gscQueries: GscSiteQueryRow[];
  gscDateRange: GscCompetitorDateRange;
};

export type FillEntitySapRowKeywordsArgs = {
  apiKey: string;
  model: string;
  siteId?: string;
  siteName: string;
  siteUrl: string;
  rows: CSVRow[];
  seedKeywords: string[];
  buckets: PromptBulkSitemapInventoryBuckets;
  gscQueries: GscSiteQueryRow[];
  gridLocations: string[];
  entityTypeFocus?: string[];
  clientAudienceContextMarkdown?: string;
  temperature?: number;
  topP?: number;
  onGroupComplete?: (rows: CSVRow[], doneGroups: number, totalGroups: number) => void;
  sapOccupancy?: EntitySapOccupancy;
  reservedSlugsInRun?: Set<string>;
  titleTemplate?: string;
};

export async function fetchEntitySapKeywordSources(
  site: WordPressSite,
  rowCount: number,
  onProgress?: (message: string) => void,
): Promise<EntitySapKeywordSources> {
  onProgress?.("Loading site inventory and GSC from cache");
  const warm = await ensureEntitySiteWarmCache(site);
  if (warm.error) {
    throw new Error(warm.error);
  }
  if (warm.inventory.totalRows === 0) {
    throw new Error(
      "WordPress sitemap inventory is empty. Connect the site and ensure Pages, Posts, and SAP sitemaps return URLs.",
    );
  }
  return {
    links: warm.inventory.links,
    buckets: warm.inventory.buckets,
    gscQueries: gscAllQueriesFromWarmBundle(warm),
    gscDateRange: warm.gsc.dateRange,
  };
}

export async function buildEntitySapKeywordSourcesFromInventory(
  inventory: { links: PromptBulkSitemapInventoryLink[]; buckets: PromptBulkSitemapInventoryBuckets; totalRows: number },
  site: WordPressSite,
  rowCount: number,
  onProgress?: (message: string) => void,
): Promise<EntitySapKeywordSources> {
  if (inventory.totalRows === 0) {
    throw new Error(
      "WordPress sitemap inventory is empty. Connect the site and ensure Pages, Posts, and SAP sitemaps return URLs.",
    );
  }
  const gsc = await fetchEntityGscKeywordBundle(site, rowCount, onProgress);
  return {
    links: inventory.links,
    buckets: inventory.buckets,
    gscQueries: gsc.queries,
    gscDateRange: gsc.dateRange,
  };
}

async function postOpenRouter(args: {
  apiKey: string;
  model: string;
  siteId: string | undefined;
  messages: { role: string; content: string }[];
  temperature: number;
  topP: number;
}): Promise<string> {
  const res = await postOpenRouterAppChatFetch( {
    method: "POST",
    headers: openRouterWebAppHeaders(args.apiKey),
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      temperature: args.temperature,
      top_p: args.topP,
      response_format: { type: "json_object" },
      stream: false,
    }),
  });
  const j = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok) return "";
  const content = j.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) return "";
  return content;
}

export function applyKeywordFillsToSapRows(rows: CSVRow[], fills: Map<number, string>): CSVRow[] {
  return rows.map((row, i) => ({ ...row, keyword: fills.get(i) ?? row.keyword ?? "" }));
}

type GroupRowRequest = {
  localRowIndex: number;
  globalRowIndex: number;
  seedKeyword: string;
};

function isRejectedEntitySapKeywordSync(keyword: string, siteName?: string): boolean {
  const k = keyword.trim();
  if (!k) return true;
  if (isLeakedInstructionEntityLabel(k)) return true;
  if (isOffensiveGscQuery(k)) return true;
  const company = siteName?.trim() ?? "";
  if (company && gscQueryMatchesTradingName(k, company, brandExclusionPhrasesFromNames(company))) {
    return true;
  }
  return false;
}

type KeywordCollisionContext = {
  sapOccupancy?: EntitySapOccupancy;
  reservedSlugsInRun?: Set<string>;
  titleTemplate?: string;
};

function keywordWouldCollide(
  keyword: string,
  entity: string,
  ctx?: KeywordCollisionContext,
): boolean {
  if (!ctx?.sapOccupancy) return false;
  return (
    findEntitySapRowCollision(
      { keyword, entity, titleTemplate: ctx.titleTemplate },
      ctx.sapOccupancy,
      ctx.reservedSlugsInRun,
    ) !== null
  );
}

function assignGscKeywordsForSection(
  section: EntityAdGroupSection,
  rows: CSVRow[],
  gscKeywords: string[],
  fills: Map<number, string>,
  placeCorpus: readonly string[] = [],
  collisionCtx?: KeywordCollisionContext,
): number {
  if (gscKeywords.length === 0) return 0;
  const usedPairsInGroup = new Set<string>();
  for (const globalIdx of section.rowIndices) {
    const entity = normalizeEntityHintCommaLabel((rows[globalIdx]?.entity ?? section.entity).trim());
    const kw = fills.get(globalIdx) ?? "";
    const pairKey = entity && kw ? entityKeywordPairKey(kw, entity) : "";
    if (pairKey) usedPairsInGroup.add(pairKey);
  }
  let assigned = 0;
  let cursor = 0;
  for (const globalIdx of section.rowIndices) {
    if (fills.get(globalIdx)?.trim()) continue;
    const entity = normalizeEntityHintCommaLabel((rows[globalIdx]?.entity ?? section.entity).trim());
    if (!entity) continue;
    for (let attempt = 0; attempt < gscKeywords.length; attempt++) {
      const base = gscKeywords[(cursor + attempt) % gscKeywords.length]!;
      if (isRejectedEntitySapKeywordSync(base)) continue;
      const keyword = sapKeywordFromShortBaseAndEntity(base, entity, placeCorpus);
      if (isRejectedEntitySapKeywordSync(keyword)) continue;
      const pairKey = entityKeywordPairKey(keyword, entity);
      if (!pairKey || usedPairsInGroup.has(pairKey)) continue;
      if (keywordWouldCollide(keyword, entity, collisionCtx)) continue;
      fills.set(globalIdx, keyword);
      usedPairsInGroup.add(pairKey);
      if (collisionCtx?.reservedSlugsInRun) {
        reserveEntitySapSlug(collisionCtx.reservedSlugsInRun, keyword, entity);
      }
      assigned++;
      cursor = (cursor + attempt + 1) % gscKeywords.length;
      break;
    }
  }
  return assigned;
}

/** One OpenRouter call: pick exactly `count` product bases from the GSC export. */
async function pickProductKeywordBasesFromGsc(args: {
  apiKey: string;
  model: string;
  siteId: string | undefined;
  siteName: string;
  siteUrl: string;
  entity: string;
  count: number;
  seedKeywords: string[];
  gscKeywords: string[];
  gridLocations: string[];
  clientAudienceContextMarkdown?: string;
  entityTypeFocus?: readonly string[];
  temperature: number;
  topP: number;
}): Promise<string[]> {
  const user = buildEntitySapKeywordPickUserPayload({
    siteName: args.siteName,
    siteUrl: args.siteUrl,
    entity: args.entity,
    count: args.count,
    gscKeywords: args.gscKeywords.slice(0, 500),
    seedKeywords: args.seedKeywords,
    gridLocations: args.gridLocations,
    clientAudienceContextMarkdown: args.clientAudienceContextMarkdown,
    entityTypeFocus: args.entityTypeFocus,
  });
  const content = await postOpenRouter({
    apiKey: args.apiKey,
    model: args.model,
    siteId: args.siteId,
    messages: [
      {
        role: "system",
        content: buildEntitySapKeywordPickSystemPrompt({
          mode: "pick",
          clientAudienceContextMarkdown: args.clientAudienceContextMarkdown,
          entityTypeFocus: args.entityTypeFocus,
        }),
      },
      { role: "user", content: user },
    ],
    temperature: args.temperature,
    topP: args.topP,
  });
  let bases: string[] = [];
  try {
    const parsed = JSON.parse(content) as { bases?: unknown };
    if (Array.isArray(parsed.bases)) {
      bases = parsed.bases.map((b) => String(b ?? "").trim()).filter((b) => b.length > 0);
    }
  } catch {
    bases = [];
  }
  return padGscProductBasesFromCandidates({
    bases,
    count: args.count,
    gscKeywords: args.gscKeywords,
    entity: args.entity,
    gridLocations: args.gridLocations,
    siteName: args.siteName,
  });
}

/** Apply AI-picked GSC bases to rows in order (no post-pick filter pass). */
function applyPickedBasesToSection(
  section: EntityAdGroupSection,
  rows: CSVRow[],
  bases: string[],
  fills: Map<number, string>,
  placeCorpus: readonly string[] = [],
  siteName?: string,
): number {
  if (bases.length === 0) return 0;
  let assigned = 0;
  for (let i = 0; i < section.rowIndices.length; i++) {
    const globalIdx = section.rowIndices[i]!;
    if (fills.get(globalIdx)?.trim()) continue;
    const entity = normalizeEntityHintCommaLabel((rows[globalIdx]?.entity ?? section.entity).trim());
    if (!entity) continue;
    let base = (bases[i] ?? bases[i % bases.length] ?? "").trim();
    if (siteName?.trim()) {
      base = stripTradingNameFromPhrase(base, siteName);
    }
    if (!base || isRejectedEntitySapKeywordSync(base, siteName)) continue;
    const keyword =
      sapKeywordFromShortBaseAndEntity(base, entity, placeCorpus) ||
      composeServiceKeywordWithAdGroupEntity(base, entity);
    if (isRejectedEntitySapKeywordSync(keyword, siteName)) continue;
    fills.set(globalIdx, keyword);
    assigned += 1;
  }
  return assigned;
}

/** One OpenRouter call for a whole ad group: returns `count` unique keywords. */
async function inventGroupKeywordsViaOpenRouter(args: {
  apiKey: string;
  model: string;
  siteId: string | undefined;
  siteName: string;
  siteUrl: string;
  entity: string;
  count: number;
  seedKeywords: string[];
  gscKeywords: string[];
  gridLocations: string[];
  keywordsAlreadyUsedInGroup: string[];
  clientAudienceContextMarkdown?: string;
  entityTypeFocus?: readonly string[];
  temperature: number;
  topP: number;
  blockedForEntity?: ReturnType<typeof collectBlockedForEntity>;
}): Promise<string[]> {
  const keywordPlace = keywordPlaceSuffixFromEntity(args.entity);
  const hasInventoryBlock =
    (args.blockedForEntity?.existingPages.length ?? 0) > 0 ||
    (args.blockedForEntity?.slugs.length ?? 0) > 0;
  const system = buildEntitySapKeywordPickSystemPrompt({
    mode: "group",
    hasInventoryBlock,
    clientAudienceContextMarkdown: args.clientAudienceContextMarkdown,
    entityTypeFocus: args.entityTypeFocus,
  });
  const user = buildEntitySapKeywordPickUserPayload({
    siteName: args.siteName,
    siteUrl: args.siteUrl,
    entity: args.entity,
    keywordPlace,
    count: args.count,
    seedKeywords: args.seedKeywords,
    gscKeywords: args.gscKeywords,
    gridLocations: args.gridLocations,
    keywordsAlreadyUsedInGroup: args.keywordsAlreadyUsedInGroup,
    clientAudienceContextMarkdown: args.clientAudienceContextMarkdown,
    entityTypeFocus: args.entityTypeFocus,
    ...(args.blockedForEntity
      ? {
          existingSapPagesForEntity: args.blockedForEntity.existingPages.map((p) => ({
            title: p.title,
            keyword: p.keyword,
            slug: p.slug,
          })),
          blockedSlugs: args.blockedForEntity.slugs,
          blockedKeywords: args.blockedForEntity.keywords,
          blockedTitles: args.blockedForEntity.titles,
        }
      : {}),
  });
  const content = await postOpenRouter({
    apiKey: args.apiKey,
    model: args.model,
    siteId: args.siteId,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: args.temperature,
    topP: args.topP,
  });
  try {
    const parsed = JSON.parse(content) as { keywords?: unknown };
    if (!Array.isArray(parsed.keywords)) return [];
    const normalized = parsed.keywords
      .map((k) =>
        normalizeSapKeywordWithPlaceSuffix(
          String(k ?? "").trim(),
          args.entity,
          args.gridLocations,
        ),
      )
      .filter((k) => k.length > 0 && !isRejectedEntitySapKeywordSync(k, args.siteName));
    return normalized;
  } catch {
    return [];
  }
}

/** Later duplicates only (first occurrence keeps its keyword). */
function duplicateGlobalIndicesInSection(
  section: EntityAdGroupSection,
  fills: Map<number, string>,
  rows: CSVRow[],
): number[] {
  const seen = new Set<string>();
  const dupes: number[] = [];
  for (const globalIdx of section.rowIndices) {
    const kw = fills.get(globalIdx)?.trim();
    if (!kw) continue;
    const entity = normalizeEntityHintCommaLabel(
      (rows[globalIdx]?.entity ?? section.entity).trim(),
    );
    const pairKey = entity ? entityKeywordPairKey(kw, entity) : keywordUniquenessKey(kw);
    if (!pairKey) continue;
    if (seen.has(pairKey)) {
      dupes.push(globalIdx);
    } else {
      seen.add(pairKey);
    }
  }
  return dupes;
}

type AdGroupKeywordSubAgentResult = {
  gscAssigned: number;
  aiAssigned: number;
};

/** One entity ad group: AI picks N GSC product bases, then applies them directly. */
async function runEntityAdGroupKeywordSubAgent(args: {
  section: EntityAdGroupSection;
  rows: CSVRow[];
  gscKeywords: string[];
  seedKeywords: string[];
  allFills: Map<number, string>;
  apiKey: string;
  model: string;
  siteId: string | undefined;
  siteName: string;
  siteUrl: string;
  gridLocations: string[];
  clientAudienceContextMarkdown?: string;
  entityTypeFocus?: readonly string[];
  fillTemperature: number;
  topP: number;
}): Promise<AdGroupKeywordSubAgentResult> {
  const {
    section,
    rows,
    gscKeywords,
    seedKeywords,
    allFills,
    apiKey,
    model,
    siteId,
    siteName,
    siteUrl,
    gridLocations,
    clientAudienceContextMarkdown,
    entityTypeFocus,
    fillTemperature,
    topP,
  } = args;

  const pickCount = section.rowIndices.length;
  const bases = await pickProductKeywordBasesFromGsc({
    apiKey,
    model,
    siteId,
    siteName,
    siteUrl,
    entity: section.entity,
    count: pickCount,
    seedKeywords: section.rowIndices
      .map((i) => (seedKeywords[i] ?? "").trim())
      .filter(Boolean),
    gscKeywords,
    gridLocations,
    clientAudienceContextMarkdown,
    entityTypeFocus,
    temperature: fillTemperature,
    topP,
  });
  const aiAssigned = applyPickedBasesToSection(
    section,
    rows,
    bases,
    allFills,
    gridLocations,
    siteName,
  );
  return { gscAssigned: 0, aiAssigned };
}

/** AI picks N GSC product bases per ad group; applies them directly (no post-pick filter). */
export async function fillEntitySapRowKeywordsFromInventoryAndGsc(
  args: FillEntitySapRowKeywordsArgs,
): Promise<CSVRow[]> {
  const {
    apiKey,
    model,
    siteId,
    siteName,
    siteUrl,
    rows,
    seedKeywords,
    gscQueries,
    gridLocations,
    temperature = 0.35,
    topP = 1,
    sapOccupancy,
    reservedSlugsInRun: reservedSlugsInRunArg,
    titleTemplate,
    clientAudienceContextMarkdown,
    entityTypeFocus,
  } = args;

  if (rows.length === 0) return rows;
  await ensureMasterInstructionsInMemory(siteId);

  const reservedSlugsInRun = reservedSlugsInRunArg ?? new Set<string>();

  const fillTemperature = rows.length >= 2 ? Math.max(temperature, 0.45) : temperature;
  const brandPhrases = brandExclusionPhrasesFromNames(siteName, siteUrl);
  const gscKeywords = gscAllQueryStringsForEntityKeywordFill(gscQueries, brandPhrases, siteName);
  const sections = buildEntityAdGroupSections(rows);
  const allFills = new Map<number, string>();

  const totalGroups = sections.length;
  let doneGroups = 0;
  await Promise.all(
    sections.map(async (section) => {
      const localFills = new Map<number, string>();
      await runEntityAdGroupKeywordSubAgent({
        section,
        rows,
        gscKeywords,
        seedKeywords,
        allFills: localFills,
        apiKey,
        model,
        siteId,
        siteName,
        siteUrl,
        gridLocations,
        clientAudienceContextMarkdown,
        entityTypeFocus,
        fillTemperature,
        topP,
      });
      for (const [idx, kw] of localFills) {
        allFills.set(idx, kw);
      }
      doneGroups += 1;
      args.onGroupComplete?.(applyKeywordFillsToSapRows(rows, allFills), doneGroups, totalGroups);
    }),
  );

  return applyKeywordFillsToSapRows(rows, allFills);
}
