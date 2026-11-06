/**
 * Local Analysis “Suggest keywords”: one OpenRouter research-model completion → map to targets.
 */
import {
  LOCAL_ANALYSIS_SAP_MAX,
  LOCAL_ANALYSIS_SAP_MIN,
  LOCAL_ANALYSIS_SUGGEST_MAX_DISTINCT_TARGETS,
  LOCAL_ANALYSIS_SUGGEST_SAP_MIN_PER_TARGET,
} from "@/lib/local-analysis-target-constants";
import {
  flattenClustersToRoughRows,
  ensureUniqueClusterIdPerSeedGroup,
  collapseRoughToSeedGroupsOnly,
  propagateSeedEntityHintsToMembers,
  stripeEntityHintsFromOrderedPool,
  type SapRoughClusterRow,
} from "@/lib/local-analysis-keyword-cluster";
import {
  readSuggestKeywordTargetsFromModelContent,
  suggestKeywordTargetsResponseFormat,
} from "@/lib/suggest-keyword-targets-schema";
import {
  entityLevelLabel,
  formatEntityTaxonomyForPrompt,
  resolveEntityGeographicLevel,
  type EntityGeographicLevel,
} from "@/lib/entity-geographic-level";
import type { SuggestedKeywordTarget } from "@/lib/local-analysis-suggest-keyword-targets";
import { loadApiKey } from "@/lib/api";
import {
  appendMasterInstructionsToSystemPrompt,
  buildSapMasterRulesDistinctClustersBlock,
  buildSapMasterRulesKeywordMixRecap,
  buildSapMasterRulesWorkflowPrefix,
  ensureMasterInstructionsInMemory,
  getMasterInstructionsText,
  hasMasterInstructions,
} from "@/lib/master-instructions-storage";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { CompetitorKeywordRow } from "@/lib/competitor-research/types";
import type { GridKeywordWeight, PlaceWeaknessWeight } from "@/lib/process-local-dominator-upload";
import { gridPlaceEvidenceForWikiOrder, isInternalGridPlaceBucketLabel, parseLocalDominatorCsv } from "@/lib/local-dominator-csv";
import type { PromptBulkSitemapInventoryBuckets } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import { gscKeywordsForOpenRouter } from "@/lib/bulk/bulk-gsc-site-queries";
import type { GscSiteQueryRow } from "@/lib/competitor-research/types";
import {
  appendSiteInventoryBucketsToUserPrompt,
  buildGscKeywordsBlock,
  buildSiteInventorySystemBlock,
  countNonemptySitemapBuckets,
} from "@/lib/prompt-builders/bulk-ideas";
import type { SitePostInventoryRow } from "@/lib/wordpress-api/types";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import {
  backfillEntityHintFromGridPlaceHints,
  backfillEntityHintFromWikipediaPool,
  finalizeEntityHintForKeywordTarget,
} from "@/lib/local-analysis-entity-hint-dedupe";
import { dropCityUmbrellaTitlesWhenFinerExist } from "@/lib/wikipedia/entity-hint-subcity";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import {
  extractArticleTitlesFromGranularPoolMarkdown,
  orderWikipediaTitlesByGridPlaces,
  snapAllEntityHintsToWikipediaPoolTitles,
} from "@/lib/wikipedia/extract-wikipedia-pool-titles";

