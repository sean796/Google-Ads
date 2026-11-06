import {
  buildSapEntityFieldRulesGridBroad,
  buildSapEntityFieldRulesManualBroad,
  buildSapEntityFooterGridBroad,
  buildSapEntityFooterManualBroad,
  clusterAnchorDistinctEntityClause,
  resolveEntityGeographicLevel,
  singleSeedEntityDifferentiationClause,
  targetsBlockMultiRowNote,
  targetsBlockOptionalEntityOutputPhrase,
} from "@/lib/entity-geographic-level";
import {
  appendMasterInstructionsToSystemPrompt,
  buildSapMasterRulesKeywordMixRecap,
  buildSapMasterRulesWorkflowPrefix,
  ensureMasterInstructionsInMemory,
  hasMasterInstructions,
} from "@/lib/master-instructions-storage";
import { fetchWikipediaClustersForSapEntityHints } from "@/lib/wikipedia-api";
import { harvestWikiPoolTitlesFromGridRows } from "@/lib/wikipedia/wiki-entity-pool";
import {
  expandKeywordTargetsToRowSeeds,
  type LocalSeoStrategyFromGridParams,
} from "@/lib/local-seo-strategy-deterministic-and-parsers";

export type LocalSeoStrategyGridPrompts = {
  systemPrompt: string;
  userPrompt: string;
  rowSeeds: string[];
  laSingleSeedSap: boolean;
  hasWpInventoryForPrompt: boolean;
};

