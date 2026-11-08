import mammoth from "mammoth";
import type { CSVRow } from "./bulk-csv-parser";
import { parseImportedSectionsJson } from "./bulk-csv-parser";
import {
  collectImportedDraftLinksFromSections,
  dedupeImportedDraftLinks,
  extractImportedDraftLinksFromHtml,
  extractImportedDraftLinksFromMarkdown,
  htmlFragmentToBodyWithMarkdownLinks,
  type ImportedDraftLink,
} from "@/lib/bulk/blog-import-draft-links";

export const BLOG_IMPORT_ACCEPT_EXT = new Set(["docx", "md", "markdown", "html", "htm", "txt"]);
export const BLOG_IMPORT_FILE_ACCEPT = ".docx,.md,.markdown,.html,.htm,.txt";
export const SECTION_BODY_MAX_CHARS = 800;
export const MIN_IMPORTED_H2_SECTIONS = 2;

const HARNESS_MANAGED_IMPORT_H2 = /^(answer|overview|faq|frequently asked questions)$/i;

/** Strip markdown bold/hashes from an imported heading. */
export function stripImportedHeadingMarks(h2: string): string {
  return h2.replace(/\*+/g, "").replace(/^#+\s*/, "").trim();
}

/** Body H2s from a blog import. Skips Answer, Overview, and FAQ (harness chrome). */
export function importedBodyH2Outline(sections: ImportedBlogSection[] | undefined): string[] {
  if (!sections?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const section of sections) {
    const h2 = stripImportedHeadingMarks(section.h2);
    if (!h2 || HARNESS_MANAGED_IMPORT_H2.test(h2)) continue;
    const key = h2.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h2);
  }
  return out;
}

export type ImportedBlogSection = { h2: string; body: string };

export type ImportedBlogDraft = {
  title: string;
  sections: ImportedBlogSection[];
  /** HTML/markdown before the first H2 (H1 + intro paragraphs). */
  preambleHtml?: string;
  rawTextFallback?: string;
  links?: ImportedDraftLink[];
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "with",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "can",
  "about",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "under",
  "over",
  "again",
  "further",
  "then",
  "once",
  "here",
  "there",
  "when",
  "where",
  "why",
  "how",
  "all",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "just",
  "that",
  "this",
  "these",
  "those",
  "as",
  "its",
  "it",
  "your",
  "our",
  "their",
]);

export function isBlogImportFileAccepted(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return BLOG_IMPORT_ACCEPT_EXT.has(ext);
}

export function inferKeywordFromTitle(title: string): string {
  const words = title
    .replace(/[^\w\s$'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()));
  if (words.length === 0) return title.trim().slice(0, 60) || "blog topic";
  const take = Math.min(4, Math.max(2, words.length));
  return words.slice(0, take).join(" ").toLowerCase();
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function truncateBody(body: string, max = SECTION_BODY_MAX_CHARS): string {
  const t = body.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

function extractH1FromHtml(html: string): string | null {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m?.[1]) return null;
  const text = stripHtmlToText(m[1]);
  return text || null;
}

function extractPreambleBeforeFirstH2(html: string): string {
  const normalized = html.replace(/\r\n/g, "\n");
  const match = normalized.match(/<h2[\s>]/i);
  if (!match || match.index == null || match.index <= 0) return "";
  return normalized.slice(0, match.index).trim();
}

function splitHtmlIntoHeadingSections(html: string): ImportedBlogSection[] {
  const normalized = html.replace(/\r\n/g, "\n");
  const parts = normalized.split(/(?=<h[12][\s>])/i);
  const sections: ImportedBlogSection[] = [];

  for (const part of parts) {
    const headMatch = part.match(/^<(h[12])[^>]*>([\s\S]*?)<\/\1>/i);
    if (!headMatch) continue;
    const heading = stripHtmlToText(headMatch[2] ?? "");
    if (!heading) continue;
    const after = part.slice(headMatch[0].length);
    const body = htmlFragmentToBodyWithMarkdownLinks(after, Number.MAX_SAFE_INTEGER);
    sections.push({ h2: heading, body });
  }
  return sections;
}

function splitMarkdownIntoHeadingSections(text: string): ImportedBlogSection[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: ImportedBlogSection[] = [];
  let currentHeading: string | null = null;
  let bodyLines: string[] = [];

  const flush = () => {
    if (!currentHeading) return;
    sections.push({
      h2: currentHeading,
      body: bodyLines.join("\n").trim(),
    });
    bodyLines = [];
  };

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2?.[1]) {
      flush();
      currentHeading = h2[1].trim();
      continue;
    }
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1?.[1]) {
      flush();
      currentHeading = h1[1].trim();
      continue;
    }
    if (currentHeading) bodyLines.push(line);
  }
  flush();
  return sections;
}

