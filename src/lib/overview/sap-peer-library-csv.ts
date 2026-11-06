import type { WordPressSite } from "@/components/integrations/types";
import { peerLocalImagesCsvFileSlug, COMBINED_PEER_LOCAL_IMAGES_CSV_NAME } from "@/lib/overview/overview-peer-csv-details";
import type { SapPeerEntityEntry, SapPeerLibraryCsvFile } from "@/lib/overview/sap-cross-site-image-search-types";

function csvEscapeCell(value: string): string {
  const raw = String(value ?? "");
  let needsQuotes = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    if (ch === "," || ch === '"' || ch === "\n" || ch === "\r") {
      needsQuotes = true;
      break;
    }
  }
  if (!needsQuotes) return raw;
  let escaped = '"';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    escaped += ch === '"' ? '""' : ch;
  }
  escaped += '"';
  return escaped;
}

function normalizeCityMatchKey(value: string): string {
  const raw = String(value ?? "").trim().toLowerCase();
  let out = "";
  let space = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      space = true;
      continue;
    }
    if (space && out.length > 0) out += " ";
    space = false;
    out += ch;
  }
  return out;
}

/**
 * Peer qualifies when any SAP inventory pageUrl/slug/title fuzzy-contains the market city
 * (e.g. edmonton in .../edmonton-city-centre/). No NAP.
 */
export function peerInventoryFuzzyMatchesCity(
  marketCity: string,
  entries: Array<{ pageUrl?: string; slug?: string; title?: string }>,
): { matched: boolean; matchCount: number; sampleUrl: string | null } {
  const cityKey = normalizeCityMatchKey(marketCity);
  if (!cityKey) return { matched: false, matchCount: 0, sampleUrl: null };
  let matchCount = 0;
  let sampleUrl: string | null = null;
  for (const entry of entries) {
    const haystack = normalizeCityMatchKey(
      [(entry.pageUrl || "").trim(), (entry.slug || "").trim(), (entry.title || "").trim()]
        .filter(Boolean)
        .join(" "),
    );
    if (!haystack.includes(cityKey)) continue;
    matchCount += 1;
    if (!sampleUrl) sampleUrl = (entry.pageUrl || "").trim() || null;
  }
  return { matched: matchCount > 0, matchCount, sampleUrl };
}

/** Full SAP entity inventory CSV for one peer (images when known). */
export function formatSapPeerLibraryCsv(
  site: Pick<WordPressSite, "name" | "siteUrl">,
  entries: SapPeerEntityEntry[],
): string {
  const lines = ["site,title,pageUrl,slug,keyword,imageUrl"];
  for (const row of sapPeerLibraryCsvDataRows(site, entries)) {
    lines.push(row);
  }
  return lines.join("\n");
}

function sapPeerLibraryCsvDataRows(
  site: Pick<WordPressSite, "name" | "siteUrl">,
  entries: SapPeerEntityEntry[],
): string[] {
  const siteName = (site.name || "").trim() || site.siteUrl || "peer";
  const rows: string[] = [];
  for (const entry of entries) {
    rows.push(
      [
        csvEscapeCell(siteName),
        csvEscapeCell(entry.title || ""),
        csvEscapeCell(entry.pageUrl || ""),
        csvEscapeCell(entry.slug || ""),
        csvEscapeCell(entry.keyword || ""),
        csvEscapeCell(entry.imageUrl || ""),
      ].join(","),
    );
  }
  return rows;
}

/** One CSV with all city-matched peer inventories appended (shared header). */
export function formatCombinedSapPeerLibraryCsv(
  libraries: Array<{
    site: Pick<WordPressSite, "name" | "siteUrl">;
    entries: SapPeerEntityEntry[];
  }>,
): string {
  const lines = ["site,title,pageUrl,slug,keyword,imageUrl"];
  for (const lib of libraries) {
    for (const row of sapPeerLibraryCsvDataRows(lib.site, lib.entries)) {
      lines.push(row);
    }
  }
  return lines.join("\n");
}

export function buildCombinedSapPeerLibraryCsvFile(
  libraries: Array<{
    site: Pick<WordPressSite, "name" | "siteUrl">;
    entries: SapPeerEntityEntry[];
  }>,
): SapPeerLibraryCsvFile {
  return {
    name: COMBINED_PEER_LOCAL_IMAGES_CSV_NAME,
    content: formatCombinedSapPeerLibraryCsv(libraries),
    mimeType: "text/csv;charset=utf-8",
  };
}

export function buildSapPeerLibraryCsvFile(
  site: Pick<WordPressSite, "name" | "siteUrl">,
  entries: SapPeerEntityEntry[],
): SapPeerLibraryCsvFile {
  const slug = peerLocalImagesCsvFileSlug((site.name || "").trim() || site.siteUrl || "peer");
  return {
    name: `peer-local-images-${slug}.csv`,
    content: formatSapPeerLibraryCsv(site, entries),
    mimeType: "text/csv;charset=utf-8",
  };
}
