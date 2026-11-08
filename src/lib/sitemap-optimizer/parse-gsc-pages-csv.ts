import Papa from "papaparse";
import { parseGscCtr, parseNumber } from "@/lib/gsc-export-csv-parse";
import {
  normalizeRedirectCsvRelativePath,
  rankMathSourceFromPageUrl,
} from "@/lib/pulse-redirect-redirect-csv";
import { blogDestinationWasNormalized, ensureBlogDestinationUrl } from "@/lib/sitemap-optimizer/blog-destination-url";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

export type GscParsedPageRow = {
  /** Canonical URL for planning (GSC page or redirect-grid new_url). */
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  /** Redirect grid: legacy URL (old_url). */
  redirectFromUrl?: string;
  gridTopicTag?: string;
  gridGeoTag?: string;
  gridTagLabel?: string;
  gridGroup?: number;
  csvUploadRow?: number;
};

function stripLeadingCommentLines(text: string): string {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim().startsWith("#")) {
    i++;
  }
  return lines.slice(i).join("\n");
}

function normalizeHeaderKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, " ");
}

function pickColumn(row: Record<string, unknown>, names: string[]): string {
  const keys = Object.keys(row);
  for (const name of names) {
    const norm = normalizeHeaderKey(name);
    for (const k of keys) {
      if (normalizeHeaderKey(k) === norm) {
        const v = row[k];
        if (v != null && String(v).trim()) return String(v).trim();
      }
    }
  }
  return "";
}

function resolvePageHeader(headers: string[]): string | null {
  for (const h of headers) {
    const n = normalizeHeaderKey(h);
    if (n === "page" || n === "url" || n === "top pages") return h;
  }
  return null;
}

function resolveOldUrlHeader(headers: string[]): string | null {
  for (const h of headers) {
    const n = normalizeHeaderKey(h);
    if (n === "old_url" || n === "old url" || n === "old source url" || n === "source url") {
      return h;
    }
  }
  for (const h of headers) {
    const n = normalizeHeaderKey(h);
    if (n.startsWith("old_url")) return h;
  }
  return null;
}

function hasNewUrlColumn(headers: string[]): boolean {
  const keys = new Set(headers.map((h) => normalizeHeaderKey(h)));
  return (
    keys.has("new_url") ||
    keys.has("new url") ||
    keys.has("new destination") ||
    keys.has("new destination url") ||
    keys.has("destination url") ||
    keys.has("destination")
  );
}

function isActiveStatus(row: Record<string, unknown>): boolean {
  const status = pickColumn(row, ["status"]);
  if (!status) return true;
  return status.toLowerCase() === "active";
}

/** NEO Pulse redirect export: id, source, matching, destination, … */
function isRedirectCsvNativeRedirectCsv(headers: string[]): boolean {
  const keys = new Set(headers.map((h) => normalizeHeaderKey(h)));
  return keys.has("source") && keys.has("destination") && !keys.has("old_url") && !keys.has("new_url");
}

/** Legacy/source URL column for redirect maps (old_url, source, Top pages, etc.). */
function resolveRedirectSourceHeader(headers: string[]): string | null {
  const old = resolveOldUrlHeader(headers);
  if (old) return old;
  if (!hasNewUrlColumn(headers)) return null;
  for (const h of headers) {
    if (normalizeHeaderKey(h) === "source") return h;
  }
  return resolvePageHeader(headers);
}

function isRedirectGridCsv(headers: string[]): boolean {
  if (isRedirectCsvNativeRedirectCsv(headers)) return true;
  return hasNewUrlColumn(headers) && resolveRedirectSourceHeader(headers) != null;
}

/** Store legacy source path for inventory matching (relative NEO Pulse redirect path or full URL). */
function normalizeRedirectLegacySource(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const rel = normalizeRedirectCsvRelativePath(trimmed);
  if (rel) return rel;
  const fromFull = rankMathSourceFromPageUrl(trimmed);
  if (fromFull) return fromFull;
  return trimmed;
}

function parseRedirectCsvNativeRedirectRows(
  data: Record<string, unknown>[],
  headers: string[],
): { rows: GscParsedPageRow[]; blogDestinationsNormalized: number } {
  const byLegacyKey = new Map<string, GscParsedPageRow>();
  let blogDestinationsNormalized = 0;

  for (let i = 0; i < data.length; i += 1) {
    const row = data[i];
    if (!row || typeof row !== "object") continue;
    if (!isActiveStatus(row)) continue;

    const destRaw = pickColumn(row, ["destination"]);
    const sourceRaw = pickColumn(row, ["source"]);
    if (!destRaw || !sourceRaw) continue;

    const normalizedNew = ensureBlogDestinationUrl(destRaw) ?? destRaw;
    if (blogDestinationWasNormalized(destRaw, normalizedNew)) {
      blogDestinationsNormalized += 1;
    }

    const legacySource = normalizeRedirectLegacySource(sourceRaw);
    const dedupeKey = legacySource || `${normalizePageUrlKey(normalizedNew)}#${i}`;

    byLegacyKey.set(dedupeKey, {
      page: normalizedNew,
      redirectFromUrl: legacySource || sourceRaw,
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: 0,
      csvUploadRow: parseOptionalInt(pickColumn(row, ["id", "upload_row", "upload row"])) ?? i + 1,
    });
  }

  return { rows: [...byLegacyKey.values()], blogDestinationsNormalized };
}

