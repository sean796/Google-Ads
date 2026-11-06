import mammoth from "mammoth";
import { z } from "zod";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { parseModelJson } from "@/lib/model-json";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { serializeModifierLinksJson } from "@/lib/bulk/bulk-csv-parser";
import {
  importedDraftToCsvRow,
  humanTitleFromImportFileName,
  type ImportedBlogDraft,
  type ImportedBlogSection,
} from "@/lib/bulk/blog-import-parser";
import type { BlogImportFormState } from "@/lib/bulk/blog-import-parse";
import {
  collectImportedDraftLinksFromSource,
  importedDraftLinkUrls,
} from "@/lib/bulk/blog-import-draft-links";
import {
  META_DESCRIPTION_ANTI_CLICKBAIT_RULE,
  TITLE_ANTI_CLICKBAIT_RULE,
  TITLE_CASE_RULE,
  TITLE_WELL_KNOWN_ACRONYMS_RULE,
} from "@/lib/prompt-builders/title-rules";

export async function readBlogImportFileHtml(file: File): Promise<string | null> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "docx") {
    const ab = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer: ab });
    return result.value?.trim() ?? null;
  }
  if (ext === "html" || ext === "htm") {
    const html = await file.text();
    return html.trim() || null;
  }
  return null;
}

export async function readBlogImportFileText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "docx") {
    const ab = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: ab });
    return result.value?.trim() ?? "";
  }
  return file.text();
}

const EXTRACT_SYSTEM = `You structure blog drafts for an SEO rewrite pipeline. Read the full document and return JSON only.

Rules:
- title: Write a NEW SEO post title from the document topic and filename intent. Do not copy the filename. Do not paste the source H1 verbatim unless it is already a complete blog headline. Drop file-status words (FINAL, DRAFT) and department codes (HR). Keep person names and the topic. If the file is part of a numbered series of similar content (1 of 2, Part 2), use Series Topic: This Part Angle, Pt N. The series topic comes from the filename (not a unique invented headline per file). One colon after the series topic. All parts share that series topic.
- keyword: Primary focus keyword phrase (2-4 words, lowercase, geography-free unless the document is explicitly local).
- meta_description: Compelling meta description, 120-160 characters, grounded in the document.
- sections: Include EVERY heading in document order (title/H1 and every section H2). None may be omitted.
- Preserve heading text verbatim in sections[].h2.
- sections[].body: full section content as plain text (no truncation).
- Need at least 2 sections with non-empty h2.

Return JSON:
{"title":"string","keyword":"string","meta_description":"string","sections":[{"h2":"string","body":"string"}]}`;

type BlogImportAiExtract = {
  title: string;
  keyword: string;
  meta_description: string;
  sections: ImportedBlogSection[];
};

const BlogImportAiExtractSchema = z.object({
  title: z.string().nullish(),
  keyword: z.string().nullish(),
  meta_description: z.string().nullish(),
  sections: z
    .array(
      z.object({
        h2: z.string().nullish(),
        body: z.string().nullish(),
      }),
    )
    .nullish(),
});

function parseBlogImportAiExtract(content: string): BlogImportAiExtract {
  const parsed = parseModelJson(content, BlogImportAiExtractSchema, "blog import extract");

  const sections = (parsed.sections ?? [])
    .map((s) => ({
      h2: (s.h2 ?? "").trim(),
      body: (s.body ?? "").trim(),
    }))
    .filter((s) => s.h2);

  const title = (parsed.title ?? "").trim();
  const keyword = (parsed.keyword ?? "").trim();
  const meta_description = (parsed.meta_description ?? "").trim();

  if (!title || !keyword) {
    throw new Error("AI could not extract title and keyword from the document");
  }
  if (sections.length < 2) {
    throw new Error(
      `Found ${sections.length} heading(s). Need at least 2 headings in the document.`,
    );
  }

  return { title, keyword, meta_description, sections };
}

