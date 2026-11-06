import type { GscReportingSectionKind } from "@/lib/gsc-reporting/gsc-reporting-types";
import { normalizeReportingMarkdownLinks } from "@/lib/reporting/reporting-markdown-links";
import { sortGscReportMarkdownPipeTables } from "@/lib/gsc-reporting/gsc-reporting-table-sort";

/** Lossy cap so executive-facing sections stay scannable when the model ignores row limits. */
export const GSC_REPORT_MAX_TABLE_DATA_ROWS = 6;

function isPipeRow(line: string): boolean {
  return line.trimStart().startsWith("|");
}

function isPipeSeparatorRow(line: string): boolean {
  const t = line.trim();
  if (!t.startsWith("|")) return false;
  return /^[\s|:-]+$/.test(t);
}

/** Pipe tables and prose: anchors, not backtick URLs. */
export function unwrapMarkdownLinksInPipeTables(md: string): string {
  return normalizeReportingMarkdownLinks(md);
}

/** H1 uses title case (SEO Report), not all caps. */
export function normalizeReportDocumentHeadingCasing(md: string): string {
  const lines = md.split("\n");
  if (!lines[0]?.trimStart().startsWith("#")) return md;
  lines[0] = lines[0]
    .replace(/ - SEO REPORT - /g, " - SEO Report - ")
    .replace(/ - PPC REPORT - /g, " - PPC Report - ");
  return lines.join("\n");
}

/** Remove ### through ###### lines (Executive Summary keeps ### Key Insights). */
export function stripMarkdownHeadingsH3ThroughH6(md: string): string {
  return md
    .split("\n")
    .filter((line) => !/^\s{0,3}#{3,6}(\s|$)/.test(line))
    .join("\n");
}

/** Drop pipe tables that only have header + separator (no data rows). */
export function stripEmptyPipeTables(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (isPipeRow(line) && i + 1 < lines.length && isPipeSeparatorRow(lines[i + 1]!)) {
      const header = line;
      const sep = lines[i + 1]!;
      let j = i + 2;
      const dataRows: string[] = [];
      while (j < lines.length && isPipeRow(lines[j]!) && !isPipeSeparatorRow(lines[j]!)) {
        dataRows.push(lines[j]!);
        j++;
      }
      if (dataRows.length === 0) {
        i = j;
        continue;
      }
      out.push(header, sep, ...dataRows);
      i = j;
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join("\n");
}

/** Keep header + separator + first N data rows per pipe table block. */
export function capPipeTableDataRows(md: string, maxDataRows: number): string {
  if (maxDataRows < 1) return md;
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (isPipeRow(line) && i + 1 < lines.length && isPipeSeparatorRow(lines[i + 1]!)) {
      const header = line;
      const sep = lines[i + 1]!;
      const dataRows: string[] = [];
      let j = i + 2;
      while (j < lines.length && isPipeRow(lines[j]!) && !isPipeSeparatorRow(lines[j]!)) {
        dataRows.push(lines[j]!);
        j++;
      }
      const capped = dataRows.slice(0, maxDataRows);
      out.push(header, sep, ...capped);
      i = j;
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join("\n");
}

function shouldSkipKeywordQuoteLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith("|") || t.startsWith("```");
}

/** Queries/keywords: bold labels, not "quotes" (client-facing reports). */
export function normalizeKeywordQuotesToBold(md: string): string {
  const quoteToBold = (text: string): string => {
    let s = text;
    s = s.replace(/"([^"\n|]{2,120})"/g, (match, inner: string) => {
      if (/https?:\/\//i.test(inner)) return match;
      if (inner.includes("**")) return match;
      return `**${inner.trim()}**`;
    });
    s = s.replace(/\u201c([^\u201d\n|]{2,120})\u201d/g, (match, inner: string) => {
      if (/https?:\/\//i.test(inner)) return match;
      if (inner.includes("**")) return match;
      return `**${inner.trim()}**`;
    });
    s = s.replace(/'([^'\n|]{3,120})'/g, (match, inner: string) => {
      if (/https?:\/\//i.test(inner)) return match;
      if (inner.includes("**")) return match;
      if (/\w'\w/.test(match)) return match;
      return `**${inner.trim()}**`;
    });
    s = s.replace(/\*\*"([^"]+)"\*\*/g, "**$1**");
    s = s.replace(/\*\*\u201c([^\u201d]+)\u201d\*\*/g, "**$1**");
    s = s.replace(/\*\*'([^']+)'\*\*/g, "**$1**");
    return s;
  };

  return md
    .split("\n")
    .map((line) => (shouldSkipKeywordQuoteLine(line) ? line : quoteToBold(line)))
    .join("\n");
}