export async function buildLocalSeoStrategyGridPrompts(
  params: LocalSeoStrategyFromGridParams,
): Promise<LocalSeoStrategyGridPrompts | null> {
  const {
    apiKey,
    targetSapCount,
    keywordTargets,
    gridSummaryMarkdown,
    siteName,
    siteUrl,
    entityLocation,
    siteId,
    wikipediaSearchAugment,
    manualTargetsOnly = false,
    supplementalUserEvidenceMarkdown,
    proposalKeywordMode = false,
    proposalGridSap = false,
    localAnalysisSingleSeed: localAnalysisSingleSeedParam = false,
    entityGeographicLevel: entityGeographicLevelParam,
    entityTypeFocus: entityTypeFocusParam,
    wordpressPostInventory,
    clientAudienceContextMarkdown,
    wikipediaPreferredTitles,
    gridParsedRows,
    gridPlaceHints,
    gridPlaceWeightsForWiki,
    onWikiProgress,
  } = params;
  const localAnalysisSingleSeed = localAnalysisSingleSeedParam === true;

  const wpPosts =
    wordpressPostInventory?.filter((r) => r && (String(r.title ?? "").trim() || String(r.keyword ?? "").trim())) ??
    [];
  const hasWpInventoryForPrompt = wpPosts.length > 0;
  const wpInventoryPayload = hasWpInventoryForPrompt
    ? wpPosts.slice(0, 120).map((p) => ({
        title: String(p.title ?? "").trim(),
        keyword: String(p.keyword ?? "").trim(),
      }))
    : [];
  const inventorySystemBlock = hasWpInventoryForPrompt
    ? `\n**WordPress post inventory (JSON in the user message):** Every SAP \`keyword\` must be **2–4 words**, geography-free, and built **only** from words or short multi-word snippets that appear in \`postInventoryRows\` (\`title\` and \`keyword\` fields). You may recombine tokens across rows; stay in **one industry**. **Do not** invent transactional patterns: **no** leading \`buy \`, trailing \` online\`, generic \`… near me\`, standalone \`cost\`, \`installation\`, \`packages\`, or \`financing\` **unless that exact substring appears** in an inventory string.\n`
    : "";
  const wpInventoryUserBlock = hasWpInventoryForPrompt
    ? `\n\n--- WordPress post inventory (postInventoryRows — **mandatory SAP keyword vocabulary**) ---
Each \`sapRows[].keyword\` must be **2–4 words**, geography-free, and traceable to the **title** / **keyword** strings below (reuse, split, or merge phrases — **not** unrelated SEO templates).

${JSON.stringify(wpInventoryPayload, null, 2)}
`
    : "";

  const manual = manualTargetsOnly === true;
  const laSingleSeedSap = localAnalysisSingleSeed === true && proposalKeywordMode !== true;

  let effectiveWikiPreferredTitles = (wikipediaPreferredTitles ?? [])
    .map((t) => t.trim())
    .filter(Boolean);
  if (
    effectiveWikiPreferredTitles.length === 0 &&
    gridParsedRows?.length &&
    !manual
  ) {
    effectiveWikiPreferredTitles = await harvestWikiPoolTitlesFromGridRows({
      rows: gridParsedRows,
      gridPlaceHints: gridPlaceHints ?? [],
      minCount: targetSapCount,
      wikipediaSearchAugment: wikipediaSearchAugment,
    });
  }

  const wikiPoolEntityBlock =
    effectiveWikiPreferredTitles.length > 0 && !manual
      ? `\n--- Wikipedia entity pool (read full list — pick allowed physical places only) ---
Each SAP row \`entity\` must come from **one title on this harvested list**. Read every line. **Allowed:** neighbourhoods, districts, communities, suburbs, streets, parks, buildings, malls, civic venues, landmarks. **Never use:** murders, crimes, deaths, trials, disasters, biographies, sports teams, companies, newspapers, films, or "List of …" pages — skip those even if listed. Format as **Place, City, Province/State** when needed. **Never** invent a name not on this list.

${effectiveWikiPreferredTitles
  .slice(0, 80)
  .map((t, i) => `${i + 1}. ${t}`)
  .join("\n")}

`
      : "";
  const rowSeeds = expandKeywordTargetsToRowSeeds(keywordTargets);
  const egLevel = resolveEntityGeographicLevel(entityGeographicLevelParam);
  const entityTypeFocus = (entityTypeFocusParam ?? []).filter(
    (s) => typeof s === "string" && s.trim().length > 0,
  );
  const useCityEntityRules = egLevel === "city";

  const proposalMatrixSapKeywordSupplement =
    proposalKeywordMode === true
      ? `
- **Proposal matrix - geography never in \`keyword\`:** Matrix lines may include city or region words for context. **Never** put those tokens in \`keyword\`. Output **short-tail** (**2–4 words**) **service-only** intent: remove every neighbourhood, city, province, region, and landmark token from the matrix line. Use \`entity\` and \`title\` for local wording; \`keyword\` stays geography-free.
- **Proposal matrix - offer-only phrasing:** If a matrix line leans on **reviews**, **case studies**, **testimonials**, or similar, strip those tokens when forming \`keyword\` and \`title\` — keep the **core product/service** the business sells or does (see **SAP product/service focus**).`
      : "";

  const sapTitleOmitBlock = `**SAP "title" field:** Set \`title\` to \`""\` on every row. Page titles are written later by a dedicated Gemini title agent — do not author titles in this response.`;

  if (!apiKey?.trim()) {
    return null;
  }
  if (!manual) {
    const g = gridSummaryMarkdown ?? "";
    if (proposalGridSap) {
      if (g.length === 0) {
        return null;
      }
    } else if (!g.trim()) {
      return null;
    }
  }

  await ensureMasterInstructionsInMemory(siteId ?? null);
  const sapMasterPrefix = buildSapMasterRulesWorkflowPrefix(siteId ?? null);

  const targetsBlock = keywordTargets
    .map((t, i) => {
      const hint = t.entityHint?.trim();
      const multiRowNote = t.sapPages > 1 ? targetsBlockMultiRowNote(egLevel, manual) : "";
      const hintScope = manual
        ? `(anchor within the user's stated geography / hints): "${hint}"`
        : `(anchor within grid bounds): "${hint}"`;
      const outputPhrase = targetsBlockOptionalEntityOutputPhrase(egLevel);

      if (proposalKeywordMode === true) {
        const base = `${i + 1}. Target (Content Opportunity Matrix line): "${t.keyword}": produce exactly ${t.sapPages} SAP row(s). **SAP \`keyword\`** must be **short-tail and geography-free** (2–4 words of service intent) - strip every city, neighbourhood, province, and region token from the matrix line; **never** paste place names into \`keyword\`.`;
        if (!hint) return base;
        return `${base}
   Optional user entity focus for these rows ${hintScope}. ${outputPhrase}${multiRowNote}`;
      }

      if (laSingleSeedSap && t.sapPages > 1) {
        const base = `${i + 1}. **Single seed target (Local analysis):** "${t.keyword}". Produce exactly ${t.sapPages} SAP rows. **Every row must use the same short-tail geography-free \`keyword\`** (strip all place tokens from the seed - no location words). **Differentiate rows only** with ${singleSeedEntityDifferentiationClause(egLevel)} **Never repeat the same \`entity\` on two rows** - each row needs a **unique** (\`keyword\`, \`entity\`) pair (same keyword is OK only because every \`entity\` differs).`;
        if (!hint) return base;
        return `${base}
   Optional user entity focus for these rows ${hintScope}. ${outputPhrase}${multiRowNote}`;
      }

      if (t.sapPages <= 1) {
        const base = `${i + 1}. Target keyword: "${t.keyword}": produce exactly 1 SAP row. **SAP \`keyword\`** must be **short-tail and geography-free** (strip city, neighbourhood, province, and region tokens from the target; service intent only).`;
        if (!hint) return base;
        return `${base}
   Optional user entity focus for this row ${hintScope}. ${outputPhrase}`;
      }

      const base = `${i + 1}. **Cluster anchor (seed keyword):** "${t.keyword}". Produce exactly ${t.sapPages} SAP rows. **Each row must use a different \`keyword\` string** - same **product/service-offer** intent as the anchor, grounded in **grid keyword themes**, **seed** phrases, and **postInventoryRows** when provided — vary with distinct equipment, audience, or package angles that match real offers (no generic transactional crutches like buy/online/cost/reviews/financing/packages unless those exact words appear in inventory or grid evidence). **Do not** use review, testimonial, case-study, or "best of" comparison angles as \`keyword\` variants (see **SAP product/service focus** in the system prompt). **Do not** repeat the same keyword text on multiple rows in this cluster. **Do not** vary \`keyword\` by appending city or neighbourhood tokens - vary \`entity\` for geography (see **SAP "keyword" field** in the system prompt). **Across the full \`sapRows\` array, no two objects may share the same (\`keyword\`, \`entity\`) pair.** ${clusterAnchorDistinctEntityClause(egLevel)}`;
      if (!hint) return base;
      return `${base}
   Optional user entity focus for these rows ${hintScope}. ${outputPhrase}${multiRowNote}`;
    })
    .join("\n\n");

  const gridEntitySection = useCityEntityRules
    ? `**SAP "entity" field (mandatory):** \`entity\` is **only** a structured place label (for UI and exports). **No filler words, no prose, no prefixes.**
- **Shape:** **Two or three** comma-separated segments: (1) **hyperlocal proper name** - neighbourhood, district, named community, park, landmark, mall, civic building or complex, campus, waterfront; (2) **city** only; (3) **province/state** optional when multi-region or export clarity needs it - **not** optional as an excuse to output \`City, Province\` without segment (1). **Never** two-part \`City, Province\` (or \`City, ST\`) **without** a distinct first segment when the grid supports finer places. Street/avenue/corridor as place (no civic numbers) is a **last resort** only when no neighbourhood, district, or landmark fits.
- **First segment = proper name only:** It must **begin** with the geographic **name** (e.g. \`Millwood\`, \`Memorial Park\`, \`Arts District\`, \`Altona Community Centre\`). **Forbidden at the start of \`entity\`:** \`Near \`, \`Around \`, \`Close to \`, \`By \`, \`At \`, \`In \`, \`In the \`, or any similar conversational prefix. **Wrong:** \`Near Confederation Park, Calgary, AB\`. **Right:** \`Confederation Park, Calgary, AB\`.
- **Where to use "near":** Words like "near" or "in" belong in \`title\` (headline) if useful for SEO, **not** in \`entity\`.
- **Good examples (diverse types):** \`Millwood, Altona, MB\`; \`The Annex, Toronto, ON\`; \`Altona Community Centre, Altona, MB\`; \`River Valley Park, Edmonton, AB\`. **Priority order for the first segment:** (1) **Neighbourhood, district, or named community** from the grid's "Nearby place names" / district labels when available; (2) parks, landmarks, malls, campuses; (3) **main-street / corridor** as place **without** a street number **only** when (1) and (2) are unavailable. **Do not** pick a street-by-default when the grid names a neighbourhood or district for that area.
- **Grid cluster - use named areas from the scan (mandatory):** The grid markdown includes **Nearby place names**, POIs, corridors, and neighbourhood/district labels. **Each** SAP row must use a **distinct** first-segment **hyperlocal** name taken from that evidence (or from sample weak points / pins **inside** the footprint). **Do not** output lazy \`City, Province\` or \`City, ST\` as the **whole** \`entity\` (e.g. \`Edmonton, Alberta\`, \`Edmonton, AB\`) **when** the cluster lists **any** specific sub-city areas for that market. **Do not** reuse the **same** \`entity\` string on two rows. **Do not** use the **city name alone** as the first segment - the first segment must be a **different** proper place than the city token in segment (2).
- **Forbidden in \`entity\` (any segment):** street numbers, unit/suite lines (\`Unit 3\`, \`#200\`), full street addresses (\`16329 130 Ave NW\`), or postal codes (\`T5V 1K5\`). Part (2) must be the **city name only** (e.g. \`Edmonton\`) - never paste a full mailing address from GBP or grid pins into \`entity\`. Named corridors and **street-as-place** names are OK without civic numbers only as a last resort.`
    : buildSapEntityFieldRulesGridBroad(egLevel, entityTypeFocus);

  const manualEntitySection = useCityEntityRules
    ? `**SAP "entity" field (mandatory):** \`entity\` is **only** a structured place label (for UI and exports). **No filler words, no prose, no prefixes.**
- **Shape:** **Two or three** comma-separated segments: (1) **hyperlocal proper name** - neighbourhood, district, named community, park, landmark, mall, civic building or complex, campus, waterfront; (2) **city** only; (3) **province/state** optional when multi-region or export clarity needs it - **not** optional as an excuse to output \`City, Province\` without segment (1). **Never** two-part \`City, Province\` without a distinct first segment when hints and market allow finer places. Street/avenue/corridor as place is a **last resort**.
- **First segment = proper name only:** It must **begin** with the geographic **name** (e.g. \`Millwood\`, \`Memorial Park\`, \`Arts District\`, \`Altona Community Centre\`). **Forbidden at the start of \`entity\`:** \`Near \`, \`Around \`, \`Close to \`, \`By \`, \`At \`, \`In \`, \`In the \`, or any similar conversational prefix. **Wrong:** \`Near Confederation Park, Calgary, AB\`. **Right:** \`Confederation Park, Calgary, AB\`.
- **Where to use "near":** Words like "near" or "in" belong in \`title\` (headline) if useful for SEO, **not** in \`entity\`.
- **Good examples (diverse types):** \`Millwood, Altona, MB\`; \`The Annex, Toronto, ON\`; \`River Valley Park, Edmonton, AB\`. **Priority order:** neighbourhood or district **first** when hints/market name them; then parks and landmarks. **Do not** default to a street when a neighbourhood label fits the row.
- **No grid - avoid lazy city:** Without a rank scan, use **entity hints** and **market** to pick **distinct** sub-city area names; do **not** use \`City, Province\` alone for every row when hints name different areas. **Do not** duplicate the same \`entity\` on two rows.
- **Forbidden in \`entity\` (any segment):** street numbers, unit/suite lines, full street addresses, or postal codes. Part (2) must be the **city name only** - never paste a full mailing address from GBP into \`entity\`. Named corridors and **street-as-place** names are OK without civic numbers only as a last resort.`
    : buildSapEntityFieldRulesManualBroad(egLevel, entityTypeFocus);

  const gridFooterTail = useCityEntityRules
    ? `- **Per-target optional entity hint:** If the user message lists an "Optional user entity focus" for a target keyword, prioritize that service area for those SAP rows, subject to the grid geographic scope. Output "entity" as **hyperlocal place, city**[, **province/state** when needed]. If \`sapPages\` for that target is greater than 1, use **distinct** first segments; **prioritize neighbourhood, district, and named-community** labels from the grid, then parks and landmarks; if no hint is given for a target, choose entities from grid evidence alone.
- **"entity" label order (mandatory):** **Hyperlocal anchor first** (proper name: neighbourhood, district, landmark, park, building, campus, waterfront - **not** the city name first), **then** city, **then** province/state **when useful**. Street/avenue/corridor as place is a last resort. Do **not** output two-part "City, Province" with no finer first segment. Do **not** lead with province or country alone. Do **not** prefix the string with \`Near\`, \`Around\`, or similar (see **SAP entity field rules**).
- "entity" must be a concrete, unambiguous place string suitable for a service-area / location page; the opening segment must name a sub-city location when the grid gives any basis for one. The \`entity\` field is **data**, not a sentence.
- **Geographic scope (mandatory):** The grid data includes a "## Geographic scope (from this file)" section with centroid, bounding box, and a buffered radius in miles. Every "entity" MUST sit within that footprint. Prefer first-segment names from **neighborhood/district labels**, **Nearby place names**, and **landmarks** before any street-as-place or corridor name; use POI labels, parks, malls, campuses, and civic complexes. Do **not** paste full street addresses or postal codes from grid pins into "entity" - use **neighbourhood or district, or hyperlocal anchor + city**[, **province** when needed]. Do NOT name distant towns or regions hundreds of miles away unless that exact name appears in the grid evidence. **Do not** substitute a **regional hub** city (e.g. a core-metro name) when the grid file only evidences **suburban or corridor** names - every named place must be **traceable** to a line in the uploaded grid summary, not invented for convenience.
- **Forbidden** for "entity": city-only or province-only strings as the whole label (e.g. "Calgary, AB"); **also** \`City, Province\` where the **first segment is not** a distinct sub-city place **when** the grid lists such places; inventing far-away geography unrelated to the scan pins. Local parks and landmarks **inside** the footprint are encouraged as the first segment when relevant.
- If the user message includes **Wikipedia intros (one per entity hint)**, use them only to ground **names** and light facts about each hinted place. They do **not** replace the grid: **rank evidence, pins, and service-area geography must still come from the grid scan**. Do **not** paste long Wikipedia text into "strategyMarkdown" or row fields.
${
      entityLocation?.trim()
        ? `
- **Optional user market label:** The user provided a preferred market/area string (see user message). Prefer local place and service-area "entity" names (neighborhoods, corridors, parks, landmarks, etc.) that sit within or relate to that market when consistent with the grid footprint and evidence. Use it to disambiguate **entity** strings (e.g. include the city when helpful). If the grid scope conflicts, obey the grid.`
        : ""
    }`
    : `${buildSapEntityFooterGridBroad(egLevel)}${
        entityLocation?.trim()
          ? `

- **Optional user market label:** The user provided a preferred market/area string (see user message). Prefer place names that fit that market and the chosen geographic scope when consistent with evidence. If the grid scope conflicts, obey the grid.`
          : ""
      }`;

  const manualFooterTail = useCityEntityRules
    ? `- **Per-target optional entity hint:** If the user message lists an "Optional user entity focus" for a target keyword, prioritize that service area for those SAP rows, consistent with the stated geography. Output "entity" as **hyperlocal place, city**[, **province/state** when needed]. If \`sapPages\` for that target is greater than 1, use **distinct** first segments; **prioritize neighbourhood, district, and named-community** names, then parks and landmarks; if no hint is given for a target, choose plausible sub-city places from the market and context.
- **"entity" label order (mandatory):** **Hyperlocal anchor first** (proper name: neighbourhood, district, landmark, park, building, campus, waterfront - **not** the city name first), **then** city, **then** province/state **when useful**. Street/avenue/corridor as place is a last resort. Do **not** output two-part "City, Province" with no finer first segment. Do **not** lead with province or country alone. Do **not** prefix the string with \`Near\`, \`Around\`, or similar (see **SAP entity field rules**).
- "entity" must be a concrete, unambiguous place string suitable for a service-area / location page; the opening segment must name a sub-city location when the stated geography allows. The \`entity\` field is **data**, not a sentence.
- **Geographic scope (manual mode):** There is no grid footprint. Use the optional market label, per-target entity hints, and Wikipedia intros to ground geography. Pick plausible sub-city places within the implied metro or region; do **not** name distant cities or regions far from the user's stated geography unless the hint explicitly names them.
- **Forbidden** for "entity": city-only or province-only strings as the whole label (e.g. "Calgary, AB"); **also** \`City, Province\` where the first segment is not a distinct sub-city place **when** hints or market allow finer areas; inventing far-away geography unrelated to the user's hints. Local parks and landmarks in the implied market are encouraged as the first segment when relevant.
- If the user message includes **Wikipedia intros (one per entity hint)**, use them only to ground **names** and light facts about each hinted place. They do **not** replace the need for sensible local geography. Do **not** paste long Wikipedia text into "strategyMarkdown" or row fields.
${
      entityLocation?.trim()
        ? `
- **Optional user market label:** The user provided a preferred market/area string (see user message). Prefer local place and service-area "entity" names (neighborhoods, corridors, parks, landmarks, etc.) that sit within or relate to that market. Use it to disambiguate **entity** strings (e.g. include the city when helpful).`
        : ""
    }`
    : `${buildSapEntityFooterManualBroad(egLevel)}${
        entityLocation?.trim()
          ? `

- **Optional user market label:** The user provided a preferred market/area string (see user message). Prefer place names that fit that market and the chosen geographic scope.`
          : ""
      }`;

  const sapProductServiceFocusBlock = `- **SAP product/service focus (mandatory):** Each row is a **commercial service or product** location page — what the business offers in that area. **Do not** frame \`keyword\` as **reviews**, **ratings**, **testimonials**, **case studies**, **success stories**, **client stories**, **portfolio** as the lead intent, editorial **best-of** roundups, or **vs** competitor comparison pages. If a target, grid line, or seed contains those words, **omit them** and keep the **core offer** phrase (still geography-free in \`keyword\`; see **SAP "keyword" field**). **Examples:** use "luxury glamping tents" not "luxury glamping tent reviews"; "event tent rental" not "event tent rental case studies".`;

  const masterRulesSapKeywordRecap = hasMasterInstructions(siteId ?? null)
    ? `\n${buildSapMasterRulesKeywordMixRecap(siteId ?? null)}\n`
    : "";

  const gridSystemPrompt = `${sapMasterPrefix}You are a local SEO analyst interpreting a Local Dominator–style rank grid. Output ONLY valid JSON with keys strategyMarkdown, keywordStrategyMarkdown, questionsByKeyword, sapRows (exactly ${targetSapCount} row objects: keyword, entity, title, modifier, featuredImage).

${inventorySystemBlock}${gridEntitySection}

**keyword field (mandatory):** 2–4 words, service intent, **no geography** (all places in entity).
${sapProductServiceFocusBlock}${masterRulesSapKeywordRecap}
- **Forbidden in \`keyword\`:** Any neighbourhood, district, city, province, landmark, ravine, valley, or **any word that appears in that row's \`entity\`** (including the hyperlocal first segment and city). Do **not** append "Near [Place]", "[Place] Edmonton", "Central [City]", or similar to differentiate rows.
- **No duplicate (\`keyword\`, \`entity\`) rows (mandatory):** Across **all** \`sapRows\`, **each** row must be **unique** on the pair **(\`keyword\`, \`entity\`)** - the same two strings must **not** appear on two objects. Before you finish, **scan the full array**: if any pair repeats, fix it by giving one row a **different \`entity\`** (different first segment / area name) or, when multi-keyword mode applies, a **different \`keyword\`**. Repeating the same neighbourhood or corridor label on two rows is invalid.
${
  laSingleSeedSap
    ? `- **Local analysis - single target:** When \`sapPages\` > 1 for the only keyword target, **reuse the same geography-free short-tail \`keyword\` on every row** (strip place tokens from the seed). **Differentiate rows only** with **distinct \`entity\` values** - neighbourhood- or district-scale first segments within the main market (grid **Nearby place names**, POIs, weak-rank samples). **Every \`entity\` must be different** - **never** use the same \`entity\` string twice; that duplicates (\`keyword\`, \`entity\`) and fails validation. **Do not** use different service-intent \`keyword\` strings per row.`
    : `- **Multi-row clusters:** When \`sapPages\` > 1, vary rows by **non-geographic** product or service **nouns and modifiers** that stay in the same vertical (e.g. different equipment types, audience, or use-case words) — **not** transactional crutches like **buy / online / cost / installation / packages / financing / near me** unless those exact tokens appear in the user's WordPress inventory JSON. **Never** use review, testimonial, case-study, or comparison-hub angles to differentiate \`keyword\` (see **SAP product/service focus**). **Never** use place names to make keywords distinct - vary \`entity\` for geography instead.`
}
${proposalMatrixSapKeywordSupplement}

