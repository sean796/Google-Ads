/**
 * OpenRouter models sometimes emit pathologically long hyphen runs in Markdown pipe-table
 * separator rows (attempting to "align" with column width), producing multi‑hundred‑KB lines
 * and breaking readers - especially the Estimated Traffic Potential table (section 4).
 */

const DASH_ONLY_LINE = /^-{200,}$/;
/** Cells that are only alignment markers (colons + hyphens). */
const ALIGNMENT_CELL = /^(:?)(-+)(:?)$/;

function sanitizePipeTableSeparatorLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return line;
  const segments = trimmed.split("|");
  if (segments.length < 2) return line;
  const rebuilt: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (i === 0 || i === segments.length - 1) {
      rebuilt.push(segments[i]!);
      continue;
    }
    const inner = segments[i]!.trim();
    const m = inner.match(ALIGNMENT_CELL);
    if (m && m[2]!.length >= 4) {
      rebuilt.push(` ${m[1]!}---${m[3]!} `);
    } else {
      rebuilt.push(segments[i]!);
    }
  }
  return rebuilt.join("|");
}

function sanitizeMarkdownLineHyphenExplosion(line: string): string {
  const t = line.trim();
  if (DASH_ONLY_LINE.test(t)) return "---";
  if (!t.startsWith("|")) return line;
  // Pipe table separator / alignment rows use only | : - and whitespace
  if (!/^[\s|:-]+$/.test(t)) return line;
  return sanitizePipeTableSeparatorLine(line);
}

const LONG_LINK_LABEL = 36;
/** Standard Markdown links with http(s) destination (no spaces in URL). */
const MD_HTTP_LINK = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;

