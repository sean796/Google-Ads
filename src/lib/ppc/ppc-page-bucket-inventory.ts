import type { WordPressSite } from "@/components/integrations/types";
import {
  decodeInventoryTitleText,
  inventoryFieldString,
  inventoryUrlForRow,
} from "@/lib/bulk/inventory-json-slim";
import { filterInventorySitemapRows } from "@/lib/bulk/inventory-url-filter";
import { overviewInventoryCollectionsFromSource } from "@/lib/overview/overview-sitemap-source";
import { filterOverviewUtilityInventoryRows } from "@/lib/overview/overview-utility-page-filter";
import type { PpcWpPageContext } from "@/lib/ppc/google-ads-types";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { getSiteInventoryBulk } from "@/lib/wordpress-api";

export type PpcPageBucketHostedLink = {
  label: string;
  href: string;
  filename: string;
  rowCount: number;
};

function hostSlugForInventoryFile(siteUrl: unknown): string {
  try {
    const raw = typeof siteUrl === "string" ? siteUrl : "";
    if (!raw) return "site";
    const withProto = raw.startsWith("http") ? raw : `https://${raw}`;
    const u = new URL(withProto);
    return u.hostname.replace(/[^a-zA-Z0-9.-]+/g, "-").slice(0, 80) || "site";
  } catch {
    return "site";
  }
}

export function mapOverviewRowToPpcWpPageContext(row: {
  url?: unknown;
  slug?: unknown;
  fields?: { title?: unknown; excerpt?: unknown; meta?: unknown; keyword?: unknown };
}): PpcWpPageContext | null {
  const url = inventoryUrlForRow(row);
  if (!url) return null;
  const title =
    inventoryFieldString(row.fields?.title) ||
    inventoryFieldString(row.slug) ||
    url;
  return {
    url,
    title: decodeInventoryTitleText(title),
    excerpt: inventoryFieldString(row.fields?.excerpt),
    metaDescription: inventoryFieldString(row.fields?.meta),
    keyword: inventoryFieldString(row.fields?.keyword),
  };
}

/** WordPress pages plus any Pages-tagged CPT collections. */
export function ppcPageBucketCollections(site: WordPressSite): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (col: string) => {
    const key = col.trim();
    if (!key) return;
    const lower = key.toLowerCase();
    if (seen.has(lower)) return;
    seen.add(lower);
    out.push(key);
  };
  push("pages");
  for (const col of overviewInventoryCollectionsFromSource("pages", site)) {
    push(col);
  }
  return out;
}

export async function loadPpcPageBucketContext(site: WordPressSite): Promise<PpcWpPageContext[]> {
  const username = typeof site.username === "string" ? site.username : "";
  const appPassword = typeof site.appPassword === "string" ? site.appPassword : "";
  if (!username || !appPassword) {
    throw new Error("WordPress credentials are required to load page bucket inventory.");
  }

  const bulk = await getSiteInventoryBulk(site.siteUrl, username, appPassword, {
    includeRawPostFields: true,
    includeScheduled: true,
    collections: ppcPageBucketCollections(site),
  });

  const pages = filterInventorySitemapRows(
    filterOverviewUtilityInventoryRows(bulk.rows ?? []),
  )
    .map(mapOverviewRowToPpcWpPageContext)
    .filter((page): page is PpcWpPageContext => Boolean(page));

  if (!pages.length) {
    const errText = [bulk.error, ...Object.values(bulk.errors ?? {})]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean)
      .join(" · ");
    throw new Error(errText || "Page bucket inventory returned no URLs.");
  }

  return pages;
}

export function stringifyPpcPageBucketUrlTitleJson(pages: PpcWpPageContext[]): string {
  return JSON.stringify(
    pages.map((page) => ({
      url: page.url,
      title: page.title,
    })),
    null,
    2,
  );
}

export function createPpcPageBucketHostedLink(
  siteUrl: string,
  pages: PpcWpPageContext[],
): PpcPageBucketHostedLink {
  const slug = hostSlugForInventoryFile(siteUrl);
  const filename = `ppc-page-bucket-${slug}-${Date.now()}.json`;
  const json = stringifyPpcPageBucketUrlTitleJson(pages);
  const href = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
  return {
    label: "Page bucket",
    href,
    filename,
    rowCount: pages.length,
  };
}

export function revokePpcPageBucketHostedLink(href: string | null | undefined): void {
  if (href?.startsWith("blob:")) {
    URL.revokeObjectURL(href);
  }
}

export function resolvePpcAllowedLandingPages(
  pages: PpcWpPageContext[],
  selectedUrls: string[],
): PpcWpPageContext[] {
  if (!pages.length) {
    throw new Error("Page bucket inventory is empty.");
  }

  if (selectedUrls.length === 0) {
    return pages;
  }

  const byUrlKey = new Map(pages.map((page) => [normalizePageUrlKey(page.url), page]));
  const selected = selectedUrls
    .map((url) => byUrlKey.get(normalizePageUrlKey(url)))
    .filter((page): page is PpcWpPageContext => Boolean(page));

  if (!selected.length) {
    throw new Error("Selected landing pages were not found in the page bucket inventory.");
  }

  return selected;
}
