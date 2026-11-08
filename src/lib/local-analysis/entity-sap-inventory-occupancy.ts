import { normalizeEntityHintCommaLabel } from "@/lib/comma-place-label";
import { keywordUniquenessKey } from "@/lib/local-analysis-fill-keywords-from-wp-inventory";
import {
  sapKeywordFromShortBaseAndEntity,
} from "@/lib/local-analysis/entity-sap-row-keyword-fill";
import { resolveEntitySapTitleFromTemplate } from "@/lib/local-analysis/entity-sap-title-agent";
import { filterSapInventoryRows } from "@/lib/local-analysis/entity-generator-keyword-inventory";
import { sanitizeWordPressSlugSegment } from "@/lib/pulse-redirect-redirect-csv";
import { buildSapSlugFromKeywordEntity } from "@/lib/sap-slug-from-keyword-entity";
import type { SiteInventoryBulkRow } from "@/lib/wordpress-api/types";
import { isOffensiveGscQuery } from "@/lib/gsc-offensive-word-blocklist";
/** Uniqueness key for a full entity focus keyword (keyword + entity → slug). */
export function entityKeywordPairKey(keyword: string, entity: string): string {
  const ent = normalizeEntityHintCommaLabel(entity.trim());
  const kw = keyword.trim();
  if (!ent || !kw) return "";
  const slug = buildSapSlugFromKeywordEntity(kw, ent);
  return slug || `${keywordUniquenessKey(kw)}::${ent.toLowerCase()}`;
}

export function pickGscKeywordForEntityRow(args: {
  entity: string;
  gscKeywords: readonly string[];
  gridLocations: readonly string[];
  usedInGroup: Set<string>;
  occupancy: EntitySapOccupancy;
  reservedInGroup: Set<string>;
  titleTemplate?: string;
  skipInventoryCollision?: boolean;
}): string | null {
  for (const base of args.gscKeywords) {
    const trimmed = base.trim();
    if (!trimmed || isOffensiveGscQuery(trimmed)) continue;
    const keyword = sapKeywordFromShortBaseAndEntity(trimmed, args.entity, args.gridLocations);
    if (!keyword || isOffensiveGscQuery(keyword)) continue;
    const pairKey = entityKeywordPairKey(keyword, args.entity);
    if (!pairKey || args.usedInGroup.has(pairKey)) continue;
    if (!args.skipInventoryCollision) {
      const collision = findEntitySapRowCollision(
        { keyword, entity: args.entity, titleTemplate: args.titleTemplate },
        args.occupancy,
        args.reservedInGroup,
      );
      if (collision) continue;
    }
    return keyword;
  }
  return null;
}

export type EntitySapExistingPage = {
  slug: string;
  title: string;
  keyword: string;
  entity: string;
  url: string;
};

export type EntitySapOccupancy = {
  slugKeys: Set<string>;
  byEntity: Map<string, EntitySapExistingPage[]>;
};

export type EntitySapRowCollision = {
  kind: "slug" | "keyword" | "title";
  existing: EntitySapExistingPage;
};

export type EntitySapBlockedForEntity = {
  slugs: string[];
  keywords: string[];
  titles: string[];
  existingPages: EntitySapExistingPage[];
};