const DIRECT_META_SYSTEM = `You write WordPress post meta for a finished blog that will be published as written. Do not rewrite the body. Return JSON only.

${TITLE_CASE_RULE}

${TITLE_ANTI_CLICKBAIT_RULE}

${TITLE_WELL_KNOWN_ACRONYMS_RULE}

${META_DESCRIPTION_ANTI_CLICKBAIT_RULE}

Rules:
- title: a NEW publishable blog headline from the filename intent plus this document. Do not copy the raw filename. Do not paste the source H1 verbatim unless it is already a complete blog headline. Drop file-status words (FINAL, DRAFT, COPY) and department codes (HR).
- Numbered series of similar content (filename has 1 of 2, 2 of 3, Part 1, Pt 2, and so on): this is a series, not two unrelated posts.
  - Series topic: take the shared topic phrase from the filename after dropping status words, department codes, internal owner labels, and the part numbers. Do not invent a different series name per file. Do not drop that series topic from the title.
  - Title shape (mandatory, one colon): Series Topic: This Part Angle, Pt N
  - The clause after the colon is unique to THIS document. It must not repeat the series topic. It must not be a standalone SEO headline that ignores the series name.
  - keyword: the series topic in lowercase. Every part of the same series uses that same keyword. Do not invent a different focus keyword per part.
  - slug: series topic hyphenated, then -ptN only (series-topic-pt1). Never slugify the clause after the colon. Never use the full title as the URL.
- Not a series: one flowing headline, no colon required. keyword is this document's 2-4 word focus phrase. slug from the title.
- meta_description: 120-160 characters, grounded in THIS document, includes the keyword.

Return JSON:
{"title":"string","keyword":"string","meta_description":"string","slug":"string"}`;

export type DirectImportMeta = {
  title: string;
  keyword: string;
  meta_description: string;
  slug: string;
};

/** Numeric series part from "1 of 2" or "Part 2" in a filename. */
export function importSeriesPartFromFileName(filename: string): number | undefined {
  const ofMatch = filename.match(/\b(\d+)\s*(?:of|\/)\s*(\d+)\b/i);
  if (ofMatch?.[1]) return Number(ofMatch[1]);
  const ptMatch = filename.match(/\b(?:part|pt)\s+(\d+)\b/i);
  if (ptMatch?.[1]) return Number(ptMatch[1]);
  return undefined;
}

function sanitizeDirectImportSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function seriesRootPlusPartSlug(title: string, part: number): string {
  const colonAt = title.indexOf(":");
  const root = sanitizeDirectImportSlug(colonAt >= 0 ? title.slice(0, colonAt) : title);
  if (!root) {
    throw new Error("Series title has no topic before the colon");
  }
  return `${root}-pt${part}`;
}

const DirectImportMetaSchema = z.object({
  title: z.string().nullish(),
  keyword: z.string().nullish(),
  meta_description: z.string().nullish(),
  slug: z.string().nullish(),
});

export function parseDirectImportMeta(content: string, filename: string): DirectImportMeta {
  const parsed = parseModelJson(content, DirectImportMetaSchema, "blog import meta");

  const title = (parsed.title ?? "").trim();
  const keyword = (parsed.keyword ?? "").trim();
  const meta_description = (parsed.meta_description ?? "").trim();
  let slug = sanitizeDirectImportSlug(parsed.slug ?? "");

  if (!title || !keyword || !meta_description) {
    throw new Error("OpenRouter meta agent did not return title, keyword, and meta_description");
  }

  const part = importSeriesPartFromFileName(filename);
  if (part != null) {
    if (!title.includes(":")) {
      throw new Error(`OpenRouter series title must use Series Topic: Part Angle, Pt ${part}`);
    }
    if (!new RegExp(`\\bPt\\s*${part}\\b`, "i").test(title)) {
      throw new Error(`OpenRouter series title must include Pt ${part} for ${filename}`);
    }
    slug = seriesRootPlusPartSlug(title, part);
  } else if (!slug) {
    throw new Error("OpenRouter meta agent did not return a slug");
  }

  return { title, keyword, meta_description, slug };
}

