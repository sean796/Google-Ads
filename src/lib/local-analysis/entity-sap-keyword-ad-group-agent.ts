import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import { keywordUniquenessKey } from "@/lib/local-analysis-fill-keywords-from-wp-inventory";
import type { EntityAdGroupSection } from "@/lib/local-analysis/sap-entity-ad-groups";
import { stripTradingNameFromPhrase } from "@/lib/sap-brand-and-brevity";
import {
  collectBlockedForEntity,
  entityKeywordPairKey,
  findEntitySapRowCollision,
  reserveEntitySapSlug,
  type EntitySapOccupancy,
} from "@/lib/local-analysis/entity-sap-inventory-collision";
import {
  composeServiceKeywordWithAdGroupEntity,
  keywordPlaceSuffixFromEntity,
  normalizeSapKeywordWithPlaceSuffix,
  sapKeywordFromShortBaseAndEntity,
} from "@/lib/local-analysis/entity-sap-keyword-place-tokens";
import {
  buildEntitySapKeywordPickSystemPrompt,
  buildEntitySapKeywordPickUserPayload,
  isRejectedEntitySapKeywordSync,
  padGscProductBasesFromCandidates,
  postOpenRouter,
} from "@/lib/local-analysis/entity-sap-keyword-pick-prompts";

export function applyKeywordFillsToSapRows(rows: CSVRow[], fills: Map<number, string>): CSVRow[] {
  return rows.map((row, i) => ({ ...row, keyword: fills.get(i) ?? row.keyword ?? "" }));
}

type GroupRowRequest = {
  localRowIndex: number;
  globalRowIndex: number;
  seedKeyword: string;
};

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
export async function runEntityAdGroupKeywordSubAgent(args: {
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
