import { z } from "zod";
import { callOpenRouterChatCompletion } from '@/lib/competitor-research/competitor-report-openrouter';
import { parseModelJson } from '@/lib/model-json';
import { getResearchModel } from '@/lib/optimization-settings-storage';
import type { CSVRow } from './bulk-csv-parser-rows';

export type { CSVRow, ImportedSectionRow, ModifierLinkRow } from './bulk-csv-parser-rows';
export {
  parseImportedSectionsJson,
  parseImportedLinksJson,
  parseModifierLinksJson,
  modifierLinksFromJson,
  importRowLinkEditorUrls,
  serializeModifierLinksJson,
  parseKeywordQuestionsJson,
} from './bulk-csv-parser-rows';
export { parseBlogIdeasChecklist } from './bulk-csv-parser-checklist';
export { parseCsvStaticText, parseCsvStatic } from './bulk-csv-parser-static';

const BulkCsvAiRowSchema = z.object({
  keyword: z.string(),
  title: z.string(),
  entity: z.string().nullish(),
  modifier: z.string().nullish(),
  featuredImage: z.string().nullish(),
  meta_description: z.string().nullish(),
  publish_date_gmt: z.string().nullish(),
  sitemap_type: z.enum(["post", "entity"]).nullish(),
  target_slug: z.string().nullish(),
  wikipedia_url: z.string().nullish(),
  wikipedia_title: z.string().nullish(),
});

const BulkCsvAiRowsSchema = z.object({
  rows: z.array(BulkCsvAiRowSchema),
});

/** Upload CSV: raw file text → OpenRouter → bulk rows. */
export async function parseCSV(
  file: File,
  openRouterApiKey: string,
  model?: string,
): Promise<CSVRow[]> {
  const apiKey = openRouterApiKey.trim();
  if (!apiKey) {
    throw new Error('OpenRouter API key is required.');
  }

  const csvText = await file.text();
  if (!csvText.trim()) {
    throw new Error('CSV file is empty');
  }

  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model: model || getResearchModel(),
    system:
      'Return JSON only: { "rows": [ { "keyword": string, "title": string, "entity"?: string, "modifier"?: string, "featuredImage"?: string, "publish_date_gmt"?: string, "sitemap_type"?: "post" | "entity", "meta_description"?: string, "target_slug"?: string, "wikipedia_url"?: string, "wikipedia_title"?: string } ] }. Read the uploaded CSV and output bulk content rows. Copy meta_description, target_slug, wikipedia_url, and wikipedia_title from the CSV when those columns exist and cells are non-empty. Do not invent or rewrite those fields when present.',
    user: `File: ${file.name}\n\n${csvText}`,
    maxTokens: 16000,
    temperature: 0.3,
    responseFormat: { type: 'json_object' },
  });

  const parsed = parseModelJson(content, BulkCsvAiRowsSchema, "bulk CSV rows");
  const rows: CSVRow[] = parsed.rows
    .filter((r) => r.keyword.trim() && r.title.trim())
    .map((r) => {
      const row: CSVRow = { keyword: r.keyword, title: r.title };
      if (r.entity != null) row.entity = r.entity;
      if (r.modifier != null) row.modifier = r.modifier;
      if (r.featuredImage != null) row.featuredImage = r.featuredImage;
      if (r.meta_description != null) row.meta_description = r.meta_description;
      if (r.publish_date_gmt != null) row.publish_date_gmt = r.publish_date_gmt;
      if (r.sitemap_type != null) row.sitemap_type = r.sitemap_type;
      if (r.target_slug != null) row.target_slug = r.target_slug;
      if (r.wikipedia_url != null) row.wikipedia_url = r.wikipedia_url;
      if (r.wikipedia_title != null) row.wikipedia_title = r.wikipedia_title;
      return row;
    });

  if (!rows.length) {
    throw new Error('OpenRouter returned no bulk rows');
  }

  return rows;
}

