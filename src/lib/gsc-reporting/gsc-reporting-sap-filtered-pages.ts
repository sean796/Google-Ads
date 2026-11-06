import Papa from "papaparse";
import { GSC_PAGES_PERIOD_FILENAME } from "@/lib/gsc-reporting/gsc-reporting-monthly-totals";
import { parseCanadianNumber, splitCsvLine } from "@/lib/gsc-reporting/gsc-number-format";
import {
  SAP_FILTERED_PAGES_MAX_CHARS,
  buildAllowlistPathnameSet,
  dedupeSapAllowlistUrls,
  pathnameKeyFromUrl,
  pathnameMatchesSapLocalOrEntityArea,
  siteOriginFromPublicUrl,
  type SapEntityGrounding,
} from "@/lib/gsc-reporting/gsc-reporting-sap-allowlist-helpers";

function pageUrlsFromPeriodCsv(csvText: string): string[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  const headerIdx = lines.findIndex((l) => /^Page,/i.test(l.trimStart()));
  if (headerIdx < 0) return [];
  const out: string[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const page = splitCsvLine(lines[i]!)[0]?.trim();
    if (page) out.push(page);
  }
  return out;
}

function pageUrlsFromMomCsv(csvText: string): string[] {
  const lines = csvText.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i]!.trim().startsWith("#")) i++;
  const parsed = Papa.parse<Record<string, string>>(lines.slice(i).join("\n"), {
    header: true,
    skipEmptyLines: true,
  });
  const pageKey = parsed.meta.fields?.find((h) => h.trim().toLowerCase() === "page");
  if (!pageKey) return [];
  const out: string[] = [];
  for (const row of parsed.data ?? []) {
    const page = String(row[pageKey] ?? "").trim();
    if (page) out.push(page);
  }
  return out;
}

/** Add local service area page URLs from GSC Pages exports (e.g. /location/cochrane/). */
export function expandSapAllowlistFromPagesFiles(args: {
  allowlistUrls: string[];
  files: { name: string; content: string }[];
  publicSiteUrl: string;
}): string[] {
  const origin = siteOriginFromPublicUrl(args.publicSiteUrl).toLowerCase();
  const merged = [...args.allowlistUrls];
  for (const f of args.files) {
    const n = f.name.trim();
    const isPeriod = n === GSC_PAGES_PERIOD_FILENAME;
    const isMom = isPagesMomReportingFile(f.name, f.content);
    if (!isPeriod && !isMom) continue;
    const pages = isPeriod ? pageUrlsFromPeriodCsv(f.content) : pageUrlsFromMomCsv(f.content);
    for (const page of pages) {
      try {
        if (origin && new URL(page).origin.toLowerCase() !== origin) continue;
      } catch {
        continue;
      }
      const pk = pathnameKeyFromUrl(page);
      if (pathnameMatchesSapLocalOrEntityArea(pk)) merged.push(page);
    }
  }
  return dedupeSapAllowlistUrls(merged);
}

/** Full SAP allowlist: sitemaps then GSC Pages paths for local/entity landings. */


/** Pages MoM bundle file from fetch or uploads with the same naming pattern. */
export function isPagesMomReportingFile(name: string, content?: string): boolean {
  const n = name.toLowerCase();
  if (n === "pages-mom.csv" || (n.includes("pages") && n.includes("mom"))) return true;
  if (content !== undefined && /#\s*Pages:\s*MoM/i.test(content)) return true;
  return false;
}

function stripLeadingCommentLines(text: string): string {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim().startsWith("#")) i++;
  return lines.slice(i).join("\n");
}

