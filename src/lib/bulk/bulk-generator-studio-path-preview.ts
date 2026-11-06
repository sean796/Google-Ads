import type { WordPressSite } from "@/components/integrations/types";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";
import {
  overviewEntityRestCollectionForSite,
  type OverviewSitemapSource,
} from "@/lib/overview/overview-sitemap-source";
import { rowHasUploadEntity } from "@/lib/bulk/bulk-sitemap-mode";
import { buildSapSlugFromKeywordEntity } from "@/lib/sap-slug-from-keyword-entity";
function bulkCsvRowIsEntityPath(row: CSVRow): boolean {
  if (row.sitemap_type === "entity") return true;
  if (row.sitemap_type === "post") return false;
  return rowHasUploadEntity(row.entity);
}

export type BulkSapPathResolveResult =
  | { ok: true; pathLabel: string; fullUrlPreview: string }
  | { ok: false; reason: "missing_entity_collection" };

export type BulkGeneratorPathPreviewContext = {
  /** Left dock: Posts / Pages / SAP drives relative path shape in the studio list. */
  sitemapSource?: OverviewSitemapSource;
  site?: Pick<WordPressSite, "entitySitemapUrl" | "manualEndpoint" | "sitemaps" | "siteUrl"> | null;
  sapInventoryRows?: ReadonlyArray<Pick<OverviewInventoryRow, "url" | "slug">>;
};

function normalizeSlugMatchKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
}

function pathnameFromPublicUrl(url: string): string {
  const u = new URL(url);
  const path = u.pathname || "/";
  return path.endsWith("/") ? path : `${path}/`;
}

function matchSapInventoryPathname(
  slugSegment: string,
  rows?: ReadonlyArray<Pick<OverviewInventoryRow, "url" | "slug">>,
): string | null {
  const norm = normalizeSlugMatchKey(slugSegment);
  if (!norm || !rows?.length) return null;
  for (const row of rows) {
    const rowSlug = row.slug?.trim();
    if (rowSlug && normalizeSlugMatchKey(rowSlug) === norm) {
      try {
        return pathnameFromPublicUrl(row.url);
      } catch {
        continue;
      }
    }
    try {
      const last = new URL(row.url).pathname.split("/").filter(Boolean).pop();
      if (last && normalizeSlugMatchKey(last) === norm) {
        return pathnameFromPublicUrl(row.url);
      }
    } catch {
      continue;
    }
  }
  return null;
}

/** SAP public path: warm inventory URL first, else /{entityCollection}/{slug}/ from Integrations. */
export function resolveBulkSapPublicPath(input: {
  site: Pick<WordPressSite, "entitySitemapUrl" | "manualEndpoint" | "sitemaps" | "siteUrl"> | null | undefined;
  slugSegment: string;
  siteBaseUrl: string | null;
  sapInventoryRows?: ReadonlyArray<Pick<OverviewInventoryRow, "url" | "slug">>;
}): BulkSapPathResolveResult {
  const slugRaw = input.slugSegment.trim().replace(/^\/+|\/+$/g, "");
  if (!slugRaw) {
    return { ok: true, pathLabel: "/…/", fullUrlPreview: input.siteBaseUrl ? `${input.siteBaseUrl}/…/` : "/…/" };
  }

  const fromInventory = matchSapInventoryPathname(slugRaw, input.sapInventoryRows);
  if (fromInventory) {
    const fullUrlPreview = input.siteBaseUrl
      ? `${input.siteBaseUrl}${fromInventory}`
      : fromInventory;
    return { ok: true, pathLabel: fromInventory, fullUrlPreview };
  }

  const collection = input.site ? overviewEntityRestCollectionForSite(input.site) : null;
  if (!collection) {
    return { ok: false, reason: "missing_entity_collection" };
  }

  const colLower = collection.toLowerCase();
  const slugLower = slugRaw.toLowerCase();
  let pathLabel: string;
  if (slugLower === colLower) {
    pathLabel = "/…/";
  } else if (slugLower.startsWith(`${colLower}/`)) {
    pathLabel = `/${slugRaw}/`;
  } else {
    pathLabel = `/${collection}/${slugRaw}/`;
  }

  const fullUrlPreview = input.siteBaseUrl ? `${input.siteBaseUrl}${pathLabel}` : pathLabel;
  return { ok: true, pathLabel, fullUrlPreview };
}

