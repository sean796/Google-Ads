import { acfCompetitorAppliesForRow } from '@/lib/post-fields-competitor-applies';

/** ACF Origin is for entity/SAP service-area pages only, not standard blog posts. */
export function postFieldsOriginAppliesForSitemapType(sitemapType: string | undefined): boolean {
  return sitemapType === "entity";
}

/** Origin ACF for SAP entity rows only (not competitor-comparison entity rows). */
export function postFieldsOriginAppliesForRow(
  keyword: string | undefined,
  sitemapType: string | undefined,
): boolean {
  return postFieldsOriginAppliesForSitemapType(sitemapType) && !acfCompetitorAppliesForRow(keyword);
}
