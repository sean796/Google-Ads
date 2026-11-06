import type { WordPressSite } from '@/components/integrations/types';
import { extractEndpointFromEntitySitemapUrl } from '@/lib/entity-endpoint-extractor';
import { isCompetitorCsvKeyword } from '@/lib/competitor-research/competitor-csv-row';

type RowWithKeyword = { keyword?: string };

export function resolveEntitySitemapUrlForRow(
  site: WordPressSite,
  row: RowWithKeyword,
): string | undefined {
  if (isCompetitorCsvKeyword(row.keyword)) {
    return site.competitorEntitySitemapUrl?.trim() || undefined;
  }
  return site.entitySitemapUrl?.trim() || undefined;
}

export function requireEntitySitemapUrlForRow(site: WordPressSite, row: RowWithKeyword): string {
  const url = resolveEntitySitemapUrlForRow(site, row);
  if (!url) {
    if (isCompetitorCsvKeyword(row.keyword)) {
      throw new Error(
        'Competitor sitemap URL is not configured for this property. Set it in Integrations (Sitemap menu: use competitor-sitemap.xml).',
      );
    }
    throw new Error('Entity sitemap URL is not configured for this property.');
  }
  return url;
}

export function resolveEntityEndpointForRow(
  site: WordPressSite,
  row: RowWithKeyword,
  sitemapType: 'entity' | 'post' | undefined,
): string {
  if (sitemapType !== 'entity') {
    return 'posts';
  }
  const sitemapUrl = requireEntitySitemapUrlForRow(site, row);
  return extractEndpointFromEntitySitemapUrl(sitemapUrl);
}