function parseOptionalInt(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function parseRedirectGridRows(
  data: Record<string, unknown>[],
  headers: string[],
): { rows: GscParsedPageRow[]; blogDestinationsNormalized: number } {
  const clicksKey = resolveMetricHeader(headers, "clicks");
  const imprKey = resolveMetricHeader(headers, "impressions");
  const ctrKey = resolveMetricHeader(headers, "ctr");
  const posKey = resolveMetricHeader(headers, "position") ?? resolveMetricHeader(headers, "average position");

  const byLegacyKey = new Map<string, GscParsedPageRow>();
  let blogDestinationsNormalized = 0;

  const sourceUrlHeader = resolveRedirectSourceHeader(headers);

  for (let i = 0; i < data.length; i += 1) {
    const row = data[i];
    if (!row || typeof row !== "object") continue;

    const newUrl = pickColumn(row, [
      "new_url",
      "new url",
      "new destination",
      "new destination url",
      "destination url",
      "destination",
    ]);
    if (!newUrl) continue;

    const normalizedNew = ensureBlogDestinationUrl(newUrl) ?? newUrl;
    if (blogDestinationWasNormalized(newUrl, normalizedNew)) {
      blogDestinationsNormalized += 1;
    }

    const oldUrl =
      (sourceUrlHeader ? String(row[sourceUrlHeader] ?? "").trim() : "") ||
      pickColumn(row, [
        "old_url",
        "old url",
        "old source url",
        "source url",
        "sourceurl",
        "source",
        "top pages",
        "page",
        "url",
      ]);
    const legacySource = oldUrl ? normalizeRedirectLegacySource(oldUrl) : "";
    const dedupeKey = legacySource
      ? legacySource
      : oldUrl
        ? normalizePageUrlKey(oldUrl)
        : `${normalizePageUrlKey(normalizedNew)}#${i}`;

    const entry: GscParsedPageRow = {
      page: normalizedNew,
      redirectFromUrl: legacySource || oldUrl || undefined,
      clicks: clicksKey ? parseNumber(row[clicksKey]) : 0,
      impressions: imprKey ? parseNumber(row[imprKey]) : 0,
      ctr: ctrKey ? parseGscCtr(row[ctrKey]) : 0,
      position: posKey ? parseNumber(row[posKey]) : 0,
      gridTopicTag: pickColumn(row, ["topic_tag", "topic tag"]) || undefined,
      gridGeoTag: pickColumn(row, ["geo_tag", "geo tag"]) || undefined,
      gridTagLabel: pickColumn(row, ["tag_label", "tag label"]) || undefined,
      gridGroup: parseOptionalInt(pickColumn(row, ["group"])),
      csvUploadRow: parseOptionalInt(pickColumn(row, ["upload_row", "upload row"])) ?? i + 1,
    };
    byLegacyKey.set(dedupeKey, entry);
  }

  return { rows: [...byLegacyKey.values()], blogDestinationsNormalized };
}

function resolveMetricHeader(headers: string[], metric: string): string | null {
  for (const h of headers) {
    if (normalizeHeaderKey(h) === metric) return h;
  }
  return null;
}

/** Parse GSC Pages export CSV (Page/URL, Clicks, Impressions, CTR, Position). */
export function parseGscPagesCsv(csvText: string): {
  rows: GscParsedPageRow[];
  error?: string;
  /** Redirect-map rows whose new_url was normalized to /blog/{slug}/. */
  blogDestinationsNormalized?: number;
} {
  const trimmed = stripLeadingCommentLines(csvText.trim());
  if (!trimmed) return { rows: [], error: "CSV is empty." };

  const parsed = Papa.parse<Record<string, unknown>>(trimmed, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    const msg = parsed.errors.map((e) => e.message).join("; ");
    return { rows: [], error: msg || "Failed to parse CSV." };
  }

  const headers = parsed.meta.fields ?? [];

  if (isRedirectGridCsv(headers)) {
    const { rows: redirectRows, blogDestinationsNormalized } = isRedirectCsvNativeRedirectCsv(headers)
      ? parseRedirectCsvNativeRedirectRows(parsed.data, headers)
      : parseRedirectGridRows(parsed.data, headers);
    if (redirectRows.length === 0) {
      return { rows: [], error: "No valid redirect source/destination rows found in redirect CSV." };
    }
    return {
      rows: redirectRows,
      blogDestinationsNormalized: blogDestinationsNormalized > 0 ? blogDestinationsNormalized : undefined,
    };
  }

  const pageKey = resolvePageHeader(headers);
  if (!pageKey) {
    return {
      rows: [],
      error:
        "Missing Page or URL column (or Top pages/old_url + new_url for redirect map CSV).",
    };
  }

  const clicksKey = resolveMetricHeader(headers, "clicks");
  const imprKey = resolveMetricHeader(headers, "impressions");
  const ctrKey = resolveMetricHeader(headers, "ctr");
  const posKey = resolveMetricHeader(headers, "position") ?? resolveMetricHeader(headers, "average position");

  const byUrl = new Map<string, GscParsedPageRow>();

  for (const row of parsed.data) {
    if (!row || typeof row !== "object") continue;
    const page = pickColumn(row, [pageKey]) || String(row[pageKey] ?? "").trim();
    if (!page) continue;

    const key = normalizePageUrlKey(page);
    const entry: GscParsedPageRow = {
      page,
      clicks: clicksKey ? parseNumber(row[clicksKey]) : 0,
      impressions: imprKey ? parseNumber(row[imprKey]) : 0,
      ctr: ctrKey ? parseGscCtr(row[ctrKey]) : 0,
      position: posKey ? parseNumber(row[posKey]) : 0,
    };
    byUrl.set(key, entry);
  }

  const rows = [...byUrl.values()];
  if (rows.length === 0) {
    return { rows: [], error: "No valid page rows found in CSV." };
  }

  return { rows };
}