export async function extractDirectImportMetaViaOpenRouter(
  file: File,
  form: BlogImportFormState,
  openRouterApiKey: string,
  model?: string,
): Promise<DirectImportMeta> {
  const apiKey = openRouterApiKey.trim();
  if (!apiKey) {
    throw new Error("OpenRouter API key is required for Direct import meta");
  }

  const rawText = await readBlogImportFileText(file);
  if (!rawText.trim()) {
    throw new Error("File is empty or could not be read as text");
  }

  const override = form.titleOverride.trim();
  const focus = form.focusKeyword.trim();
  const userParts = [`File: ${file.name}`];
  if (importSeriesPartFromFileName(file.name) != null) {
    userParts.push(
      "This file is a numbered series part of similar content. Title shape: Series Topic: This Part Angle, Pt N. Series topic comes from this filename. Same keyword for every part of the series. One colon after the series topic. Slug is series-topic-ptN only, not the full title.",
    );
  }
  if (override) {
    userParts.push(
      `Title override (use as the post title; still add Pt N if this file is a series part and the override lacks it): ${override}`,
    );
  }
  if (focus) userParts.push(`Focus keyword override: ${focus}`);
  userParts.push("", "Document:", rawText.slice(0, 120_000));

  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model: model || getResearchModel(),
    system: DIRECT_META_SYSTEM,
    user: userParts.join("\n"),
    maxTokens: 800,
    temperature: 0.2,
    responseFormat: { type: "json_object" },
  });

  const meta = parseDirectImportMeta(content, file.name);
  return {
    title: meta.title,
    keyword: focus || meta.keyword,
    meta_description: meta.meta_description,
    slug: meta.slug,
  };
}

function collectImportLinkUrls(rawText: string, html: string | null): string[] {
  return importedDraftLinkUrls(
    collectImportedDraftLinksFromSource({
      markdown: rawText,
      html: html ?? undefined,
    }),
  );
}

function rowFromAiExtract(
  extract: BlogImportAiExtract,
  form: BlogImportFormState,
  linkUrls: string[],
): CSVRow {
  const title = form.titleOverride.trim() || extract.title;
  const keyword = form.focusKeyword.trim() || extract.keyword;
  const draft: ImportedBlogDraft = {
    title,
    sections: extract.sections,
    links: linkUrls.length
      ? linkUrls.map((url) => ({ url, anchorText: url }))
      : undefined,
  };

  const row = importedDraftToCsvRow(draft, keyword, {
    featuredImage: form.featuredImageMode,
    entity: form.featuredImageMode === "google-maps" ? form.entity.trim() : undefined,
  });

  return {
    ...row,
    title,
    keyword,
    meta_description: extract.meta_description || undefined,
    ...(linkUrls.length > 0
      ? { modifier_links_json: serializeModifierLinksJson(linkUrls) }
      : {}),
  };
}

export async function extractBlogImportViaOpenRouter(
  file: File,
  form: BlogImportFormState,
  openRouterApiKey: string,
  model?: string,
): Promise<CSVRow> {
  const apiKey = openRouterApiKey.trim();
  if (!apiKey) {
    throw new Error("OpenRouter API key is required to import blog files");
  }

  const rawText = await readBlogImportFileText(file);
  if (!rawText.trim()) {
    throw new Error("File is empty or could not be read as text");
  }

  const html = await readBlogImportFileHtml(file);
  const linkUrls = collectImportLinkUrls(rawText, html);

  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model: model || getResearchModel(),
    system: EXTRACT_SYSTEM,
    user: `File: ${file.name}\n\n${rawText.slice(0, 120_000)}`,
    maxTokens: 8000,
    temperature: 0.2,
    responseFormat: { type: "json_object" },
  });

  const extract = parseBlogImportAiExtract(content);
  return rowFromAiExtract(extract, form, linkUrls);
}

export function buildBlogImportPlaceholderRow(
  fileName: string,
  form: BlogImportFormState,
): CSVRow {
  const title = form.titleOverride.trim() || humanTitleFromImportFileName(fileName);
  return {
    keyword: form.focusKeyword.trim(),
    title,
    featuredImage: form.featuredImageMode,
    ...(form.featuredImageMode === "google-maps" && form.entity.trim()
      ? { entity: form.entity.trim() }
      : {}),
  };
}

export async function buildBlogImportRowFromFile(
  file: File,
  form: BlogImportFormState,
  openRouterApiKey: string,
  model?: string,
): Promise<CSVRow> {
  return extractBlogImportViaOpenRouter(file, form, openRouterApiKey, model);
}

export async function resolveBlogImportRowViaOpenRouter(
  file: File,
  form: BlogImportFormState,
  openRouterApiKey: string,
  model?: string,
): Promise<CSVRow> {
  return extractBlogImportViaOpenRouter(file, form, openRouterApiKey, model);
}