function titleFromFilename(filename: string): string {
  return humanTitleFromImportFileName(filename);
}

/** Human-readable title from upload filename; skips generated export stems with timestamps. */
export function humanTitleFromImportFileName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").trim().replace(/\s+\(\d+\)$/, "");
  const exportMatch = base.match(
    /^(?:content|blueprint|blog-checklist|keyword-research-dfs|sem_rush)-(.+?)-\d{10,}$/i,
  );
  if (exportMatch?.[1]) {
    return exportMatch[1].replace(/-/g, " ").trim() || "Imported blog post";
  }
  return base || "Imported blog post";
}

function extractMarkdownPreambleBeforeFirstH2(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n");
  const match = normalized.match(/^#{1,2}\s+/m);
  if (!match || match.index == null || match.index <= 0) return "";
  return normalized.slice(0, match.index).trim();
}

function buildDraftFromHtml(html: string, filename: string, titleOverride?: string): ImportedBlogDraft {
  const h1 = extractH1FromHtml(html);
  const preambleHtml = extractPreambleBeforeFirstH2(html);
  const sections = splitHtmlIntoHeadingSections(html);
  const title =
    titleOverride?.trim() ||
    h1 ||
    sections[0]?.h2 ||
    titleFromFilename(filename);
  const docLinks = dedupeImportedDraftLinks(extractImportedDraftLinksFromHtml(html));
  const sectionLinks = collectImportedDraftLinksFromSections(sections);
  const links = dedupeImportedDraftLinks([...docLinks, ...sectionLinks]);
  return {
    title,
    sections,
    ...(preambleHtml ? { preambleHtml } : {}),
    rawTextFallback: stripHtmlToText(html).slice(0, 4000) || undefined,
    links: links.length ? links : undefined,
  };
}

export function parseImportedBlogHtml(html: string, filename: string, titleOverride?: string): ImportedBlogDraft {
  return buildDraftFromHtml(html, filename, titleOverride);
}

export function parseImportedBlogMarkdown(text: string, filename: string, titleOverride?: string): ImportedBlogDraft {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const h1Match = normalized.match(/^#\s+(.+)$/m);
  const preambleHtml = extractMarkdownPreambleBeforeFirstH2(normalized);
  const sections = splitMarkdownIntoHeadingSections(normalized);
  const title =
    titleOverride?.trim() ||
    h1Match?.[1]?.trim() ||
    sections[0]?.h2 ||
    titleFromFilename(filename);
  const links = dedupeImportedDraftLinks([
    ...extractImportedDraftLinksFromMarkdown(normalized),
    ...collectImportedDraftLinksFromSections(sections),
  ]);
  return {
    title,
    sections,
    ...(preambleHtml ? { preambleHtml } : {}),
    rawTextFallback: normalized.slice(0, 4000) || undefined,
    links: links.length ? links : undefined,
  };
}

export function validateImportedBlogDraft(draft: ImportedBlogDraft): void {
  if (draft.sections.length < MIN_IMPORTED_H2_SECTIONS) {
    throw new Error(
      `Need at least ${MIN_IMPORTED_H2_SECTIONS} H2 sections. Found ${draft.sections.length}. In Word, apply Heading 2 styles (not bold text only). For Markdown, use ## headings.`,
    );
  }
  for (const s of draft.sections) {
    if (!s.h2.trim()) {
      throw new Error("One or more H2 headings are empty after import.");
    }
  }
}

export async function parseBlogImportFile(
  file: File,
  options?: { titleOverride?: string; requireMinSections?: boolean },
): Promise<ImportedBlogDraft> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!BLOG_IMPORT_ACCEPT_EXT.has(ext)) {
    throw new Error(`Unsupported file type: .${ext}. Use .docx, .md, .html, or .txt`);
  }

  let draft: ImportedBlogDraft;

  if (ext === "docx") {
    const ab = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer: ab });
    const html = result.value || "";
    draft = buildDraftFromHtml(html, file.name, options?.titleOverride);
  } else if (ext === "html" || ext === "htm") {
    const html = await file.text();
    draft = buildDraftFromHtml(html, file.name, options?.titleOverride);
  } else {
    const text = await file.text();
    draft =
      ext === "md" || ext === "markdown" || /^##\s+/m.test(text)
        ? parseImportedBlogMarkdown(text, file.name, options?.titleOverride)
        : (() => {
            const asHtml = text.includes("<h2") ? buildDraftFromHtml(text, file.name, options?.titleOverride) : null;
            if (asHtml && asHtml.sections.length >= MIN_IMPORTED_H2_SECTIONS) return asHtml;
            return parseImportedBlogMarkdown(text, file.name, options?.titleOverride);
          })();
  }

  if (options?.requireMinSections !== false) {
    validateImportedBlogDraft(draft);
  }
  return draft;
}

