import Papa from "papaparse";
import type { GscParsedPageRow } from "@/lib/sitemap-optimizer/parse-gsc-pages-csv";

function normalizeHeaderKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, "");
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

function parseOptionalInt(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function isActiveStatus(row: Record<string, unknown>): boolean {
  const status = pickColumn(row, ["status"]);
  if (!status) return true;
  return status.toLowerCase() === "active";
}

/** Grid harness export: group, old_url, new_url, tag_label, … */
export function isGridRedirectCsvExportCsv(headers: readonly string[]): boolean {
  const keys = new Set(headers.map((h) => normalizeHeaderKey(h)));
  return keys.has("old_url") && keys.has("new_url");
}

/** Re-import Sitemap Optimizer grid NEO Pulse redirect export as 1:1 redirect rows. */
export function parseGridRedirectCsvExportCsv(csvText: string): {
  rows: GscParsedPageRow[];
  error?: string;
} {
  const trimmed = csvText.trim();
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
  if (!isGridRedirectCsvExportCsv(headers)) {
    return { rows: [], error: undefined };
  }

  const out: GscParsedPageRow[] = [];
  for (let i = 0; i < parsed.data.length; i += 1) {
    const row = parsed.data[i];
    if (!row || typeof row !== "object") continue;
    if (!isActiveStatus(row)) continue;

    const oldUrl = pickColumn(row, ["old_url", "old url"]);
    const newUrl = pickColumn(row, ["new_url", "new url"]);
    if (!oldUrl || !newUrl) continue;

    out.push({
      page: newUrl,
      redirectFromUrl: oldUrl,
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: 0,
      gridTopicTag: pickColumn(row, ["topic_tag", "topic tag"]) || undefined,
      gridGeoTag: pickColumn(row, ["geo_tag", "geo tag"]) || undefined,
      gridTagLabel: pickColumn(row, ["tag_label", "tag label"]) || undefined,
      gridGroup: parseOptionalInt(pickColumn(row, ["group"])),
      csvUploadRow: parseOptionalInt(pickColumn(row, ["upload_row", "upload row"])) ?? i + 1,
    });
  }

  if (out.length === 0) {
    return { rows: [], error: "No valid old_url/new_url rows in grid export CSV." };
  }

  return { rows: out };
}