function applySapPathToContext(
  slugSegment: string,
  ctx: BulkGeneratorPathPreviewContext | undefined,
  siteBaseUrl: string | null,
): string {
  if (ctx?.sitemapSource !== "sap") {
    const trimmed = slugSegment.trim().replace(/^\/+|\/+$/g, "");
    return trimmed ? `/${trimmed}/` : "/…/";
  }
  const resolved = resolveBulkSapPublicPath({
    site: ctx.site,
    slugSegment,
    siteBaseUrl,
    sapInventoryRows: ctx.sapInventoryRows,
  });
  if (resolved.ok) return resolved.pathLabel;
  return "/…/";
}

type BulkGeneratorPathKind = "post" | "page" | "entity";

function bulkGeneratorPathKind(
  row: CSVRow,
  ctx?: BulkGeneratorPathPreviewContext,
): BulkGeneratorPathKind {
  if (ctx?.sitemapSource === "posts") return "post";
  if (ctx?.sitemapSource === "pages") return "page";
  if (ctx?.sitemapSource === "sap") return "entity";
  return bulkCsvRowIsEntityPath(row) ? "entity" : "post";
}

function formatLockedSlugPath(
  locked: string,
  kind: BulkGeneratorPathKind,
  ctx?: BulkGeneratorPathPreviewContext,
  siteBaseUrl?: string | null,
): string {
  const trimmed = locked.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) return kind === "post" ? "/blog/…/" : "/…/";
  const lower = trimmed.toLowerCase();
  if (kind === "post") {
    if (lower.startsWith("blog/")) return `/${trimmed}/`;
    return `/blog/${trimmed}/`;
  }
  if (kind === "entity") {
    if (lower.startsWith("blog/")) {
      const withoutBlog = trimmed.slice(5).replace(/^\/+/, "");
      return applySapPathToContext(withoutBlog, ctx, siteBaseUrl ?? null);
    }
    return applySapPathToContext(trimmed, ctx, siteBaseUrl ?? null);
  }
  return `/${trimmed}/`;
}

/** Path-only preview for a CSV row (respects dock Posts / Pages / SAP when set). */
export function bulkCsvRowPathLabel(
  row: CSVRow,
  ctx?: BulkGeneratorPathPreviewContext,
  siteBaseUrl?: string | null,
  rowIndex?: number,
): string {
  const kind = bulkGeneratorPathKind(row, ctx);
  const locked = row.target_slug?.trim();
  if (locked) return formatLockedSlugPath(locked, kind, ctx, siteBaseUrl);

  const slug = buildSapSlugFromKeywordEntity(row.keyword ?? "", row.entity ?? "");
  if (!slug) {
    const fallbackSlug = rowIndex != null ? `row-${rowIndex + 1}` : "…";
    if (kind === "post") return `/blog/${fallbackSlug}/`;
    return `/${fallbackSlug}/`;
  }
  if (kind === "post") return `/blog/${slug}/`;
  return applySapPathToContext(slug, ctx, siteBaseUrl ?? null);
}