${sapTitleOmitBlock}

For "strategyMarkdown", cover these topics **only as bullets** (no paragraph blocks):
- Bullets summarizing what the grid shows per tracked keyword (weak vs strong areas, patterns).
- Under each target keyword (heading or bullet group), bullets naming which **areas/entities** you prioritized and **why**, citing the grid (ranks, sample weak points, geography) - not generic SEO advice.
- Bullets tying the **sapRows** to concrete gaps or opportunities visible in the sheet.

Rules:
- **JSON validity (mandatory):** The entire response must parse with JSON.parse. Inside every string value, escape double quotes as \\" and newlines as \\n. Do not place unescaped double-quote characters inside strategyMarkdown, keywordStrategyMarkdown, titles, or any string field (use 'single quotes' for quoted terms if needed).
- **Unique pairs - you must comply in the model output:** **Never** emit two \`sapRows\` objects with the **same** \`keyword\` **and** \`same** \`entity\`. The server keeps your \`keyword\` strings as authored (whitespace normalization only) — write each \`keyword\` so the pair stays unique without relying on server-side rewriting.
- Do NOT include any field named recommendedSapCount, pageCount, or suggested number of pages. Do NOT output a separate count.
- **questionsByKeyword** must align with **keywordStrategyMarkdown** (same strings per keyword). Keys must match user target keywords exactly.
- The length of "sapRows" MUST be exactly ${targetSapCount}.
${
  proposalKeywordMode
    ? `- The user gave explicit keyword targets with counts from the Content Opportunity Matrix. You MUST allocate rows exactly as specified. **Each row's \`keyword\` must be short-tail and geography-free** (strip place names from the matrix line; see **SAP "keyword" field**).