/** GFM unordered lists: normalize dash bullets to asterisk (consistent client-facing reports). */
export function normalizeGscReportUnorderedListMarkers(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith("|")) return line;
      if (/^#{1,6}\s/.test(trimmed)) return line;
      return line.replace(/^(\s{0,3})-\s+/, "$1* ");
    })
    .join("\n");
}

/** Drop pipe rows that are prose stuffed into the first cell (empty metric columns). */
export function stripProseRowsFromPipeTables(md: string): string {
  return md
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t.startsWith("|") || /^[\s|:\-\\]+$/.test(t)) return true;
      const inner = t.split("|").slice(1, -1).map((c) => c.trim());
      if (inner.length < 2) return true;
      const [first, ...rest] = inner;
      if (!first || first.length < 24) return true;
      if (rest.some((c) => c.length > 0)) return true;
      return false;
    })
    .join("\n");
}

/** Remove list lines (model must not repeat injected GA month tables). */
export function stripMarkdownBulletListLines(md: string): string {
  return md
    .split("\n")
    .filter((line) => !/^\s*(\*|-|\d+\.)\s+/.test(line))
    .join("\n");
}

export function stripHistoricalComparisonNoteLines(md: string): string {
  return md
    .split("\n")
    .filter((line) => !/^Note:\s*As more reporting periods/i.test(line.trim()))
    .join("\n");
}

/** Deterministic cleanup after model sanitize; kind-aware heading strip. */
export function applyGscReportingMarkdownPost(
  md: string,
  kind: GscReportingSectionKind,
): string {
  let s = md;
  if (kind !== "executive_summary") {
    s = stripMarkdownHeadingsH3ThroughH6(s);
  }
  s = stripProseRowsFromPipeTables(s);
  s = stripEmptyPipeTables(s);
  s = capPipeTableDataRows(s, GSC_REPORT_MAX_TABLE_DATA_ROWS);
  s = normalizeReportingMarkdownLinks(s);
  s = normalizeGscReportUnorderedListMarkers(s);
  s = normalizeKeywordQuotesToBold(s);
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

/** Table footnotes that repeat the report H1 date range (period is already in the title). */
export function stripRedundantReportPeriodFootnotes(md: string): string {
  return md
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (/^_Period:\s*.+_\s*$/i.test(t)) return false;
      if (/^_Period:\s*.+\s*_\s*$/i.test(t)) return false;
      if (/^Period:\s+.+\s+to\s+.+\d{4}\s*\.?\s*$/i.test(t)) return false;
      return true;
    })
    .join("\n");
}

/** Final pass on assembled report markdown (lists + table hygiene). */
export function applyGscReportingFinalMarkdownPost(md: string): string {
  let s = normalizeReportDocumentHeadingCasing(md);
  s = sortGscReportMarkdownPipeTables(s);
  s = stripProseRowsFromPipeTables(s);
  s = stripRedundantReportPeriodFootnotes(s);
  s = normalizeReportingMarkdownLinks(s);
  s = normalizeGscReportUnorderedListMarkers(s);
  s = normalizeKeywordQuotesToBold(s);
  return s.replace(/\n{3,}/g, "\n\n").trim();
}