export function normalizeBulkGeneratorSiteBaseUrl(siteUrl: string | null | undefined): string | null {
  const raw = siteUrl?.trim();
  if (!raw) return null;
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProto);
    return `${url.origin}`.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function bulkGeneratorRowPathPreview(
  row: CSVRow,
  siteBaseUrl: string | null,
  ctx?: BulkGeneratorPathPreviewContext,
  rowIndex?: number,
): { pathLabel: string; fullUrlPreview: string } {
  if (row.target_slug?.trim()) {
    const pathLabel = bulkCsvRowPathLabel(row, ctx, siteBaseUrl, rowIndex);
    const fullUrlPreview = siteBaseUrl ? `${siteBaseUrl}${pathLabel}` : pathLabel;
    return { pathLabel, fullUrlPreview };
  }

  const dest = row.destination_url?.trim();
  if (dest) {
    try {
      const u = new URL(dest.startsWith("http") ? dest : `https://${dest.replace(/^\/+/, "")}`);
      let path = u.pathname || "/";
      if (ctx?.sitemapSource === "posts" && !path.toLowerCase().includes("/blog/")) {
        const seg = path.replace(/^\/+|\/+$/g, "");
        if (seg && seg !== "blog") path = `/blog/${seg}/`;
      }
      if (ctx?.sitemapSource === "sap") {
        const lower = path.toLowerCase();
        if (lower.startsWith("/blog/")) {
          const remainder = path.slice("/blog/".length).replace(/^\/+/, "");
          path = remainder ? `/${remainder.replace(/\/+$/, "")}/` : "/";
        }
        const segments = path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
        const collection = ctx.site ? overviewEntityRestCollectionForSite(ctx.site) : null;
        const needsCollectionPrefix =
          collection &&
          segments.length === 1 &&
          segments[0]?.toLowerCase() !== collection.toLowerCase();
        if (needsCollectionPrefix && segments[0]) {
          const resolved = resolveBulkSapPublicPath({
            site: ctx.site,
            slugSegment: segments[0],
            siteBaseUrl,
            sapInventoryRows: ctx.sapInventoryRows,
          });
          if (resolved.ok) {
            return { pathLabel: resolved.pathLabel, fullUrlPreview: resolved.fullUrlPreview };
          }
          return { pathLabel: "/…/", fullUrlPreview: siteBaseUrl ? `${siteBaseUrl}/…/` : "/…/" };
        }
        if (segments.length === 1 && ctx.site && !collection) {
          return { pathLabel: "/…/", fullUrlPreview: siteBaseUrl ? `${siteBaseUrl}/…/` : "/…/" };
        }
      }
      const href = siteBaseUrl ? `${siteBaseUrl}${path}` : u.href;
      return { pathLabel: path, fullUrlPreview: href };
    } catch {
      const path = dest.startsWith("/") ? dest : `/${dest}`;
      const full = siteBaseUrl ? `${siteBaseUrl}${path}` : path;
      return { pathLabel: path, fullUrlPreview: full };
    }
  }

  const pathLabel = bulkCsvRowPathLabel(row, ctx, siteBaseUrl, rowIndex);
  const fullUrlPreview = siteBaseUrl ? `${siteBaseUrl}${pathLabel}` : pathLabel;
  return { pathLabel, fullUrlPreview };
}

export function bulkGeneratorSapPathConfigError(
  site: Pick<WordPressSite, "entitySitemapUrl" | "manualEndpoint" | "sitemaps"> | null | undefined,
  sitemapSource: OverviewSitemapSource | undefined,
): string | null {
  if (sitemapSource !== "sap") return null;
  if (site && overviewEntityRestCollectionForSite(site)) return null;
  return "Entity sitemap is not configured for this property.";
}

export function buildBulkGeneratorPathPreviewContext(input: {
  sitemapSource?: OverviewSitemapSource;
  site?: Pick<WordPressSite, "entitySitemapUrl" | "manualEndpoint" | "sitemaps" | "siteUrl"> | null;
  sapInventoryRows?: ReadonlyArray<Pick<OverviewInventoryRow, "url" | "slug">>;
}): BulkGeneratorPathPreviewContext | undefined {
  if (!input.sitemapSource && !input.site) return undefined;
  return {
    sitemapSource: input.sitemapSource,
    site: input.site,
    sapInventoryRows: input.sapInventoryRows,
  };
}
