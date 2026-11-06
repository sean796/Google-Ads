import { isConnectedSiteBrandAsKeyword } from '@/lib/bulk/bulk-gsc-site-queries';
import { isBlockedContentTopicPhrase } from '@/lib/content-topic-blocklist';
import { parseTitleTemplate } from '../title-template-parser';
import type { CSVRow } from './bulk-csv-parser-rows';


function parseListString(list: string): string[] {
  if (!list || !list.trim()) return [];
  return list
    .split(/[,\n]/)
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

/** Strip a single leading ```…``` wrapper if the model wrapped the checklist. */
function stripOuterMarkdownFence(text: string): string {
  const t = text.trim();
  if (!t.startsWith('```')) return text;
  const afterOpen = t.indexOf('\n');
  const body = afterOpen >= 0 ? t.slice(afterOpen + 1) : t.replace(/^```[a-zA-Z0-9_-]*\s*/, '');
  const close = body.lastIndexOf('```');
  if (close < 0) return body.trim();
  return body.slice(0, close).trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Curly quotes and bold **Label:** wrappers break strict `Keyword: "…"` regexes. */
function normalizeMachineChecklistLine(line: string): string {
  let s = line
    .replace(/\u201c/g, '"')
    .replace(/\u201d/g, '"')
    .replace(/\u201e/g, '"')
    .replace(/\u201f/g, '"');
  const labels = [
    'Keyword',
    'Entity',
    'Title',
    'MetaDescription',
    'Modifier',
    'FeaturedImage',
    'DateModifier',
    'PromptModifier',
    'KeywordFocus',
    'ServiceAreaFields',
    'Origin',
    'FAQ',
    'Rationale',
  ];
  for (const label of labels) {
    const esc = escapeRegExp(label);
    s = s.replace(new RegExp(`\\*\\*(${esc}):\\*\\*`, 'gi'), '$1:');
    s = s.replace(new RegExp(`\\*\\*(${esc})\\*\\*:`, 'gi'), '$1:');
  }
  return s;
}

/**
 * Normalize one checklist line so `^\d+[\.\)]\s+` matches after common model formatting
 * (indented lists, - 1., **1.**, etc.).
 */
function normalizeChecklistLine(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^[-*]\s+/, '');
  s = s.replace(/^[*]*(\d+)[*]*[.)]\s*/, '$1. ');
  return s;
}

/** Split checklist into numbered item blocks (supports one field per line after the number). */
function splitNumberedChecklistBlocks(checklistContent: string): string[] {
  const normalizedBlock = stripOuterMarkdownFence(checklistContent);
  const lines = normalizedBlock.split(/\r?\n/);
  const blocks: string[] = [];
  let current: string[] = [];

  for (const rawLine of lines) {
    const line = normalizeChecklistLine(normalizeMachineChecklistLine(rawLine));
    if (!line.trim()) continue;

    if (line.match(/^\d+[.)]\s+/)) {
      if (current.length > 0) {
        blocks.push(current.join('\n'));
      }
      current = [line.replace(/^\d+[.)]\s+/, '').trim()];
    } else if (current.length > 0) {
      current.push(line.trim());
    }
  }

  if (current.length > 0) {
    blocks.push(current.join('\n'));
  }

  return blocks;
}