export function normalizeTitleKey(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export function entityKey(entity: string): string {
  return normalizeEntityHintCommaLabel(entity.trim()).toLowerCase();
}

function slugFromUrl(url: string): string {
  try {
    const path = new URL(url.trim()).pathname.replace(/\/+$/, "");
    const parts = path.split("/").filter(Boolean);
    return sanitizeWordPressSlugSegment(parts[parts.length - 1] ?? "");
  } catch {
    return "";
  }
}

function keywordFromInventoryRow(row: SiteInventoryBulkRow): string {
  const acf =
    row.acf && typeof row.acf === "object" ? (row.acf as Record<string, unknown>) : {};
  const fromAcf = typeof acf.keyword_focus === "string" ? acf.keyword_focus.trim() : "";
  return fromAcf || (row.fields?.keyword ?? "").trim();
}

/** Parse entity place from SAP title pattern "{service} Near {entity}". */
export function parseEntityFromSapTitle(title: string): string | null {
  const m = title.trim().match(/\bnear\s+(.+)$/i);
  if (!m?.[1]) return null;
  const parsed = normalizeEntityHintCommaLabel(m[1].trim());
  return parsed || null;
}

function inventoryRowToExistingPage(row: SiteInventoryBulkRow): EntitySapExistingPage | null {
  const url = row.url?.trim();
  if (!url) return null;
  const title = (row.fields?.title ?? "").trim();
  const keyword = keywordFromInventoryRow(row);
  const slug = sanitizeWordPressSlugSegment(row.slug?.trim() ?? "") || slugFromUrl(url);
  const entity =
    parseEntityFromSapTitle(title) ||
    (keyword ? null : null);
  if (!entity) return null;
  return { slug, title, keyword, entity, url };
}

export function buildEntitySapOccupancy(rows: SiteInventoryBulkRow[]): EntitySapOccupancy {
  const slugKeys = new Set<string>();
  const byEntity = new Map<string, EntitySapExistingPage[]>();
  for (const row of filterSapInventoryRows(rows)) {
    const page = inventoryRowToExistingPage(row);
    if (!page) continue;
    if (page.slug) slugKeys.add(page.slug);
    const key = entityKey(page.entity);
    const list = byEntity.get(key) ?? [];
    list.push(page);
    byEntity.set(key, list);
  }
  return { slugKeys, byEntity };
}

export function collectBlockedForEntity(
  occupancy: EntitySapOccupancy,
  entity: string,
): EntitySapBlockedForEntity {
  const pages = occupancy.byEntity.get(entityKey(entity)) ?? [];
  const slugs = new Set<string>();
  const keywords = new Set<string>();
  const titles = new Set<string>();
  for (const page of pages) {
    if (page.slug) slugs.add(page.slug);
    const kwKey = keywordUniquenessKey(page.keyword);
    if (kwKey) keywords.add(kwKey);
    const titleKey = normalizeTitleKey(page.title);
    if (titleKey) titles.add(titleKey);
  }
  return {
    slugs: [...slugs],
    keywords: [...keywords],
    titles: [...titles],
    existingPages: pages,
  };
}

export function predictedEntitySapTitle(
  keyword: string,
  entity: string,
  titleTemplate?: string,
): string {
  return resolveEntitySapTitleFromTemplate(keyword, entity, titleTemplate);
}

export function findEntitySapRowCollision(
  row: {
    keyword: string;
    entity: string;
    title?: string;
    titleTemplate?: string;
  },
  occupancy: EntitySapOccupancy,
  reservedSlugsInRun?: Set<string>,
): EntitySapRowCollision | null {
  const entity = normalizeEntityHintCommaLabel(row.entity.trim());
  const keyword = row.keyword.trim();
  if (!entity || !keyword) return null;

  const slug = buildSapSlugFromKeywordEntity(keyword, entity);
  const kwKey = keywordUniquenessKey(keyword);
  const title =
    row.title?.trim() ||
    predictedEntitySapTitle(keyword, entity, row.titleTemplate);
  const titleKey = normalizeTitleKey(title);
  const entKey = entityKey(entity);
  const existingForEntity = occupancy.byEntity.get(entKey) ?? [];

  if (slug && (occupancy.slugKeys.has(slug) || reservedSlugsInRun?.has(slug))) {
    const existing =
      existingForEntity.find((p) => p.slug === slug) ??
      ({ slug, title: "", keyword: "", entity, url: "" } as EntitySapExistingPage);
    return { kind: "slug", existing };
  }

  for (const page of existingForEntity) {
    if (kwKey && keywordUniquenessKey(page.keyword) === kwKey) {
      return { kind: "keyword", existing: page };
    }
    if (titleKey && normalizeTitleKey(page.title) === titleKey) {
      return { kind: "title", existing: page };
    }
  }

  return null;
}

export function reserveEntitySapSlug(
  reservedSlugsInRun: Set<string>,
  keyword: string,
  entity: string,
): void {
  const slug = buildSapSlugFromKeywordEntity(keyword, entity);
  if (slug) reservedSlugsInRun.add(slug);
}
