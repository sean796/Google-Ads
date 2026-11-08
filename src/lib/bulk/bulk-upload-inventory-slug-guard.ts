import type { WordPressSite } from "@/components/integrations/types";
import type { SiteInventoryBulkRow } from "@/lib/wordpress-api/types";
import { sanitizeWordPressSlugSegment } from "@/lib/pulse-redirect-redirect-csv";
import { isWordPressNumberedSlugDuplicate } from "@/lib/sitemap-optimizer/wordpress-numbered-slug-duplicate";
import { urlPathTail } from "@/lib/sitemap-optimizer/build-cluster-catalog-payload";
import {
  buildPostCreatorInventoryCatalog,
  type PostCreatorInventoryCatalog,
} from "@/lib/post-creator/post-creator-cannibalization-tools";

export type UploadSlugConflict = {
  slug: string;
  reason: string;
  existingUrl?: string;
  existingPostId?: number;
};

export function findInventoryRowForSlug(
  rows: SiteInventoryBulkRow[],
  slug: string,
): SiteInventoryBulkRow | undefined {
  const want = sanitizeWordPressSlugSegment(slug.trim());
  if (!want) return undefined;
  return rows.find((row) => {
    const rowSlug = sanitizeWordPressSlugSegment(row.slug?.trim() ?? "");
    if (rowSlug === want) return true;
    return sanitizeWordPressSlugSegment(urlPathTail(row.url ?? "")) === want;
  });
}

export function buildInventoryCatalogFromBulkRows(
  rows: SiteInventoryBulkRow[],
): PostCreatorInventoryCatalog {
  const urls: string[] = [];
  const richRows: Array<{ url?: string; fields?: { keyword?: string; title?: string } }> = [];
  for (const row of rows) {
    const url = row.url?.trim();
    if (!url) continue;
    urls.push(url);
    richRows.push({
      url,
      fields: {
        title: row.fields?.title,
        keyword: row.fields?.keyword,
      },
    });
  }
  const catalog = buildPostCreatorInventoryCatalog(urls, richRows);
  const slugKeys = new Set(catalog.slugKeys);
  for (const row of rows) {
    const slug = sanitizeWordPressSlugSegment(row.slug?.trim() ?? "");
    if (slug) slugKeys.add(slug);
  }
  return { ...catalog, slugKeys };
}

export function findUploadSlugConflict(args: {
  site: WordPressSite;
  slug: string;
  inventoryRows: SiteInventoryBulkRow[];
  reservedSlugs?: Set<string>;
}): UploadSlugConflict | null {
  const slug = sanitizeWordPressSlugSegment(args.slug.trim());
  if (!slug) return null;

  if (args.reservedSlugs?.has(slug)) {
    return {
      slug,
      reason: "Duplicate slug in this run",
    };
  }

  const catalog = buildInventoryCatalogFromBulkRows(args.inventoryRows);
  const inventoryMatch = findInventoryRowForSlug(args.inventoryRows, slug);
  const existingPostId =
    inventoryMatch?.id != null && inventoryMatch.id > 0 ? inventoryMatch.id : undefined;
  if (catalog.slugKeys.has(slug)) {
    const match = catalog.rows.find((row) => row.slug === slug);
    return {
      slug,
      reason: "Slug already exists on site (published or scheduled)",
      existingUrl: match?.url ?? inventoryMatch?.url,
      existingPostId,
    };
  }

  const base = args.site.siteUrl?.replace(/\/+$/, "") ?? "";
  if (base) {
    for (const candidate of [`${base}/${slug}`, `${base}/${slug}/`]) {
      const key = candidate.toLowerCase().replace(/\/+$/, "");
      if (catalog.urlKeys.has(key) || catalog.urlKeys.has(`${key}/`)) {
        return {
          slug,
          reason: "URL already exists on site (published or scheduled)",
          existingUrl: candidate,
          existingPostId,
        };
      }
    }
  }

  return null;
}

export function assertWordPressCreateKeptSlug(requestedSlug: string, link: string | undefined): void {
  const requested = sanitizeWordPressSlugSegment(requestedSlug.trim());
  if (!requested || !link?.trim()) return;
  const got = sanitizeWordPressSlugSegment(urlPathTail(link));
  if (!got || got === requested) return;
  if (got.startsWith(`${requested}-`) && isWordPressNumberedSlugDuplicate(link)) {
    throw new Error(
      `WordPress assigned numbered slug /${got} instead of /${requested}. Restore or permanently delete the original in trash, then Play again.`,
    );
  }
}

export function reserveUploadSlug(
  reservedBySite: Map<string, Set<string>>,
  siteId: string,
  slug: string,
): void {
  const normalized = sanitizeWordPressSlugSegment(slug.trim());
  if (!normalized) return;
  let set = reservedBySite.get(siteId);
  if (!set) {
    set = new Set<string>();
    reservedBySite.set(siteId, set);
  }
  set.add(normalized);
}