- Choose **entities** (and keyword assignment per row) that directly address weaker or strategic points visible in the grid summary (use the sample points and per-keyword stats).`
    : laSingleSeedSap
      ? `- **sapRows order (mandatory):** emit all rows for the single target in order. Row count must equal that target's \`sapPages\`; the sum must equal ${targetSapCount}.
- **Single-target keyword rule:** Every SAP row must use the **same geography-free short-tail \`keyword\`** (strip place tokens from the seed). **Do not** vary \`keyword\` between rows. **Vary only \`entity\`** - distinct neighbourhood- or finer-scale areas within the main market (optional entity hint + grid evidence).
- Choose **entities** that align with weaker or strategic points visible in the grid summary.`
      : `- **sapRows order (mandatory):** emit rows in **target list order** - all rows for target 1 (in order), then target 2, etc. Row counts per target must match each target's \`sapPages\`; the sum must equal ${targetSapCount}.
- **Keywords per cluster:** For each target, produce exactly \`sapPages\` rows. When \`sapPages\` is 1, that row's \`keyword\` must match the target string exactly (geography-free). When \`sapPages\` is greater than 1, **each row in that cluster must use a different \`keyword\` string** - same **product/service-offer** intent as the anchor, grounded in **grid keyword themes**, **seed** phrases, or **non-geographic** offer modifiers only; **never** use review, testimonial, or case-study angles (see **SAP product/service focus**); **never** duplicate the same keyword text on two rows in the cluster; **never** put place names from \`entity\` into \`keyword\`.
- Choose **entities** (and keyword assignment per row) that directly address weaker or strategic points visible in the grid summary (use the sample points and per-keyword stats).`
}
${gridFooterTail}`;

  const manualSystemPrompt = `${sapMasterPrefix}You are a local SEO analyst. The user did not upload a rank grid. Output ONLY valid JSON with keys strategyMarkdown, keywordStrategyMarkdown, questionsByKeyword, sapRows (exactly ${targetSapCount} row objects: keyword, entity, title, modifier, featuredImage).