function parsePrimaryImpressions(fields: string[], row: Record<string, unknown>): number {
  const imprKey = fields.find((f) => /^\s*Impressions\s+\(/i.test(f.trim()));
  if (!imprKey) return 0;
  const raw = row[imprKey];
  const s = String(raw ?? "")
    .trim()
    .replace(/,/g, "");
  if (s === "" || s === "-" || s === "–" || s === "—") return 0;
  const n = parseFloat(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**

 * Build FILTERED_PAGES_FOR_SAP CSV body from Pages MoM exports in `files`.
 */
export function buildSapFilteredPagesEvidence(args: {
  files: { name: string; content: string }[];
  allowlistUrls: string[];
  maxChars?: number;
}): string {
  const maxChars = args.maxChars ?? SAP_FILTERED_PAGES_MAX_CHARS;
  const pathKeys = buildAllowlistPathnameSet(args.allowlistUrls);
  if (pathKeys.size === 0) return "";

  const pagesFiles = args.files.filter((f) => isPagesMomReportingFile(f.name, f.content));
  if (pagesFiles.length === 0) return "";

  const blocks: string[] = [];

  for (const f of pagesFiles) {
    const withoutComments = stripLeadingCommentLines(f.content);
    const parsed = Papa.parse<Record<string, string>>(withoutComments, {
      header: true,
      skipEmptyLines: true,
    });
    const fields = parsed.meta.fields?.map((h) => String(h)) ?? [];
    if (!fields.some((h) => h.trim().toLowerCase() === "page")) continue;

    const pageKey = fields.find((h) => h.trim().toLowerCase() === "page");
    if (!pageKey) continue;

    const rows = (parsed.data ?? []).filter((r) => r && typeof r === "object");
    const matched: Record<string, unknown>[] = [];
    for (const r of rows) {
      const pageCell = String((r as Record<string, unknown>)[pageKey] ?? "").trim();
      if (!pageCell) continue;
      const pk = pathnameKeyFromUrl(pageCell);
      if (pk && pathKeys.has(pk)) matched.push(r as Record<string, unknown>);
    }

    matched.sort((a, b) => {
      const clkKey = fields.find((f) => /^\s*Clicks\s+\(/i.test(f.trim()));
      if (clkKey) {
        const na = parseCanadianNumber(String(a[clkKey] ?? "").trim());
        const nb = parseCanadianNumber(String(b[clkKey] ?? "").trim());
        if (Number.isFinite(na) && Number.isFinite(nb) && nb !== na) return nb - na;
      }
      return parsePrimaryImpressions(fields, b) - parsePrimaryImpressions(fields, a);
    });

    const preamble = [
      `# Filtered from ${f.name}: entity + local service area URL pathnames only.`,
      `#`,
    ].join("\n");

    const body =
      matched.length === 0
        ? "# No Page rows in this file matched entity allowlist pathnames."
        : Papa.unparse({ fields, data: matched });

    blocks.push(`${preamble}\n${body}`);
  }

  let out = blocks.join("\n\n---\n\n");
  if (out.length > maxChars) {
    out =
      out.slice(0, maxChars) +
      `\n\n[…truncated FILTERED_PAGES_FOR_SAP to ${maxChars} characters; rows sorted by primary-period impressions…]`;
  }
  return out.trim();
}

export function buildSapEntityGrounding(args: {
  files: { name: string; content: string }[];
  allowlistUrls: string[];
  sourceLabel: string;
  publicSiteUrl: string;
  maxFilteredChars?: number;
}): SapEntityGrounding {
  void args.publicSiteUrl;
  const filteredPagesEvidence = buildSapFilteredPagesEvidence({
    files: args.files,
    allowlistUrls: args.allowlistUrls,
    maxChars: args.maxFilteredChars,
  });
  return {
    sourceLabel: args.sourceLabel.trim() || "Entity sitemap",
    allowlistUrls: [...args.allowlistUrls],
    filteredPagesEvidence,
  };
}

const SAP_ALLOWLIST_CHUNK_MAX_CHARS = 5_000;

/**
 * Instruction block pinned ahead of retrieval so the SAP writer grounds on entity URLs only.
 */
export function buildSapEntityAllowlistChunkText(grounding: SapEntityGrounding): string {
  const n = grounding.allowlistUrls.length;
  if (n === 0) {
    return [
      "--- BLOCK: ENTITY_SITEMAP_ALLOWLIST ---",
      `Source label: ${grounding.sourceLabel}`,
      "NO resolved entity sitemap URLs for this property.",
      "Do not build a SAP Page performance table from generic Pages MoM rows (homepage, retail-store, blog, etc.). State briefly that entity sitemap URLs could not be loaded. Omit the pipe table.",
    ].join("\n");
  }
  const header = [
    "--- BLOCK: ENTITY_SITEMAP_ALLOWLIST ---",
    `Source: ${grounding.sourceLabel}`,
    `Allowlist: ${n} URLs (entity sitemap + **service area sitemap** + local landings). SAP **Page** table rows must use **only** URLs from this list (pathname match).`,
    "Ignore other Pages CSV rows elsewhere in RETRIEVED DATA for the SAP table.",
    "Do not repeat query-theme bullets from other sections in SAP.",
    "",
    "URLs:",
  ].join("\n");
  let body = grounding.allowlistUrls.join("\n");
  const cap = Math.max(500, SAP_ALLOWLIST_CHUNK_MAX_CHARS - header.length - 80);
  if (body.length > cap) {
    body = `${body.slice(0, cap)}\n[…truncated URL list…]`;
  }
  return `${header}\n${body}`;
}

export function buildSapFilteredPagesChunkText(grounding: SapEntityGrounding): string {
  const ev = grounding.filteredPagesEvidence.trim();
  if (!ev) {
    return [
      "--- BLOCK: FILTERED_PAGES_FOR_SAP ---",
      "# No Pages-MoM excerpt matched entity pathnames (or no Pages-MoM file in bundle).",
      "Still restrict SAP **Page** rows to ENTITY_SITEMAP_ALLOWLIST URLs only; cite metrics only when present in this bundle.",
    ].join("\n");
  }
  return `--- BLOCK: FILTERED_PAGES_FOR_SAP ---\n${ev}`;
}
