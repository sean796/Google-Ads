import type { WordPressSite } from "@/components/integrations/types";

export const ORGANIC_CLIENT_REPORT_SITE_ID_QUERY = "siteId";

/** Slug for the client report URL path (display name, not wp-* accounting id). */
export function clientReportSitePathSegmentFromDisplayName(siteDisplayName: string): string {
  const base = siteDisplayName
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "client";
}

export function isWordPressIntegrationsSiteId(segment: string): boolean {
  return /^wp-\d+$/.test(segment.trim());
}

export function resolveClientReportSiteIdFromRoute(
  pathSegment: string,
  search: string,
  sites: WordPressSite[],
): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const fromQuery = params.get(ORGANIC_CLIENT_REPORT_SITE_ID_QUERY)?.trim();
  if (fromQuery) return fromQuery;
  const segment = pathSegment.trim();
  if (isWordPressIntegrationsSiteId(segment)) return segment;
  const slug = segment.toLowerCase();
  for (const site of sites) {
    const name = (site.name ?? site.siteName ?? "").trim();
    if (name && clientReportSitePathSegmentFromDisplayName(name) === slug) {
      return site.id;
    }
  }
  return segment;
}

export function buildOrganicClientReportPathAndSearch(args: {
  siteId: string;
  siteDisplayName: string;
  search: string;
}): { pathSegment: string; search: string } {
  const pathSegment = clientReportSitePathSegmentFromDisplayName(args.siteDisplayName);
  const params = new URLSearchParams(
    args.search.startsWith("?") ? args.search.slice(1) : args.search,
  );
  params.set(ORGANIC_CLIENT_REPORT_SITE_ID_QUERY, args.siteId.trim());
  return { pathSegment, search: params.toString() };
}

export function buildOrganicClientReportAppPath(args: {
  siteId: string;
  siteDisplayName: string;
  search: string;
}): string {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { pathSegment, search } = buildOrganicClientReportPathAndSearch(args);
  return `${basePath}/sites/${encodeURIComponent(pathSegment)}/organic/client-report?${search}`;
}