${inventorySystemBlock}${manualEntitySection}

**keyword field (mandatory):** 2–4 words, service intent, **no geography** (all places in entity).
${sapProductServiceFocusBlock}${masterRulesSapKeywordRecap}
- **Forbidden in \`keyword\`:** Any neighbourhood, district, city, province, landmark, ravine, valley, or **any word that appears in that row's \`entity\`** (including the hyperlocal first segment and city). Do **not** append "Near [Place]", "[Place] Edmonton", "Central [City]", or similar to differentiate rows.
- **No duplicate (\`keyword\`, \`entity\`) rows (mandatory):** Across **all** \`sapRows\`, **each** row must be **unique** on the pair **(\`keyword\`, \`entity\`)** - the same two strings must **not** appear on two objects. Before you finish, **scan the full array**: if any pair repeats, fix it by giving one row a **different \`entity\`** (different first segment / area name) or, when multi-keyword mode applies, a **different \`keyword\`**. Repeating the same neighbourhood or corridor label on two rows is invalid.
${
  laSingleSeedSap
    ? `- **Local analysis - single target:** When \`sapPages\` > 1 for the only keyword target, **reuse the same geography-free short-tail \`keyword\` on every row** (strip place tokens from the seed). **Differentiate rows only** with **distinct \`entity\` values** - neighbourhood- or district-scale first segments within the main market (entity hints + optional market label). **Every \`entity\` must be different** - **never** use the same \`entity\` string twice; that duplicates (\`keyword\`, \`entity\`) and fails validation. **Do not** use different service-intent \`keyword\` strings per row.`
    : `- **Multi-row clusters:** When \`sapPages\` > 1, vary rows by **non-geographic** product or service **nouns and modifiers** in the same vertical — **not** transactional crutches like **buy / online / cost / installation / packages / financing / near me** unless those exact tokens appear in the user's WordPress inventory JSON. **Never** use review, testimonial, case-study, or comparison-hub angles to differentiate \`keyword\` (see **SAP product/service focus**). **Never** use place names to make keywords distinct - vary \`entity\` for geography instead.`
}
${proposalMatrixSapKeywordSupplement}

