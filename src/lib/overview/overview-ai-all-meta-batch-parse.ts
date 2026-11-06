import { z } from "zod";
import { extractFirstBalancedJsonValue } from "@/lib/competitor-research/competitor-report-json-parse";
import { parseFaqEntries, serializeFaqEntriesPlain, type FaqEntry } from "@/lib/faq-entries";
import { normalizeOverviewKeywordUrlKey } from "@/lib/overview/overview-keyword-batch-parse";
import type { AiAllMetaCatalogRow } from "@/lib/overview/overview-ai-all-meta-batch-catalog";

const metaBatchItemSchema = z.object({
  url: z.string().optional(),
  page: z.string().optional(),
  metaDescription: z.string().optional(),
  meta: z.string().optional(),
  description: z.string().optional(),
  title: z.string().optional(),
  faq: z.string().optional(),
  faqPairs: z
    .array(z.object({ question: z.string().optional(), answer: z.string().optional() }))
    .optional(),
});

const metaBatchEnvelopeSchema = z
  .union([
    z.array(metaBatchItemSchema),
    z.object({ results: z.array(metaBatchItemSchema) }),
    z.object({ rows: z.array(metaBatchItemSchema) }),
  ])
  .transform((value) => {
    if (Array.isArray(value)) return value;
    const obj = value as {
      results?: z.infer<typeof metaBatchItemSchema>[];
      rows?: z.infer<typeof metaBatchItemSchema>[];
    };
    return obj.results ?? obj.rows ?? [];
  });

export type AiAllMetaBatchRawResult = {
  url: string;
  metaDescription: string;
  title?: string;
  faq?: string;
};

export type AiAllMetaRowPatch = {
  metaDescription: string;
  aiMeta: string;
  title?: string;
  aiTitle?: string;
  faq?: string;
};

function stripMarkdownFence(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return fence ? fence[1]!.trim() : t;
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFaqPairs(value: unknown): string {
  if (!Array.isArray(value) || !value.length) return "";

  const entries: FaqEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const question = asTrimmedString(row.question);
    const answer = asTrimmedString(row.answer);
    if (question) entries.push({ question, answer });
  }

  return entries.length ? serializeFaqEntriesPlain(entries) : "";
}

function normalizeResultItem(item: unknown): AiAllMetaBatchRawResult | null {
  if (!item || typeof item !== "object") return null;
  const p = item as Record<string, unknown>;
  const url = asTrimmedString(p.url) || asTrimmedString(p.page);
  const metaDescription =
    asTrimmedString(p.metaDescription) ||
    asTrimmedString(p.meta) ||
    asTrimmedString(p.description);
  if (!url || !metaDescription) return null;
  const title = asTrimmedString(p.title);
  const faq = normalizeFaqPairs(p.faqPairs) || asTrimmedString(p.faq);
  return {
    url,
    metaDescription,
    ...(title ? { title } : {}),
    ...(faq ? { faq } : {}),
  };
}

function normalizeResults(list: unknown[]): AiAllMetaBatchRawResult[] {
  const out: AiAllMetaBatchRawResult[] = [];
  for (const item of list) {
    const row = normalizeResultItem(item);
    if (row) out.push(row);
  }
  return out;
}

/**
 * Parse the meta batch model response. Throws on empty, non-JSON, or
 * off-schema output so a failed generation surfaces as an error instead of
 * an empty result that looks like "no metas to apply".
 */
export function parseAiAllMetaBatchJson(content: string): AiAllMetaBatchRawResult[] {
  const trimmed = stripMarkdownFence(content ?? "");
  if (!trimmed) {
    throw new Error("AI meta batch returned no content");
  }

  const jsonSlice = extractFirstBalancedJsonValue(trimmed) ?? trimmed;
  if (!jsonSlice.trim()) {
    throw new Error("AI meta batch returned no content");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonSlice) as unknown;
  } catch {
    throw new Error("AI meta batch response was not valid JSON");
  }

  const envelope = metaBatchEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    throw new Error("AI meta batch response did not match the results schema");
  }
  return normalizeResults(envelope.data);
}

export function aiAllMetaBatchResultsToMap(
  results: AiAllMetaBatchRawResult[],
  catalogByUrl: Map<string, AiAllMetaCatalogRow>,
): Map<string, AiAllMetaRowPatch> {
  const map = new Map<string, AiAllMetaRowPatch>();
  for (const r of results) {
    const key = normalizeOverviewKeywordUrlKey(r.url);
    const catalog = catalogByUrl.get(key);
    if (!catalog) continue;

    const metaDescription = r.metaDescription.trim();
    const patch: AiAllMetaRowPatch = {
      metaDescription,
      aiMeta: metaDescription,
    };

    if (catalog.includeTitle && r.title?.trim()) {
      const title = r.title.trim();
      patch.title = title;
      patch.aiTitle = title;
    }

    map.set(key, patch);
  }
  return map;
}