function parseChecklistItemContent(content: string): CSVRow | null {
  const keywordMatch = content.match(/Keyword:\s*"([^"]+)"/i);
  const entityMatch = content.match(/Entity:\s*"([^"]+)"/i);
  const titleMatch = content.match(/Title:\s*"([^"]+)"/i);
  const metaDescriptionMatch = content.match(/MetaDescription:\s*"([^"]+)"/i);
  const modifierMatch = content.match(/Modifier:\s*"([^"]*)"/i);
  const featuredImageMatch = content.match(/FeaturedImage:\s*"([^"]+)"|FeaturedImage:\s*([yn])/i);
  const dateModifierMatch = content.match(/DateModifier:\s*"([^"]+)"/i);
  const promptModifierMatch = content.match(/PromptModifier:\s*"([^"]+)"/i);
  const keywordFocusMatch = content.match(/KeywordFocus:\s*"([^"]+)"/i);
  const serviceAreaFieldsMatch = content.match(/ServiceAreaFields:\s*"([^"]+)"/i);
  const originMatch = content.match(/Origin:\s*"([^"]+)"/i);
  const faqMatch = content.match(/FAQ:\s*"([^"]+)"/i);
  const rationaleMatch = content.match(/Rationale:\s*"([^"]+)"/i);

  if (keywordMatch && titleMatch) {
    const row: CSVRow = {
      keyword: keywordMatch[1].trim(),
      title: titleMatch[1].trim(),
    };

    if (entityMatch && entityMatch[1].trim().length > 0) {
      row.entity = entityMatch[1].trim();
    }

    if (metaDescriptionMatch && metaDescriptionMatch[1].trim().length > 0) {
      row.meta_description = metaDescriptionMatch[1].trim();
    }

    if (modifierMatch) {
      row.modifier = modifierMatch[1].trim();
    }

    if (featuredImageMatch) {
      const value = (featuredImageMatch[1] || featuredImageMatch[2] || '').toLowerCase();
      if (value === 'y' || value === 'yes') {
        row.featuredImage = 'y';
      } else if (value === 'google-maps' || value === 'googlemaps' || value === 'google_maps') {
        row.featuredImage = 'google-maps';
      } else {
        row.featuredImage = 'n';
      }
    }

    if (dateModifierMatch && dateModifierMatch[1].trim().length > 0) {
      row.date_modifier = dateModifierMatch[1].trim();
    }

    if (promptModifierMatch && promptModifierMatch[1].trim().length > 0) {
      row.prompt_modifier = promptModifierMatch[1].trim();
    }

    if (keywordFocusMatch && keywordFocusMatch[1].trim().length > 0) {
      row.keyword_focus = keywordFocusMatch[1].trim();
    }

    if (serviceAreaFieldsMatch && serviceAreaFieldsMatch[1].trim().length > 0) {
      row.service_area_fields = serviceAreaFieldsMatch[1].trim();
    }

    if (originMatch && originMatch[1].trim().length > 0) {
      row.origin = originMatch[1].trim();
    }

    if (faqMatch && faqMatch[1].trim().length > 0) {
      row.faq = faqMatch[1].trim();
    }

    if (rationaleMatch && rationaleMatch[1].trim().length > 0) {
      row.rationale = rationaleMatch[1].trim();
    }

    return row;
  }

  const quotedStrings = content.match(/"([^"]+)"/g);
  if (quotedStrings && quotedStrings.length >= 2) {
    const row: CSVRow = {
      keyword: quotedStrings[0].replace(/"/g, '').trim(),
      title:
        quotedStrings.length >= 3
          ? quotedStrings[2].replace(/"/g, '').trim()
          : quotedStrings[1].replace(/"/g, '').trim(),
    };

    if (quotedStrings.length >= 3 && quotedStrings[1].replace(/"/g, '').trim().length > 0) {
      row.entity = quotedStrings[1].replace(/"/g, '').trim();
    }

    if (quotedStrings.length >= 4) {
      row.modifier = quotedStrings[3].replace(/"/g, '').trim();
    }

    return row;
  }

  return null;
}

/**
 * Parse AI-generated checklist into CSVRow[] format
 * @param checklistContent - The AI-generated checklist content
 * @param titleTemplate - Optional title template with variables like [Entity], [Keyword]
 * @param entityList - Optional comma/newline-separated list of entity values
 * @param keywordList - Optional comma/newline-separated list of keyword values
 * @param locationList - Optional comma/newline-separated list of location values
 * @param numberList - Optional comma/newline-separated list of number values
 */
export function parseBlogIdeasChecklist(
  checklistContent: string, 
  titleTemplate?: string,
  entityList?: string,
  keywordList?: string,
  locationList?: string,
  numberList?: string,
  companyName?: string | null,
): CSVRow[] {
  const rows: CSVRow[] = [];
  const blocks = splitNumberedChecklistBlocks(checklistContent);

  for (const block of blocks) {
    const content = normalizeMachineChecklistLine(
      block
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join(', '),
    );

    const row = parseChecklistItemContent(content);
    if (
      row &&
      !isBlockedContentTopicPhrase(row.keyword, row.title) &&
      !isConnectedSiteBrandAsKeyword(row.keyword, companyName)
    ) {
      rows.push(row);
    }
  }
  
  // Apply title template if provided
  if (titleTemplate && titleTemplate.trim()) {
    // Parse variable lists
    const entityValues = parseListString(entityList || '');
    const keywordValues = parseListString(keywordList || '');
    const locationValues = parseListString(locationList || '');
    const numberValues = parseListString(numberList || '');
    
    rows.forEach((row, index) => {
      // Get value from list (use index, or last value if list is shorter, or fallback to row value)
      const getListValue = (list: string[], fallback: string): string => {
        if (list.length > 0) {
          // Use index if available, otherwise use last value (repeats for remaining rows)
          return list[Math.min(index, list.length - 1)] || fallback;
        }
        return fallback;
      };
      
      const variables: Record<string, string> = {
        Keyword: getListValue(keywordValues, row.keyword || ''),
        Entity: getListValue(entityValues, row.entity || ''),
        Location: getListValue(locationValues, ''),
        Number: getListValue(numberValues, String(index + 1)),
      };
      
      // ALWAYS apply template - override AI-generated title
      const generatedTitle = parseTitleTemplate(titleTemplate, variables);
      if (generatedTitle && generatedTitle.trim()) {
        // Override the AI-generated title with template-generated title
        row.title = generatedTitle.trim();
        console.log(`[Title Template] Row ${index + 1}: Applied template "${titleTemplate}" with variables:`, variables, '→ Result:', row.title);
      } else {
        // If template parsing fails, log warning but keep AI title as fallback
        console.warn(`[Title Template] Failed to parse template for row ${index + 1}, keeping AI-generated title:`, row.title);
      }
    });
  }

  return rows;
}