${sapTitleOmitBlock}

For "strategyMarkdown", cover these topics **only as bullets** (no paragraph blocks):
- Bullets summarizing how each target keyword aligns with the user's stated geography (hints + market when present).
- Under each target keyword (heading or bullet group), bullets naming which **areas/entities** you prioritized and **why**, citing hints and market fit - not generic SEO advice.
- Bullets tying the **sapRows** to concrete service-area choices implied by the hints and market (no invented rank claims).

Rules:
- **JSON validity (mandatory):** The entire response must parse with JSON.parse. Inside every string value, escape double quotes as \\" and newlines as \\n. Do not place unescaped double-quote characters inside strategyMarkdown, keywordStrategyMarkdown, titles, or any string field (use 'single quotes' for quoted terms if needed).
- **Unique pairs - you must comply in the model output:** **Never** emit two \`sapRows\` objects with the **same** \`keyword\` **and** \`same** \`entity\`. The server keeps your \`keyword\` strings as authored (whitespace normalization only) — write each \`keyword\` so the pair stays unique without relying on server-side rewriting.
- Do NOT include any field named recommendedSapCount, pageCount, or suggested number of pages. Do NOT output a separate count.
- **questionsByKeyword** must align with **keywordStrategyMarkdown** (same strings per keyword). Keys must match user target keywords exactly.
- The length of "sapRows" MUST be exactly ${targetSapCount}.
${
  proposalKeywordMode
    ? `- The user gave explicit keyword targets with counts from the Content Opportunity Matrix. You MUST allocate rows exactly as specified. **Each row's \`keyword\` must be short-tail and geography-free** (strip place names from the matrix line; see **SAP "keyword" field**).
