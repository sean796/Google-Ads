import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { getCompetitorReportMaxOutputTokens } from "@/lib/competitor-research/competitor-report-openrouter-limits";
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import { sanitizeWordPressSlugSegment } from "@/lib/rank-math-redirect-csv";
import {
  appendMasterInstructionsToSystemPrompt,
  buildSapMasterRulesWorkflowPrefix,
  ensureMasterInstructionsInMemory,
} from "@/lib/master-instructions-storage";

const SLUG_FILL_CHUNK = 10;

const BLOG_SLUG_AGENT_SYSTEM = `You are a URL slug agent for WordPress blog posts and service-area (SAP) pages.

Output **only** valid JSON: {"slugs":["..."]} with **exactly one** slug per input row in \`rows[]\`, same order.

Each row has \`title\` and \`keyword\`. \`entity\` may be empty (local landmark or city — use it only when it appears in the title).

**Slug rules (mandatory):**
- **Primary source is \`title\`**, not the raw keyword. The slug must match what a reader expects from the title (service + location).
- **Forbidden in slugs:** keyword-only dumps, news or political tokens, year noise, or any phrase that does **not** appear in the title (e.g. electoral redistribution when the title says window treatments near Sherwood Park).
- Lowercase, hyphen-separated \`[a-z0-9-]\` only. Every word token must be separated by hyphens.
- **Forbidden:** concatenating words into one token (e.g. hunterdouglastopdown), copying the full title verbatim, leading/trailing hyphens.
- As short as reasonable. Drop glue words (the, for, and, a, near).
- Max 80 characters. No file extension, no path, no domain.`;

type SlugAgentResponse = {
  slugs?: unknown;
};

function slugFallbackFromRow(row: CSVRow): string {
  const fromTitle = sanitizeWordPressSlugSegment(
    (row.title ?? "").trim().toLowerCase().replace(/\s+/g, "-"),
  );
  if (fromTitle.length >= 2) return fromTitle.slice(0, 80);
  const kw = (row.keyword ?? "").trim();
  const fromKw = sanitizeWordPressSlugSegment(kw.replace(/\s+/g, "-").toLowerCase());
  if (fromKw.length >= 2) return fromKw.slice(0, 80);
  return "blog-post";
}

function slugsFromOpenRouterContent(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as SlugAgentResponse;
    if (!Array.isArray(parsed.slugs)) return [];
    return parsed.slugs.map((s) => sanitizeWordPressSlugSegment(String(s ?? "")));
  } catch {
    return [];
  }
}

async function fetchSlugsBatch(
  apiKey: string,
  model: string,
  siteId: string | undefined,
  rows: CSVRow[],
): Promise<string[]> {
  if (rows.length === 0) return [];
  await ensureMasterInstructionsInMemory(siteId);
  const payload = rows.map((row) => ({
    title: (row.title ?? "").trim(),
    keyword: (row.keyword ?? "").trim(),
    entity: (row.entity ?? "").trim(),
  }));
  const systemForModel = appendMasterInstructionsToSystemPrompt(
    `${buildSapMasterRulesWorkflowPrefix(siteId ?? null)}${BLOG_SLUG_AGENT_SYSTEM}`,
    siteId ?? null,
  );

  const response = await postOpenRouterAppChatFetch({
    method: "POST",
    headers: openRouterWebAppHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemForModel },
        { role: "user", content: JSON.stringify({ rows: payload }) },
      ],
      temperature: 0.2,
      max_tokens: getCompetitorReportMaxOutputTokens(model),
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    return rows.map((row) => slugFallbackFromRow(row));
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "";
  const slugs = slugsFromOpenRouterContent(raw);
  const out: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    let slug = (slugs[i] ?? "").trim();
    if (slug.length < 2) {
      slug = slugFallbackFromRow(rows[i]!);
    }
    out.push(slug);
  }
  return out;
}

export type FillBlogRowSlugOptions = {
  apiKey: string;
  model: string;
  siteId?: string;
  onProgress?: (done: number, total: number) => void;
};

/** One OpenRouter pass per chunk: blog post URL slugs from title + keyword. */
export async function fillBlogRowSlugFromOpenRouter(
  rows: CSVRow[],
  options: FillBlogRowSlugOptions,
): Promise<CSVRow[]> {
  if (rows.length === 0) return rows;
  const apiKey = options.apiKey.trim();
  const model = options.model.trim();
  const out = rows.map((r) => ({ ...r, target_slug: undefined as string | undefined }));
  const total = out.length;

  const chunkStarts: number[] = [];
  for (let chunkStart = 0; chunkStart < total; chunkStart += SLUG_FILL_CHUNK) {
    chunkStarts.push(chunkStart);
  }

  await Promise.all(
    chunkStarts.map(async (chunkStart) => {
      const chunkIndices = Array.from(
        { length: Math.min(SLUG_FILL_CHUNK, total - chunkStart) },
        (_, j) => chunkStart + j,
      );
      const chunkRows = chunkIndices.map((i) => out[i]!);
      let slugs: string[];
      try {
        slugs = await fetchSlugsBatch(apiKey, model, options.siteId, chunkRows);
      } catch {
        slugs = chunkRows.map((row) => slugFallbackFromRow(row));
      }
      for (let i = 0; i < chunkIndices.length; i++) {
        const idx = chunkIndices[i]!;
        out[idx] = { ...out[idx]!, target_slug: slugs[i] };
      }
      options.onProgress?.(
        out.filter((r) => (r.target_slug ?? "").trim().length >= 2).length,
        total,
      );
    }),
  );

  return out;
}
