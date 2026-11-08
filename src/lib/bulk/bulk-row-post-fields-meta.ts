import type { CSVRow } from '@/lib/bulk/bulk-csv-parser';
import type { KeywordAIAnalysis, KeywordData } from '@/lib/keyword-types';
import type { OptimizedMetaFields } from '@/lib/meta-field-optimizer';
import {
  buildCompetitorFieldsValue,
  isCompetitorCsvKeyword,
} from '@/lib/competitor-research/competitor-csv-row';
import { extractOriginFromSapTitle } from '@/lib/sap-origin-from-title';

/** Populate ACF fields from DFS data for new posts (skipping GSC). */
export function populateACFFieldsFromDFS(
  row: CSVRow,
  keywordData: KeywordData,
  _aiAnalysis: KeywordAIAnalysis,
  _keywordsWithVolumeData: unknown[],
): Partial<CSVRow> {
  const acfFields: Partial<CSVRow> = {};

  if (!row.date_modifier) {
    acfFields.date_modifier = new Date().toISOString().split('T')[0];
  }

  if (!row.prompt_modifier && row.modifier) {
    acfFields.prompt_modifier = row.modifier;
  }

  const competitorRow = isCompetitorCsvKeyword(row.keyword);
  const focusForFields =
    row.keyword_focus?.trim() || keywordData?.keyword?.trim() || '';

  if (competitorRow && row.sitemap_type === 'entity') {
    const competitorName =
      row.competitor?.trim() ||
      (row.entity?.trim() && row.entity.trim() !== 'N/A' ? row.entity.trim() : '');
    if (competitorName && focusForFields) {
      if (!row.competitor?.trim()) {
        acfFields.competitor = competitorName;
      }
      if (!row.competitor_fields?.trim()) {
        acfFields.competitor_fields = buildCompetitorFieldsValue(competitorName, focusForFields);
      }
    }
    return acfFields;
  }

  if (row.sitemap_type === 'entity' && !row.origin?.trim()) {
    const fromTitle = extractOriginFromSapTitle(row.title);
    if (fromTitle) {
      acfFields.origin = fromTitle;
    } else if (row.entity && row.entity.trim() && row.entity.trim() !== 'N/A') {
      acfFields.origin = row.entity.trim();
    }
  }

  if (!row.service_area_fields) {
    const serviceAreaParts: string[] = [];
    if (row.entity && row.entity.trim() && row.entity.trim() !== 'N/A') {
      serviceAreaParts.push(row.entity.trim());
    }
    if (keywordData?.keyword) {
      serviceAreaParts.push(keywordData.keyword);
    }
    if (serviceAreaParts.length > 0) {
      acfFields.service_area_fields = serviceAreaParts.join(', ');
    }
  }

  return acfFields;
}

export function parseOptimizedMetaFromSeoResearchJson(json: string): OptimizedMetaFields | null {
  try {
    const parsed = JSON.parse(json) as {
      optimizedMeta?: Record<string, unknown>;
      seo_title?: string;
      meta_description?: string;
      focus_keyword?: string;
    };
    const om = parsed.optimizedMeta;
    if (om && typeof om === 'object') {
      return {
        neo_pulse_seo_title: String(om.neo_pulse_seo_title ?? parsed.seo_title ?? ''),
        neo_pulse_seo_description: String(om.neo_pulse_seo_description ?? parsed.meta_description ?? ''),
        neo_pulse_seo_focus_keyword: String(om.neo_pulse_seo_focus_keyword ?? parsed.focus_keyword ?? ''),
        neo_pulse_seo_canonical_url: String(om.neo_pulse_seo_canonical_url ?? ''),
        neo_pulse_seo_robots: Array.isArray(om.neo_pulse_seo_robots)
          ? (om.neo_pulse_seo_robots as string[])
          : ['index', 'follow'],
        keyword_focus: String(om.neo_pulse_seo_focus_keyword ?? parsed.focus_keyword ?? ''),
      };
    }
    if (parsed.seo_title || parsed.meta_description) {
      return {
        neo_pulse_seo_title: String(parsed.seo_title ?? ''),
        neo_pulse_seo_description: String(parsed.meta_description ?? ''),
        neo_pulse_seo_focus_keyword: String(parsed.focus_keyword ?? ''),
        neo_pulse_seo_canonical_url: '',
        neo_pulse_seo_robots: ['index', 'follow'],
        keyword_focus: String(parsed.focus_keyword ?? ''),
      };
    }
    return null;
  } catch {
    return null;
  }
}