- Choose **entities** (and keyword assignment per row) that fit the user's entity hints and market; use plausible sub-city place names - do **not** infer rank weaknesses (no grid data).`
    : laSingleSeedSap
      ? `- **sapRows order (mandatory):** emit all rows for the single target in order. Row count must equal that target's \`sapPages\`; the sum must equal ${targetSapCount}.
- **Single-target keyword rule:** Every SAP row must use the **same geography-free short-tail \`keyword\`** (strip place tokens from the seed). **Do not** vary \`keyword\` between rows. **Vary only \`entity\`** - distinct neighbourhood- or finer-scale areas within the main market (hints + optional market label).
- Choose **entities** that fit the user's entity hints and market.`
      : `- **sapRows order (mandatory):** emit rows in **target list order** - all rows for target 1 (in order), then target 2, etc. Row counts per target must match each target's \`sapPages\`; the sum must equal ${targetSapCount}.
- **Keywords per cluster:** For each target, produce exactly \`sapPages\` rows. When \`sapPages\` is 1, that row's \`keyword\` must match the target string exactly (geography-free). When \`sapPages\` is greater than 1, **each row in that cluster must use a different \`keyword\` string** - same **product/service-offer** intent as the anchor, grounded in **seed** phrases or **non-geographic** offer modifiers only; **never** use review, testimonial, or case-study angles (see **SAP product/service focus**); **never** duplicate the same keyword text on two rows in the cluster; **never** put place names from \`entity\` into \`keyword\`.
- Choose **entities** (and keyword assignment per row) that fit the user's entity hints and market; use plausible sub-city place names - do **not** infer rank weaknesses (no grid data).`
}
${manualFooterTail}`;

  const systemPrompt = appendMasterInstructionsToSystemPrompt(
    manual ? manualSystemPrompt : gridSystemPrompt,
    siteId ?? null,
  );

  const optionalLocationBlock =
    entityLocation?.trim() && manual
      ? `--- Optional user-provided entity location (market) ---
The user wants SAP "entity" values to align with this market: "${entityLocation.trim()}"
Prefer sub-city locations (neighborhoods, corridors, parks, landmarks, districts) within or clearly associated with this label. There is no grid footprint - choose plausible geography consistent with this market.

`
      : entityLocation?.trim()
        ? `--- Optional user-provided entity location (market) ---
The user wants SAP "entity" values to align with this market when consistent with the grid geographic scope: "${entityLocation.trim()}"
Prefer sub-city locations (neighborhoods, corridors, parks, landmarks, districts) within or clearly associated with this label. Still obey the grid bounds and evidence above.

`
        : "";

  const uniqueEntityHints = [
    ...new Set(
      keywordTargets
        .map((t) => t.entityHint?.trim())
        .filter((h): h is string => typeof h === "string" && h.length > 0)
    ),
  ];

  const clienteTrim = (clientAudienceContextMarkdown ?? "").trim();
  const clienteBlock = clienteTrim.length > 0 ? `\n${clienteTrim}\n` : "";

  let wikipediaClustersBlock = "";
  if (uniqueEntityHints.length > 0) {
    const wikiOpts: Parameters<typeof fetchWikipediaClustersForSapEntityHints>[1] = {
      siteId,
      wikipediaSearchAugment,
      onWikiProgress,
      ...(effectiveWikiPreferredTitles.length ? { preferredTitles: effectiveWikiPreferredTitles } : {}),
      ...(gridPlaceWeightsForWiki?.length ? { gridPlaceWeights: gridPlaceWeightsForWiki } : {}),
    };
    const clusters = await fetchWikipediaClustersForSapEntityHints(uniqueEntityHints, wikiOpts);
    if (clusters.length > 0) {
      wikipediaClustersBlock = `--- Wikipedia intros (one block per distinct entity hint; shared by all rows using that hint - do not request full articles again per row) ---