export function buildPromptModifierFromImport(draft: ImportedBlogDraft): string {
  const outline = draft.sections
    .map((s, i) => `${i + 1}. ${s.h2}${s.body ? `\n   Body: ${s.body}` : ""}`)
    .join("\n");
  const linksBlock =
    draft.links?.length ?
      `\n\nMANDATORY SOURCE LINKS (preserve exact URL and anchor text in final copy):\n${draft.links.map((l) => `- [${l.anchorText}](${l.url})${l.h2 ? ` (${l.h2})` : ""}`).join("\n")}`
    : "";
  return `SOURCE DRAFT (blog import) — preserve factual claims, key data, and every hyperlink from the source draft; rewrite for SEO, NEO Pulse redirect density, internal links, and harness quality. Do not change H2 heading text.

Match the source author's tone and sophistication (tone analysis runs at processing start). Do not dumb down vocabulary or shift to generic SEO-blog voice.

${outline}${linksBlock}`;
}

export type BlogImportFeaturedImage = "y" | "n" | "google-maps";

export interface ImportedDraftToCsvRowOptions {
  featuredImage?: BlogImportFeaturedImage;
  entity?: string;
}

export function importedDraftToCsvRow(
  draft: ImportedBlogDraft,
  focusKeyword?: string,
  options?: ImportedDraftToCsvRowOptions,
): CSVRow {
  const keyword = focusKeyword?.trim() || inferKeywordFromTitle(draft.title);
  const featuredImage = options?.featuredImage ?? "y";
  const entity = options?.entity?.trim() || undefined;
  const links = draft.links?.length ? draft.links : collectImportedDraftLinksFromSections(draft.sections);
  return {
    keyword,
    title: draft.title,
    featuredImage,
    ...(entity ? { entity } : {}),
    imported_sections_json: JSON.stringify(draft.sections),
    ...(draft.preambleHtml?.trim()
      ? { imported_preamble_html: draft.preambleHtml.trim() }
      : {}),
    ...(links.length ? { imported_links_json: JSON.stringify(links) } : {}),
    prompt_modifier: buildPromptModifierFromImport(draft),
    keyword_questions_json: JSON.stringify(draft.sections.map((s) => s.h2)),
  };
}

/** Match imported section body for harness section prompts (normalized title compare). */
export function findImportedSectionBody(
  row: CSVRow,
  sectionTitle: string,
): string | undefined {
  const sections = parseImportedSectionsJson(row.imported_sections_json);
  if (!sections?.length) return undefined;
  const norm = (s: string) => stripImportedHeadingMarks(s).toLowerCase();
  const key = norm(sectionTitle);
  const hit = sections.find((s) => norm(s.h2) === key);
  return hit?.body?.trim() || undefined;
}