function normalizeHostPath(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function shouldPrettifyLinkLabel(text: string, href: string): boolean {
  const t = text.trim();
  if (t.length === 0) return false;
  if (t.length > LONG_LINK_LABEL) return true;
  if (t.includes("/")) return true;
  if (/^https?:\/\//i.test(t)) return true;
  try {
    const u = new URL(href);
    const path = u.pathname.replace(/\/$/, "") || "";
    const hostPath = `${u.hostname}${path}`;
    const nt = normalizeHostPath(t.replace(/^https?:\/\//i, ""));
    const hp = normalizeHostPath(hostPath);
    if (nt === hp) return true;
    if (hp.endsWith(nt) && nt.includes("/") && nt.length > 8) return true;
    if (t.includes(u.hostname) && path.length > 1) return true;
  } catch {
    return false;
  }
  return false;
}

function titleCaseWords(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

/**
 * CMS duplicate URLs often use `-2`, `-3` on the slug; visible titles may show "… 2".
 * When the path indicates a copy suffix, strip the matching trailing fragment from the label.
 */
export function stripDuplicatePageFragmentFromLabel(label: string, href: string): string {
  let t = label.trim();
  try {
    const u = new URL(href);
    const path = u.pathname.replace(/\/$/, "") || "";
    const seg = path.split("/").filter(Boolean).pop() ?? "";
    const decoded = decodeURIComponent(seg).replace(/\.(html?|php|aspx|jsp)$/i, "");
    const m = decoded.match(/-(\d{1,2})$/);
    if (!m) return t;
    const n = parseInt(m[1]!, 10);
    if (n < 2 || n > 99) return t;
    const re = new RegExp(`(?:\\s*\\(${n}\\)\\s*|\\s+[-–]\\s*${n}|\\s+${n})\\s*$`, "i");
    t = t.replace(re, "").trim();
  } catch {
    // ignore
  }
  return t;
}

/** Derive a short human label from the last path segment (or hostname for `/`). */
export function deriveShortLabelFromUrl(href: string): string | null {
  try {
    const u = new URL(href);
    const segments = u.pathname.split("/").filter(Boolean);
    let last = segments.length ? segments[segments.length - 1]! : "";
    last = last.replace(/\.(html?|php|aspx|jsp)$/i, "");
    if (!last) {
      const h = u.hostname.replace(/^www\./i, "");
      const first = h.split(".")[0] ?? "Home";
      return stripDuplicatePageFragmentFromLabel(titleCaseWords(first.replace(/[-_]+/g, " ")), href);
    }
    last = decodeURIComponent(last);
    const spaced = last.replace(/[-_]+/g, " ").trim();
    const title = titleCaseWords(spaced);
    const raw = title.length > 48 ? `${title.slice(0, 45)}…` : title;
    return stripDuplicatePageFragmentFromLabel(raw, href);
  } catch {
    return null;
  }
}

/**
 * Replace verbose `[text](url)` bracket text (paths, long host+path) with a short label from the URL slug.
 * Safe: skips short, human labels that do not look URL-like.
 */
export function prettifyMarkdownLinkLabels(md: string): string {
  return md.replace(MD_HTTP_LINK, (full, text: string, href: string) => {
    const afterPrettify = shouldPrettifyLinkLabel(text, href) ? deriveShortLabelFromUrl(href) ?? text : text;
    const out = stripDuplicatePageFragmentFromLabel(afterPrettify, href);
    if (out === text) return full;
    return `[${out}](${href})`;
  });
}

/**
 * LLMs sometimes emit HTML with inline color (e.g. green accents) or `<a href>`.
 * Reports should be plain Markdown: unwrap spans/fonts and normalize anchors to `[text](url)`.
 */
export function stripHtmlDecorations(md: string): string {
  let s = md;
  // <a href="https://..." ...>label</a> → [label](url)
  s = s.replace(
    /<a\s+[^>]*href\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>([^<]*)<\/a>/gi,
    (_, href: string, text: string) => `[${text.trim()}](${href})`,
  );
  // <span style="color:...">text</span> or class-based spans → text
  s = s.replace(/<span[^>]*>([^<]*)<\/span>/gi, "$1");
  s = s.replace(/<font[^>]*>([^<]*)<\/font>/gi, "$1");
  // ** [label](url) ** or **[label](url)** → [label](url) (no bold wrapper around links)
  s = s.replace(/\*\*\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*\*\*/g, "[$1]($2)");
  s = s.replace(/\*\*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\*\*/g, "[$1]($2)");
  return s;
}

function isPipeTableSeparatorRow(line: string): boolean {
  const t = line.trim();
  if (!t.startsWith("|")) return false;
  return /^[\s|:-]+$/.test(t);
}

function hrefLooksLikeCmsDuplicatePage(href: string): boolean {
  try {
    const u = new URL(href);
    const seg = u.pathname.split("/").filter(Boolean).pop() ?? "";
    const decoded = decodeURIComponent(seg).replace(/\.(html?|php|aspx|jsp)$/i, "");
    const m = decoded.match(/-(\d{1,2})$/);
    if (!m) return false;
    const n = parseInt(m[1]!, 10);
    return n >= 2 && n <= 30;
  } catch {
    return false;
  }
}

/** Hyphenated slug token ending in -2 … -30 (CMS duplicate copy); strip suffix for display or remove links. */
const DUPLICATE_SLUG_SUFFIX_TOKEN =
  /\b((?:[a-z0-9]+-)*[a-z0-9]+)-([2-9]|1[0-9]|2[0-9]|30)\b/gi;

/**
 * Remove trailing `-2`…`-30` from slug-like tokens in prose (models often paste duplicate paths).
 * Does not alter normal words like `step-1` if we excluded -1; only 2–30 matches CMS copy convention.
 */
export function stripTrailingDuplicateSlugSuffixFromText(text: string): string {
  return text.replace(DUPLICATE_SLUG_SUFFIX_TOKEN, (_full, base: string) => base);
}

/** Unwrap `[label](url)` to plain label when URL is a CMS duplicate (-2…-30 on last segment). */
function stripMarkdownLinksWithDuplicateCmsHrefs(md: string): string {
  return md.replace(MD_HTTP_LINK, (full, label: string, href: string) => {
    return hrefLooksLikeCmsDuplicatePage(href) ? label.trim() : full;
  });
}

/** Drop bare `https://…` URLs in prose when they point at duplicate CMS slugs. */
function stripBareDuplicateHttpUrls(md: string): string {
  return md.replace(/https?:\/\/[^\s)]+/g, (raw) => {
    const trimmed = raw.replace(/[.,;:!?]+$/g, "");
    return hrefLooksLikeCmsDuplicatePage(trimmed) ? "" : raw;
  });
}

function shouldDropPipeTableDataRow(line: string): boolean {
  const t = line.trim();
  if (!t.startsWith("|")) return false;
  if (isPipeTableSeparatorRow(t)) return false;

  const linkMatches = [...t.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)];
  for (const m of linkMatches) {
    if (hrefLooksLikeCmsDuplicatePage(m[1]!)) return true;
  }

  const lower = t.toLowerCase();
  if (/\bnot\s+available\b/.test(lower)) return true;
  if (/\bn\s*\/\s*a\b/.test(lower)) return true;
  if (/\btbd\b/.test(lower)) return true;
  if (/\bno\s+data\b/.test(lower)) return true;

  const parts = t.split("|").map((c) => c.trim());
  if (parts.length < 4) return false;
  const inner = parts.slice(1, -1);
  if (inner.length < 2) return false;

  const emptyish = (s: string) =>
    s === "" || s === " - " || s === "-" || s === "–" || /^[\s - \-–]+$/.test(s);

  const nonFirst = inner.slice(1);
  if (nonFirst.length === 0) return false;
  if (nonFirst.every(emptyish) && inner[0]!.length > 0) return true;

  const emptyCount = nonFirst.filter(emptyish).length;
  if (nonFirst.length >= 2 && emptyCount >= Math.ceil(nonFirst.length * 0.5)) return true;

  return false;
}

/**
 * Remove pipe-table rows that use placeholders or leave most metric cells empty (LLM fallback junk).
 * Applied to strategist/GSC section output after generation.
 */
export function stripDefectivePipeTableRows(md: string): string {
  return md
    .split("\n")
    .filter((line) => !shouldDropPipeTableDataRow(line))
    .join("\n");
}

/** Replace Unicode em dash (U+2014) with ASCII " - " for report readability (collapse adjacent spaces). */
function replaceEmDashWithAscii(md: string): string {
  return md.replace(/\s*\u2014\s*/g, " - ");
}

/** Apply to each strategist section body before stitch and downloads. */
export function sanitizeStrategistMarkdownSection(md: string): string {
  const emDashFixed = replaceEmDashWithAscii(md);
  const noDupLinks = stripMarkdownLinksWithDuplicateCmsHrefs(emDashFixed);
  const noBareDupUrls = stripBareDuplicateHttpUrls(noDupLinks);
  const slugSuffixStripped = stripTrailingDuplicateSlugSuffixFromText(noBareDupUrls);
  const lineFixed = slugSuffixStripped
    .split("\n")
    .map((line) => sanitizeMarkdownLineHyphenExplosion(line))
    .join("\n");
  const noHtml = stripHtmlDecorations(lineFixed);
  const noPlaceholders = stripDefectivePipeTableRows(noHtml);
  return prettifyMarkdownLinkLabels(noPlaceholders);
}
