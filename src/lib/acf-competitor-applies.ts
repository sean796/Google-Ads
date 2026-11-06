import { isCompetitorCsvKeyword } from '@/lib/competitor-research/competitor-csv-row';

/** ACF `competitor` + `competitor_fields` for competitor-comparison entity rows only. */
export function acfCompetitorAppliesForRow(keyword: string | undefined): boolean {
  return isCompetitorCsvKeyword(keyword);
}