function roughRowsToSuggestedTargets(rows: SapRoughClusterRow[]): SuggestedKeywordTarget[] {
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
function metroCityWordFromSuggestOptions(
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
function dedupeSeedEntityHintsOntoOrderedPool(
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
function snapSeedEntityHintsToFilteredWikipediaPool(
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

function uniqGridBackfillHints(
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
function applyFinalizeEntityHintsAndPropagate(
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

const MAX_POSTS_IN_PROMPT = 120;
const MAX_SEED_RANKED_KEYWORDS_IN_JSON = 45;

export function localAnalysisInventoryStorageKey(siteId: string): string {
  return `neo-pulse.local-analysis.site-inventory.${siteId}`;
}

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

export async function suggestKeywordTargetsFromInventory(
  posts: SitePostInventoryRow[],
  totalSapPages: number,
  options?: SuggestKeywordTargetsFromInventoryOptions
): Promise<SuggestedKeywordTarget[]> {
  if (totalSapPages < LOCAL_ANALYSIS_SAP_MIN) {
    throw new Error(`Total must be at least ${LOCAL_ANALYSIS_SAP_MIN}.`);
  }
  const apiKey = options?.apiKey ?? loadApiKey();
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw new Error("Add an OpenRouter API key in app settings to suggest keywords.");
  }
  await ensureMasterInstructionsInMemory(options?.siteId);
  const egLevel = resolveEntityGeographicLevel(options?.entityGeographicLevel);
  const entityTypeFocusRows = options?.entityTypeFocus ?? [];
  const useCityEntityScope = egLevel === "city";
  const grid = options?.gridKeywordWeights ?? [];
  const postPayload = posts.slice(0, MAX_POSTS_IN_PROMPT).map((p) => ({
    title: p.fields.title ?? "",
    keyword: p.fields.keyword ?? "",
  }));
  const websiteUrl = options?.businessWebsiteUrl ?? options?.seedSiteUrl ?? "";
  const hasGridContext =
    grid.length > 0 ||
    (options?.uploadedGridCsvFull?.length ?? 0) > 0 ||
    (options?.gridSummaryMarkdown?.length ?? 0) > 0;
  const businessName = options?.businessName ?? "";
  const gmbJsonRaw = options?.dataForSeoGmbGoogleBusinessInfoLiveJson ?? "";
  if (hasGridContext) {
    if (businessName.length === 0 || websiteUrl.length === 0) {
      throw new Error("Enter business name and website URL before suggesting with the grid.");
    }
  }
  if (postPayload.length === 0 && grid.length === 0 && websiteUrl.length === 0 && (options?.focusLocation ?? "").length === 0) {
    throw new Error(
      "Set a website URL, add a focus location, or upload a grid CSV - AI suggest needs at least one anchor when WordPress post inventory is empty."
    );
  }

  const mdRaw = options?.gridSummaryMarkdown ?? "";
  const csvRaw = options?.uploadedGridCsvFull ?? "";
  const wikiPoolRaw = options?.wikipediaGranularEntityPoolMarkdown ?? "";
  const hasWikiPool = wikiPoolRaw.length > 0;
  const placeWeightsSorted = [...(options?.gridPlaceWeaknessWeights ?? [])].sort(
    (a, b) => b.weight - a.weight || a.place.localeCompare(b.place),
  );
  const gridSorted = [...grid].sort((a, b) => Number(b.weight ?? 0) - Number(a.weight ?? 0));
  const maxAffordableClusters = Math.max(1, Math.floor(totalSapPages / LOCAL_ANALYSIS_SUGGEST_SAP_MIN_PER_TARGET));
  const minDistinctKeywordTargets = Math.min(
    LOCAL_ANALYSIS_SUGGEST_MAX_DISTINCT_TARGETS,
    Math.max(1, maxAffordableClusters),
  );

  const seedPayload = (options?.seedRankedKeywordsFromDataForSeo ?? [])
    .filter((r) => String(r.phrase ?? "").length > 0)
    .slice(0, MAX_SEED_RANKED_KEYWORDS_IN_JSON)
    .map((r) => ({
      phrase: r.phrase,
      volume: r.volume,
      traffic: r.traffic,
      position: r.position,
    }));
  const hasSeedDfs = seedPayload.length > 0;

  const legacyHints = options?.gridPlaceHints ?? [];
  const siteId = options?.siteId ?? null;
  const masterRulesPresent = hasMasterInstructions(siteId);
  const noWpInventory = postPayload.length === 0;
  const focusKeywordTrim = (options?.focusKeyword ?? "").trim();
  const focusLocationTrim = (options?.focusLocation ?? "").trim();
  const userPayload: Record<string, unknown> = {
    totalSapPages,
    sapMinPerRow: LOCAL_ANALYSIS_SUGGEST_SAP_MIN_PER_TARGET,
    sapMaxPerRow: LOCAL_ANALYSIS_SAP_MAX,
    minDistinctKeywordTargets,
    gridKeywordsWithWeaknessWeight: gridSorted,
    postInventoryRows: postPayload,
    entityGeographicLevel: egLevel,
  };
  if (placeWeightsSorted.length > 0) {
    userPayload.gridPlaceWeaknessWeights = placeWeightsSorted;
  }
  if (businessName.length > 0) userPayload.businessName = businessName;
  if (websiteUrl.length > 0) userPayload.businessWebsiteUrl = websiteUrl;
  if (legacyHints.length > 0) userPayload.gridPlaceHintsFromCsv = legacyHints;
  if (seedPayload.length > 0) userPayload.seedRankedKeywordsFromDataForSeo = seedPayload;
  if (focusKeywordTrim.length > 0) {
    if (masterRulesPresent) {
      userPayload.focusKeywordUiHintSecondary = focusKeywordTrim;
    } else {
      userPayload.focusKeyword = focusKeywordTrim;
    }
  }
  if (masterRulesPresent) {
    const masterExcerpt = getMasterInstructionsText(siteId).trim();
    if (masterExcerpt.length > 0) {
      userPayload.clientMasterInstructionsExcerpt = masterExcerpt.slice(0, 6000);
    }
    userPayload.keywordThemeMixGovernedBy = "client_master_instructions";
    const invThemes = [
      ...new Set(postPayload.map((p) => String(p.keyword ?? "").trim()).filter((k) => k.length > 0)),
    ].slice(0, 24);
    if (invThemes.length > 0) {
      userPayload.publishedKeywordThemesFromInventory = invThemes;
    }
    if (gridSorted.length === 1) {
      userPayload.gridSingleTrackedKeywordNote =
        "Grid CSV tracks one keyword theme. Multiple clusters must use DISTINCT seedKeyword themes per CLIENT MASTER INSTRUCTIONS — not repeats of gridKeywordsWithWeaknessWeight[0].";
    }
  }
  if (focusLocationTrim.length > 0) userPayload.focusLocation = focusLocationTrim;
  if (entityTypeFocusRows.length > 0) userPayload.entityTypeFocus = entityTypeFocusRows;
  if (noWpInventory) userPayload.noWordPressPostInventory = true;
  if (hasGridContext && !masterRulesPresent) {
    userPayload.sapAllocationRule =
      "Allocate sapPagesSeed in proportion to gridKeywordsWithWeaknessWeight: higher weight = more SAP pages.";
    if (placeWeightsSorted.length > 0) {
      userPayload.gridPlaceWeaknessNote =
        "gridPlaceWeaknessWeights ranks weak areas (higher weight = weaker rank footprint). Use it to assign each seed a distinct hyperlocal wikiEntityHint from the Wikipedia ### list or grid CSV addresses that matches that weak area. Never use FSA codes, pin_ buckets, or one repeated metro-wide label for every cluster.";
    }
  }
  const gmbSection =
    gmbJsonRaw.length > 0
      ? `\n\n--- DataForSEO google_my_business_info (full JSON, verbatim) ---\n${gmbJsonRaw}`
      : "";
  const clienteRaw = options?.clientAudienceContextMarkdown ?? "";
  const clienteSection =
    clienteRaw.length > 0 ? `\n\n--- Client / audience context ---\n${clienteRaw}` : "";
  const gridMdSection =
    mdRaw.length > 0 ? `\n\n--- Grid scan (full markdown, complete file) - grid RAG ---\n${mdRaw}` : "";
  const gridCsvSection =
    csvRaw.length > 0 ? `\n\n--- Uploaded grid CSV (full file, verbatim) - grid RAG ---\n${csvRaw}` : "";
  const wikiSection =
    wikiPoolRaw.length > 0
      ? `\n\n--- Wikipedia granular place candidates (read before grid RAG; canonical en.wikipedia.org \`###\` titles). The app may snap seed **entityHint** to these titles after your reply. ---\n${wikiPoolRaw}`
      : "";
  const ragTail =
    hasWikiPool && useCityEntityScope
      ? gmbSection + clienteSection + wikiSection + gridMdSection + gridCsvSection
      : gmbSection + clienteSection + gridMdSection + gridCsvSection + wikiSection;
  const userBase = JSON.stringify(userPayload) + ragTail;
  const siteInventoryBuckets = options?.siteInventoryBuckets;
  const gscQueries = options?.gscQueries ?? [];
  const gscKeywords =
    gscQueries.length > 0
      ? gscKeywordsForOpenRouter(gscQueries, Math.max(totalSapPages * 3, 30))
      : [];
  const user = siteInventoryBuckets
    ? appendSiteInventoryBucketsToUserPrompt(userBase, siteInventoryBuckets)
    : userBase;

  const keywordFromSeedBlock = hasSeedDfs
    ? `**seedRankedKeywordsFromDataForSeo:** Derive seedKeyword/member keyword from these phrases — geography-free keywords, places in wikiEntityHint only.\n\n`
    : "";

  const focusKeywordBlock =
    !masterRulesPresent && focusKeywordTrim.length > 0
      ? `

**Optional focusKeyword:** The JSON payload includes **focusKeyword**. Read that value. Judge the split **across the entire batch** of targets (count rows), not per row in isolation. **Roughly 65% to 70%** of the "keyword" strings should **clearly center on that theme** (distinct service-intent phrasing per row: modifiers, problem type, offer angle). The remaining **30% to 35%** should use **complementary** intents grounded in the grid or post inventory (still no geography in "keyword"). **Do not** assign **focusKeyword** to 100% of rows when there are two or more targets. If grid weakness weights or seed phrases point elsewhere, **balance** within that band without ignoring the grid.`
      : "";

  const focusLocationBlock =
    focusLocationTrim.length > 0
      ? `

**Optional focusLocation:** The JSON payload includes **focusLocation** - the user's **geographic focus** (e.g. city, province or state, or country). **Every entityHint** must name real places **inside or clearly tied to** that area (vary sub-areas: neighbourhoods, corridors, districts, landmarks when evidence allows). **Do not** put focusLocation wording in **keyword** (keywords stay service-intent only). When a full grid CSV is present and its footprint conflicts, **prefer the grid** for what is reachable; otherwise treat focusLocation as the primary service-area anchor.`
      : "";

  const hasGridGeo = csvRaw.length > 0 || mdRaw.length > 0;

  const gridBoundingBlock =
    hasGridGeo && useCityEntityScope
      ? `

**Grid-bounded geography (mandatory):** The grid markdown + CSV define the **only** geography you may attack: bounding box, centroid, and address samples. **entityHint granularity (critical):** default to **neighbourhood, district, industrial pocket, street corridor, named landmark, or historic quarter** - the same scale a customer would use for “service near me.” **Do not** use a **whole city** or **City, ST** as the only geography when the **Wikipedia block** or **address lines** support finer anchors (e.g. street before city, neighbourhood name, district). **Not** a whole province, **not** a region larger than that footprint, **not** a generic “service Alberta” style label.

**Traceability:** Every **entityHint** must be **defensible from a line** in the grid CSV, grid markdown, or a \`###\` title in the Wikipedia block - **do not** substitute a **regional hub** or core-metro city name that does **not** appear in those attachments when the grid only evidences suburban or corridor geography.

**Forbidden for entityHint (non-negotiable):** **Province-only** or province-primary labels - e.g. **Alberta**, **AB**, **Alberta, Canada**, or any string where the **only** geography is the province. **Never** output a **US state name alone** (e.g. **Georgia**, **California**) or a **Canadian province or territory name alone** as entityHint. **Never** use **only** a **metro-wide city name** (e.g. **Smyrna, GA** or **City, ST** as the entire hint) when the attachments list **sub-metro** neighbourhoods, streets, districts, or landmarks - in those cases you must pick a **finer** label. **Never** use **Alberta** (or any province name) as the place name for a row. The campaign is **grid-local**, not provincial SEO.

If **gridPlaceHintsFromCsv** appears, treat it as **market context** only - **entityHint** must still be **hyperlocal** (neighbourhood / street / landmark / district), not a bare city line when finer evidence exists, and **never** province-alone.`
      : hasGridGeo
        ? `

**Geographic scope (${entityLevelLabel(egLevel)} - user-selected):** The grid markdown and CSV provide **footprint, keyword themes, weakness weights, and address evidence**. **entityHint** must use **real place names** at **${entityLevelLabel(egLevel)}** scale - see taxonomy in the intro - grounded in **GMB JSON**, business name, website, and grid lines. You are **not** limited to sub-metro neighbourhood-only labels when the business and evidence support **regional or multi-city** service-area targeting.

${formatEntityTaxonomyForPrompt(egLevel, entityTypeFocusRows)}

**Traceability:** Prefer **entityHint** values you can justify from **GMB**, business context, or grid evidence; use place **types** from the taxonomy in the intro; do not invent fantasy locations.

**Forbidden in entityHint:** street numbers, unit/suite lines, full mailing addresses, postal codes.`
        : "";

  const wikiEntityBlock =
    hasWikiPool && useCityEntityScope
      ? `

**entityHint - Wikipedia first, then grid:** Step 1 = **Wikipedia** block: each \`###\` line is an **existing** article resolved before this prompt — **choose seed geography from these titles first** (sub-metro neighbourhood, district, quadrant, street article, landmark…). Step 2 = grid markdown + CSV — use them to **bound which** \`###\` title fits (footprint, weakness), **not** to invent a new place name when a matching \`###\` exists. **entityHint MUST be one of those \`###\` article titles** (verbatim) for **geographic** pages at **neighbourhood, district, street, landmark, or quarter** scale — **not** a bare whole-city umbrella **when** the list also contains a **finer** article for the same metro (the app enforces this on seeds). **Never** pick a **topic, industry, product, or service** article that mirrors the service keyword - e.g. **not** "Interior design", "Window treatment", "Shade (window)". If every \`###\` line is coarse, pick the **smallest real place** that still fits the footprint. Prefer rows **Source: category members**. **Do not** output **Alberta** / **AB** / province-only, **or a US state or Canadian province/territory name alone**. **Forbidden in entityHint:** invented place names, "Near "/"Around ", street numbers, postal codes, unit lines.
**Non-negotiable (never use as entityHint, even if it appears as a \`###\` line):** prehistoric **cultures**, archaeological **dig sites**, NRHP **dig** **“… Site”** titles, **earthworks**, **rock art**, paleontology - not service-area geography. Prefer **human-scale** neighbourhoods, districts, main streets, corridors, **historic districts**, **quarters**, and **named places** where people live and work - aligned with **street and area evidence** in the grid CSV.
**Prefer** the **most specific** applicable \`###\` title (neighbourhood > district > street > suburb) over a **whole-city** article when both fit the footprint. **Avoid** heritage-only dig sites, remote natural areas, or sports federations when the grid implies **local service-area** SEO.`
      : hasWikiPool
        ? `

**entityHint - Wikipedia (optional reference):** Each \`###\` line is an existing article. You may use a **geographic** \`###\` title as **entityHint** when it fits **${entityLevelLabel(egLevel)}** scale and the business - **or** derive **entityHint** from GMB + grid + business context. **Do not** force sub-metro-only labels when the user scope is **${entityLevelLabel(egLevel)}**. **Never** pick topic/industry/service articles as place names. **Forbidden in entityHint:** "Near "/"Around ", street numbers, postal codes, unit lines.`
        : "";

  const csvGeographyBlock =
    csvRaw.length > 0 && !hasWikiPool && useCityEntityScope
      ? `

**entityHint - grid CSV is the geography source:** The user message includes the **full uploaded grid CSV** (and usually grid markdown). **Derive every entityHint from the most specific geography in the file:** **neighbourhood or district names**, **street / corridor** text from the address column before **City, ST**, **landmarks** or **business-area** names, then **city** only if nothing finer appears. **Do not** default to **City, ST** alone when the address line contains a street or area segment you can use. **Do not** invent places absent from the CSV. **Do not** use province-only or one **whole-city** label for every target when the sheet shows several distinct local areas. The DataForSEO GMB JSON block is **business context** (name, hours) - **do not** use it to replace CSV geography for entityHint. **Forbidden in entityHint:** "Near "/"Around ", full postal codes, unit lines.`
      : csvRaw.length > 0 && !hasWikiPool
        ? `

**entityHint - grid CSV (${entityLevelLabel(egLevel)}):** Derive **entityHint** from the CSV and markdown at **${entityLevelLabel(egLevel)}** scale - cities, regions, corridors, or sub-city areas as the taxonomy in the intro allows. **Ground** in address columns, City, ST, and named areas. The GMB JSON block is **business context**. **Forbidden in entityHint:** "Near "/"Around ", full postal codes, unit lines.`
        : "";

  const csvNonGeoNote =
    csvRaw.length > 0 && hasWikiPool && useCityEntityScope
      ? `

**Grid CSV + Wikipedia:** Read the **Wikipedia** \`###\` list first for **verifiable place titles**, then **grid CSV + markdown** to **match** titles to footprint and weakness — **do not** substitute a bare **City** article as the seed when a **neighbourhood/district/quadrant** \`###\` fits. **entityHint** must stay **grid-bounded** and **hyperlocal**.`
      : csvRaw.length > 0 && hasWikiPool
        ? `

**Grid CSV + Wikipedia (${entityLevelLabel(egLevel)}):** Read grid for footprint and themes, then Wikipedia for **optional** place names. **entityHint** must match **${entityLevelLabel(egLevel)}** scale (see taxonomy in the intro); **do not** require sub-metro-only Wikipedia titles.`
        : "";

  const gridWeightsEntityBlock =
    placeWeightsSorted.length > 0
      ? `

**wikiEntityHint from grid weakness (mandatory):** **gridPlaceWeaknessWeights** ranks which areas are weakest (higher **weight** = weaker). For each seed cluster, pick a **hyperlocal place name** from the Wikipedia ### block or grid CSV (neighbourhood, district, corridor, landmark) that matches a **high-weight** weak area. Rotate across **distinct** real place names. **Forbidden in wikiEntityHint:** FSA/postal codes, \`pin_\` lat/lng buckets, bare \`City, Province\` on every row, GMB storefront city as a substitute for grid geography.`
      : "";

  const systemBaseIntro = useCityEntityScope
    ? `You assign SAP (service area page) keyword targets for local SEO. Act as a **senior local SEO specialist**: **entityHint** must be **hyperlocal and grid-bounded** - **neighbourhoods, districts, street corridors, named landmarks, industrial pockets**, **not** a whole-city or **City, ST** label unless the **Wikipedia list and CSV addresses** truly contain **no finer** named place.

`
    : `You assign SAP (service area page) keyword targets for local SEO. Act as a **senior local SEO specialist**. **Geographic scope (user-selected): ${entityLevelLabel(egLevel)}.** **entityHint** uses **real place names** at that scale; **"keyword"** stays **service-intent only** (no geography in keyword strings).

${formatEntityTaxonomyForPrompt(egLevel, entityTypeFocusRows)}

`;

  const localAnalysisClustersParagraph = useCityEntityScope
    ? `**Local analysis - seed groups only (Clusters step):** Return **seed clusters** only — each cluster is one \`seedKeyword\`, one \`wikiEntityHint\`, and \`sapPagesSeed\` (SAP budget for that cluster). **members must always be \`[]\`** in this step; supporting member keywords are created later at Generate. When **minDistinctKeywordTargets** is 2 or more, return **that many seed clusters**, each with a **different** \`seedKeyword\` (distinct service-line theme) **and** a **different** \`wikiEntityHint\` (distinct hyperlocal areas from grid weakness + Wikipedia/CSV). **At least 3 seed clusters** when the JSON payload and budget allow. **sapPagesSeed** per cluster must be **at least** \`sapMinPerRow\` unless the total budget is too small to split. \`clusterId\` must be unique per cluster.

`
    : `**Local analysis - seed groups only (Clusters step):** Return **seed clusters** only — \`members\` must always be \`[]\`; member keywords are created at Generate. When **minDistinctKeywordTargets** is 2 or more, return **that many seed clusters**, each with a **different** \`seedKeyword\` and **different** \`wikiEntityHint\` at **${entityLevelLabel(egLevel)}** scale. **sapPagesSeed** per cluster must be **at least** \`sapMinPerRow\` unless the total budget is too small. \`clusterId\` must be unique per cluster.

`;

  const masterWorkflowPrefix = buildSapMasterRulesWorkflowPrefix(siteId);

  const workflowParagraph = useCityEntityScope
    ? `${masterWorkflowPrefix}**Workflow (read the user message in this order):** (1) **Wikipedia granular candidate block** (when present) — canonical list of existing en.wikipedia.org article titles for places (those pages were resolved via Wikipedia before this prompt). Prefer **entityHint** \`###\` titles that fit the footprint. (2) **Grid RAG** — full grid markdown + CSV for footprint, keyword themes, weakness weights, and addresses. **Do not** invent neighbourhood names from the grid alone when matching \`###\` titles exist. (3) **Suggest** — output JSON targets only; grid is ground truth for the campaign area; Wikipedia supplies verifiable place names.

`
    : masterRulesPresent
      ? `${masterWorkflowPrefix}**Workflow:** (1) **Structured JSON** - budgets and scope. (2) **CLIENT MASTER INSTRUCTIONS** (appended to this system message) - business grounding, service mix, and geography. (3) **Grid RAG** when present - themes and addresses. (4) **Wikipedia** when present - optional place-name candidates. (5) **Suggest** - output JSON; **entityHint** at **${entityLevelLabel(egLevel)}** scale.

`
      : `${masterWorkflowPrefix}**Workflow:** (1) **Structured JSON** - budgets and scope. (2) **Grid RAG** when present - themes and addresses. (3) **Wikipedia** when present - optional place-name candidates. (4) **Suggest** - output JSON; **entityHint** at **${entityLevelLabel(egLevel)}** scale.

`;

  const entityHintCommaFragment = hasWikiPool
    ? useCityEntityScope
      ? " **Use only `###` article titles** from the Wikipedia granular block - those pages were resolved via Wikipedia first; **do not** substitute CSV address text."
      : ` **Wikipedia \`###\` titles** may inform **entityHint** when they match **${entityLevelLabel(egLevel)}** scale; otherwise use CLIENT MASTER INSTRUCTIONS, grid, and business context.`
    : csvRaw.length > 0
      ? useCityEntityScope
        ? " **Ground geography in the uploaded grid CSV** (rules below)."
        : ` **Ground geography** in the grid CSV at **${entityLevelLabel(egLevel)}** scale (rules below).`
      : masterRulesPresent
        ? " **Ground geography** in CLIENT MASTER INSTRUCTIONS and any grid data in the user message."
        : " Use business context and any grid data in the user message.";

  const rulesParagraph5 = useCityEntityScope
    ? hasWikiPool
      ? "**when the Wikipedia block is present, each entityHint must be exactly one of the `###` article titles** in that block (existing Wikipedia pages only), still grid-bounded - **prefer the most specific sub-metro title** (neighbourhood / district / street / landmark) over a whole-city line when both fit. "
      : "**never** use a bare **City, Province** or whole-city **City, ST** umbrella when the CSV or markdown shows streets, neighbourhoods, or districts - **never** **Alberta** / province-only - only **grid-bounded** hyperlocal labels from the attachments. "
    : masterRulesPresent
      ? `**entityHint** at **${entityLevelLabel(egLevel)}** scale - use taxonomy types; ground in CLIENT MASTER INSTRUCTIONS, business name, website, and grid when present. **Do not** put geography in **keyword**. `
      : `**entityHint** at **${entityLevelLabel(egLevel)}** scale - use taxonomy types; ground in business name, website, and grid when present. **Do not** put geography in **keyword**. `;

  const attachmentsOrderNote =
    hasWikiPool && useCityEntityScope
      ? `**Attachments order (fixed):** JSON payload, then optional **Client / audience context**, then **Wikipedia granular candidate block**, then **grid markdown (RAG)**, then **full grid CSV (RAG)** — read in that sequence; the app sends them verbatim. **CLIENT MASTER INSTRUCTIONS** are appended to this system message when present.`
      : `**Attachments order (fixed):** JSON payload, then optional **Client / audience context**, then **grid markdown (RAG)**, then **full grid CSV (RAG)**, then optional **Wikipedia granular candidate block** — read in that sequence; the app sends them verbatim. **CLIENT MASTER INSTRUCTIONS** are appended to this system message when present.`;

  const systemBase = `${systemBaseIntro}**Return JSON:** \`{"clusters":[...]}\` only (enforced by response schema). Each cluster: seedKeyword, wikiEntityHint, sapPagesSeed, members (always \`[]\` in Clusters step). Sum of sapPagesSeed = totalSapPages.

${localAnalysisClustersParagraph}${workflowParagraph}${keywordFromSeedBlock}**keyword (critical):** Service intent only — never embed place names in keyword strings. Geography only in wikiEntityHint.${focusKeywordBlock}${focusLocationBlock}

**wikiEntityHint:** Comma-separated local place (no prose).${entityHintCommaFragment}${gridWeightsEntityBlock}${wikiEntityBlock}${csvGeographyBlock}${csvNonGeoNote}${gridBoundingBlock}

${attachmentsOrderNote}

${masterRulesPresent ? `${buildSapMasterRulesKeywordMixRecap(siteId)}\n\n${buildSapMasterRulesDistinctClustersBlock(siteId)}` : `**Weakness:** gridKeywordsWithWeaknessWeight sorted high weight first. Allocate more sapPagesSeed to matching themes. Follow sapAllocationRule when present.`}

Rules: (1) Sum sapPagesSeed = totalSapPages. (2) Each sapPagesSeed between sapMinPerRow and sapMaxPerRow. (3) At least one cluster. (4) When minDistinctKeywordTargets>1: **non-negotiable** distinct \`seedKeyword\` **and** distinct \`wikiEntityHint\` per cluster — never repeat the same \`seedKeyword\` on multiple clusters. (5) wikiEntityHint on every seed; ${rulesParagraph5}(6) JSON only.`;

  const wpInventoryTail =
    noWpInventory
      ? `

**No WordPress post inventory:** postInventoryRows empty. Use businessName, businessWebsiteUrl, GMB, grid attachments.`
      : masterRulesPresent
        ? `

**WordPress post inventory:** Use postInventoryRows vocabulary. Master rules % splits apply. Keywords stay geo-free.`
        : hasSeedDfs
          ? `

**WordPress post inventory:** When **seedRankedKeywordsFromDataForSeo** is present, prefer keyword themes that match **both** ranked seed phrases and post titles/keywords when possible; otherwise prioritize alignment with **seedRankedKeywordsFromDataForSeo** for services the domain actually ranks for.`
          : "";

  const siteInventoryBucketCount = siteInventoryBuckets
    ? countNonemptySitemapBuckets(siteInventoryBuckets)
    : 0;
  const siteInventoryResearchTail =
    (siteInventoryBucketCount > 0 ? buildSiteInventorySystemBlock(siteInventoryBucketCount) : "") +
    (gscKeywords.length > 0
      ? buildGscKeywordsBlock(gscKeywords, totalSapPages, focusKeywordTrim || undefined)
      : "");

  const system = systemBase + wpInventoryTail + siteInventoryResearchTail;

  const systemForModel = appendMasterInstructionsToSystemPrompt(system, options?.siteId ?? null);

  const callModel = async (messages: { role: string; content: string }[]): Promise<string> => {
    const res = await postOpenRouterAppChatFetch( {
      method: "POST",
      headers: openRouterWebAppHeaders(apiKey),
      body: JSON.stringify({
        model: getResearchModel(options?.siteId),
        messages,
        temperature: 0.2,
        response_format: suggestKeywordTargetsResponseFormat(minDistinctKeywordTargets),
        stream: false,
      }),
    });
    const j = await res.json() as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    };
    const content = j.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("Research model returned no content.");
    }
    return content;
  };

  const content = await callModel([
    { role: "system", content: systemForModel },
    { role: "user", content: user },
  ]);
  let gridEvidenceForWiki = "";
  if (csvRaw.trim().length > 0) {
    const pr = parseLocalDominatorCsv(csvRaw);
    if (!pr.error && pr.rows.length > 0) {
      gridEvidenceForWiki = gridPlaceEvidenceForWikiOrder(pr.rows, 6000, 80, { addressOnly: true });
    }
  }
  const modelData = readSuggestKeywordTargetsFromModelContent(content);
  let rough = flattenClustersToRoughRows(modelData.clusters);
  rough = ensureUniqueClusterIdPerSeedGroup(rough);
  if (rough.length === 0) {
    throw new Error("Research model returned no keyword targets.");
  }

  let orderedPoolTitles: string[] = [];
  if (hasWikiPool && wikiPoolRaw.length > 0) {
    let poolTitles = extractArticleTitlesFromGranularPoolMarkdown(wikiPoolRaw);
    const metroCity = metroCityWordFromSuggestOptions(options, placeWeightsSorted);
    if (useCityEntityScope && metroCity && poolTitles.length > 0) {
      poolTitles = dropCityUmbrellaTitlesWhenFinerExist(poolTitles, metroCity);
    }
    if (poolTitles.length > 0) {
      orderedPoolTitles = orderWikipediaTitlesByGridPlaces(
        poolTitles,
        placeWeightsSorted,
        gridEvidenceForWiki || undefined,
      );
    }
  }

  if (hasWikiPool && useCityEntityScope && orderedPoolTitles.length > 0) {
    let snapped = snapSeedEntityHintsToFilteredWikipediaPool(rough, orderedPoolTitles);
    snapped = dedupeSeedEntityHintsOntoOrderedPool(snapped, orderedPoolTitles);
    snapped = stripeEntityHintsFromOrderedPool(snapped, orderedPoolTitles);
    rough = propagateSeedEntityHintsToMembers(snapped);
  }

  const gridBackfillHints = uniqGridBackfillHints(options, placeWeightsSorted);
  rough = applyFinalizeEntityHintsAndPropagate(rough, orderedPoolTitles, gridBackfillHints);
  rough = collapseRoughToSeedGroupsOnly(rough);

  return roughRowsToSuggestedTargets(rough);
}
