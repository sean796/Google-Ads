import type { CSVRow } from './bulk-csv-parser';
import { isCompetitorCsvKeyword } from '@/lib/competitor-research/competitor-csv-row';
import type { KeywordData } from '../keyword-types';

/**
 * Single source of truth for bulk / prompt-generator primary keyword (focus keyword / ACF parity).
 * CSV `keyword` wins when set (SAP / Local Analysis exact phrase - not overridden by keyword_focus or DFS).
 * Then explicit keyword_focus, research keyword, titles.
 */
export function resolveBulkPrimaryKeyword(
  row: CSVRow,
  enrichedRow: CSVRow,
  keywordData: KeywordData,
  blueprintTitle?: string
): string {
  const s = (v: string | undefined) => (typeof v === 'string' ? v.trim() : '');
  const csvKeyword = s(row.keyword) || s(enrichedRow.keyword);
  const focusOverride =
    s(enrichedRow.keyword_focus) ||
    s(row.keyword_focus);
  if (focusOverride && isCompetitorCsvKeyword(csvKeyword)) {
    return focusOverride.slice(0, 500);
  }
  return (
    csvKeyword ||
    focusOverride ||
    s(keywordData.keyword) ||
    s(enrichedRow.title) ||
    s(blueprintTitle) ||
    ''
  ).slice(0, 500);
}
