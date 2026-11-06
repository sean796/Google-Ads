import type { WordPressSite } from "@/components/integrations/types";
import { isEntitySitemapDisabled } from "@/lib/entity-endpoint-extractor";
import { parseSitemap } from "@/lib/wordpress-api";
import {
  GSC_ENTITY_SITEMAP_URLS_FILENAME,
  GSC_SITEMAPS_BUNDLE_FILENAME,
  SAP_CANONICAL_SITEMAP_LEAVES,
  SAP_EXTRA_SITEMAP_PARSE_LIMIT,
  SAP_FILTERED_PAGES_MAX_CHARS,
  SAP_LOCAL_PATHNAME_PREFIXES,
  appendEntitySitemapUrlsBundleFile,
  buildAllowlistPathnameSet,
  dedupeSapAllowlistUrls,
  entitySitemapUrlsBundleCsv,
  filterUrlsToSiteOrigin,
  gscSubmittedSitemapPathsFromBundle,
  pathOrUrlLooksLikeSapSitemap,
  pathnameKeyFromUrl,
  pathnameMatchesSapLocalOrEntityArea,
  resolveAbsoluteSitemapUrl,
  siteOriginFromPublicUrl,
  type SapEntityGrounding,
} from "@/lib/gsc-reporting/gsc-reporting-sap-allowlist-helpers";
import {
  buildSapEntityAllowlistChunkText,
  buildSapEntityGrounding,
  buildSapFilteredPagesChunkText,
  buildSapFilteredPagesEvidence,
  expandSapAllowlistFromPagesFiles,
  isPagesMomReportingFile,
} from "@/lib/gsc-reporting/gsc-reporting-sap-filtered-pages";

export {
  GSC_ENTITY_SITEMAP_URLS_FILENAME,
  GSC_SITEMAPS_BUNDLE_FILENAME,
  SAP_CANONICAL_SITEMAP_LEAVES,
  SAP_FILTERED_PAGES_MAX_CHARS,
  SAP_LOCAL_PATHNAME_PREFIXES,
  appendEntitySitemapUrlsBundleFile,
  buildAllowlistPathnameSet,
  buildSapEntityAllowlistChunkText,
  buildSapEntityGrounding,
  buildSapFilteredPagesChunkText,
  buildSapFilteredPagesEvidence,
  dedupeSapAllowlistUrls,
  entitySitemapUrlsBundleCsv,
  expandSapAllowlistFromPagesFiles,
  filterUrlsToSiteOrigin,
  gscSubmittedSitemapPathsFromBundle,
  isPagesMomReportingFile,
  pathnameKeyFromUrl,
  pathnameMatchesSapLocalOrEntityArea,
  resolveAbsoluteSitemapUrl,
  siteOriginFromPublicUrl,
};
export type { SapEntityGrounding };

export function discoverReportingSapSitemapUrls(args: {
  site: WordPressSite;
  publicSiteUrl: string;
  files?: { name: string; content: string }[];
}): string[] {
  const disabled = new Set(
    (args.site.sitemaps?.disabledChildSitemapUrls ?? []).map((u) => u.trim()).filter(Boolean),
  );
  const candidates = new Set<string>();

  const consider = (raw: string) => {
    const abs = resolveAbsoluteSitemapUrl(raw, args.publicSiteUrl);
    if (!abs || disabled.has(abs)) return;
    if (pathOrUrlLooksLikeSapSitemap(abs)) candidates.add(abs);
  };

  const entityUrl = args.site.entitySitemapUrl?.trim();
  if (entityUrl && !isEntitySitemapDisabled(args.site)) {
    consider(entityUrl);
  }

  for (const raw of args.site.sitemaps?.childSitemaps ?? []) {
    consider(raw);
  }
  for (const raw of Object.keys(args.site.sitemaps?.endpoints ?? {})) {
    consider(raw);
  }

  for (const path of gscSubmittedSitemapPathsFromBundle(args.files ?? [])) {
    consider(path);
  }

  return [...candidates].slice(0, SAP_EXTRA_SITEMAP_PARSE_LIMIT);
}


async function fetchSitemapUrlsOnOrigin(args: {
  site: WordPressSite;
  sitemapUrl: string;
  publicSiteUrl: string;
}): Promise<string[]> {
  const user = args.site.username?.trim();
  const pass = args.site.appPassword?.trim();
  const result = await parseSitemap(
    args.site.siteUrl,
    args.sitemapUrl,
    user || undefined,
    pass || undefined,
  );
  const raw = (result?.urls ?? []).map((u) => String(u ?? "").trim()).filter((u) => u.length > 0);
  return filterUrlsToSiteOrigin(raw, args.publicSiteUrl);
}

/** Entity sitemap + service-area sitemap + local sitemaps (Integrations, GSC submissions, canonical XML). */
export async function resolveReportingSapAllowlistFromSitemaps(args: {
  site: WordPressSite;
  publicSiteUrl: string;
  files?: { name: string; content: string }[];
}): Promise<{ allowlistUrls: string[]; sourceLabel: string }> {
  const sitemapXmlUrls = discoverReportingSapSitemapUrls(args);
  const labels: string[] = [];
  const merged: string[] = [];

  for (const sitemapUrl of sitemapXmlUrls) {
    const leaf = sitemapUrl.split("/").filter(Boolean).pop() ?? sitemapUrl;
    if (!labels.includes(leaf)) labels.push(leaf);
    merged.push(
      ...(await fetchSitemapUrlsOnOrigin({
        site: args.site,
        sitemapUrl,
        publicSiteUrl: args.publicSiteUrl,
      })),
    );
  }

  const allowlistUrls = dedupeSapAllowlistUrls(merged);
  if (allowlistUrls.length === 0) {
    return {
      allowlistUrls: [],
      sourceLabel:
        sitemapXmlUrls.length > 0
          ? "Entity + service area sitemaps (XML loaded but no page URLs)"
          : "Entity / service area sitemap (none discovered)",
    };
  }
  const sourceLabel =
    labels.length > 0
      ? `Entity + service area sitemaps (${labels.join(", ")})`
      : "Entity + service area sitemaps";
  return { allowlistUrls, sourceLabel };
}

/** @deprecated Use resolveReportingSapAllowlistFromSitemaps */
export async function resolveReportingSapEntityAllowlist(args: {
  site: WordPressSite;
  publicSiteUrl: string;
}): Promise<{ allowlistUrls: string[]; sourceLabel: string }> {
  return resolveReportingSapAllowlistFromSitemaps(args);
}


export async function resolveReportingSapAllowlist(args: {
  site: WordPressSite;
  publicSiteUrl: string;
  files: { name: string; content: string }[];
}): Promise<{ allowlistUrls: string[]; sourceLabel: string }> {
  const fromSitemaps = await resolveReportingSapAllowlistFromSitemaps({
    site: args.site,
    publicSiteUrl: args.publicSiteUrl,
    files: args.files,
  });
  const allowlistUrls = expandSapAllowlistFromPagesFiles({
    allowlistUrls: fromSitemaps.allowlistUrls,
    files: args.files,
    publicSiteUrl: args.publicSiteUrl,
  });
  return {
    allowlistUrls,
    sourceLabel: fromSitemaps.sourceLabel,
  };
}