${clusters
  .map(
    (c) =>
      `**User entity hint:** "${c.entityHint}"
**Article:** ${c.title}
**URL:** ${c.url}
**Intro:** ${c.extract || "(no extract available)"}
`
  )
  .join("\n")}
`;
    }
  }

  const evidenceBlock = supplementalUserEvidenceMarkdown?.trim()
    ? `\n\n--- Organic competitor analysis (reference for entities and titles; not a rank-grid CSV) ---\n\n${supplementalUserEvidenceMarkdown.trim()}`
    : "";

  const proposalMatrixUserBlock =
    proposalKeywordMode === true
      ? `--- Proposal: Content Opportunity Matrix (intent anchor) ---
Each target line below comes from the competitor report **Content Opportunity Matrix** (bulk columns \`keyword\` / \`title\`, or legacy Anchor Demand / What to Produce). **SAP \`keyword\` must be a short-tail, geography-free service phrase** derived from that line (strip city, neighbourhood, province, region). Do **not** use organic competitor or GSC phrases as SAP \`keyword\` values - those blocks are for context and entities only.

`
      : "";

  const clusterKeywordUserNote =
    proposalKeywordMode === true
      ? ""
      : laSingleSeedSap
        ? `

**Single target (Local analysis):** When \`sapPages\` > 1, **reuse the same geography-free short-tail \`keyword\` on every row** (strip place tokens from the seed). **Differentiate rows only** with **distinct \`entity\` values** - neighbourhood- or district-scale first segments within the main market. **Do not** output different \`keyword\` strings per row. **With grid data:** ground **\`entity\`** in **distinct** first-segment names from the scan (not the same \`City, Province\` twice).
`
        : `

**Multi-row clusters:** When a target has \`sapPages\` greater than 1, output **different \`keyword\` strings per row** in that cluster (same **product/service-offer** intent as the anchor), using **non-geographic** grid/seed variations (offer angles, not place names) — **not** reviews, case studies, or testimonials as \`keyword\` variants (see system prompt). **Do not** repeat the same keyword text on every row while varying \`entity\` only. **With grid data:** also vary **\`entity\`** across rows using **distinct** first-segment names from the scan (not the same \`City, Province\` twice).
`;

  const userPrompt = `Site: ${siteName}${siteUrl ? `\nSite URL: ${siteUrl}` : ""}

Total SAP rows to output: ${targetSapCount} (fixed by the user, not by you).
${wpInventoryUserBlock}${proposalMatrixUserBlock}${optionalLocationBlock}--- User target keywords (counts are mandatory) ---
${targetsBlock}${clusterKeywordUserNote}
${clienteBlock}
For every SAP row: (1) \`keyword\` must be **geography-free** **product/service-offer** intent (see system prompt; **no** lead framing as reviews, case studies, or testimonials): **no** city, neighbourhood, or other tokens copied from that row's \`entity\`. **Never** make \`keyword\` only a district, strip, or corridor name plus a city—always include a **service / product / rental** term so the phrase is a real search query. (2) \`entity\` must be a **raw place label only** - **two or three** comma segments (**hyperlocal anchor**, **city**, optional **province/state**), **starting with the place proper name** (e.g. \`Whyte Avenue, Edmonton\` or \`Confederation Park, Calgary, AB\`). **Never** put \`Near \`, \`Around \`, or similar at the start of \`entity\`. **Never** put street numbers, unit/suite lines, full street addresses, or postal codes in \`entity\` - the city segment is the **city name** only (e.g. Edmonton).${
    manual
      ? ""
      : ` **With grid data (below):** each row's first segment must be a **distinct** named sub-city area from the scan (**Nearby place names**, POIs, corridors, weak-rank samples) - **not** a shortcut \`City, Province\` / \`City, ST\` when the cluster lists specific areas. **Do not** reuse the same \`entity\` on two rows.`
  } (3) Set \`title\` to \`""\` on every row (Gemini title agent runs after entity generation).

${wikiPoolEntityBlock}${wikipediaClustersBlock}${
    manual
      ? `--- Manual mode (no grid CSV) ---

No rank grid or pin data. Ground entities in the user's targets, optional entity hints, optional market label, and Wikipedia blocks above. Do not claim rank positions, weak grid points, or geographic patterns from a scan you did not receive.

`
      : `--- Grid data (Local Dominator–style scan) - use this as the ONLY evidence for why you pick locations ---

${gridSummaryMarkdown}`
  }${evidenceBlock}`;
  return {
    systemPrompt,
    userPrompt,
    rowSeeds,
    laSingleSeedSap,
    hasWpInventoryForPrompt,
  };
}
