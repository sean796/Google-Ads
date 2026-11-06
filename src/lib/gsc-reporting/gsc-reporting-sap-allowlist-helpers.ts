import Papa from "papaparse";

export const GSC_SITEMAPS_BUNDLE_FILENAME = "GSC-sitemaps.csv";

/** Common SAP-related sitemap filenames (reference / tests; not guessed on origin during reporting). */
export const SAP_CANONICAL_SITEMAP_LEAVES = [
  "service-area-sitemap.xml",
  "service-areas-sitemap.xml",
  "service_area-sitemap.xml",
  "location-sitemap.xml",
  "locations-sitemap.xml",
  "entity-sitemap.xml",
] as const;

/** Max characters for the synthetic FILTERED_PAGES_FOR_SAP block (fits retrieval budget). */
export const SAP_FILTERED_PAGES_MAX_CHARS = 12_000;

/** Max extra child sitemap XML fetches per report (local + entity). */
export const SAP_EXTRA_SITEMAP_PARSE_LIMIT = 12;

/** Bundle file: SAP URL allowlist (entity sitemap + local service area pages). */
export const GSC_ENTITY_SITEMAP_URLS_FILENAME = "Entity-sitemap-urls.csv";

/** Path prefixes for local service area landings (city/area pages) in SAP. */
export const SAP_LOCAL_PATHNAME_PREFIXES = [
  "/service-area",
  "/service-areas",
  "/location",
  "/locations",
] as const;

const SAP_CHILD_SITEMAP_FILENAME =
  /(?:^|\/)(service-area|service-areas|location|locations|local|near|entity)[^/]*\.xml$/i;

function sitemapLeafLooksLikeSapSource(leaf: string): boolean {
  const lower = leaf.toLowerCase();
  if (SAP_CHILD_SITEMAP_FILENAME.test(leaf)) return true;
  if (!lower.includes("sitemap")) return false;
  return (
    lower.includes("service-area") ||
    lower.includes("service-areas") ||
    lower.includes("service_area") ||
    lower.includes("location") ||
    lower.includes("entity")
  );
}

export function pathOrUrlLooksLikeSapSitemap(pathOrUrl: string): boolean {
  const t = pathOrUrl.trim();
  if (!t) return false;
  const leaf = t.split("/").filter(Boolean).pop() ?? t;
  return sitemapLeafLooksLikeSapSource(leaf);
}


export function resolveAbsoluteSitemapUrl(pathOrUrl: string, publicSiteUrl: string): string | null {
  const t = pathOrUrl.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  const origin = siteOriginFromPublicUrl(publicSiteUrl);
  if (!origin) return null;
  return t.startsWith("/") ? `${origin}${t}` : `${origin}/${t}`;
}

/** Paths from Search Console submitted sitemaps bundle (column Path). */
export function gscSubmittedSitemapPathsFromBundle(files: { name: string; content: string }[]): string[] {
  const file = files.find((f) => f.name.trim() === GSC_SITEMAPS_BUNDLE_FILENAME);
  if (!file?.content.trim()) return [];
  const parsed = Papa.parse<Record<string, string>>(file.content, {
    header: true,
    skipEmptyLines: true,
  });
  const pathKey = parsed.meta.fields?.find((h) => h.trim().toLowerCase() === "path");
  if (!pathKey) return [];
  const out: string[] = [];
  for (const row of parsed.data ?? []) {
    const p = String(row[pathKey] ?? "").trim();
    if (p) out.push(p);
  }
  return out;
}


export type SapEntityGrounding = {
  /** Human-readable source (e.g. entity sitemap filename). */
  sourceLabel: string;
  /** Resolved canonical URLs from the entity sitemap (same-origin filtered upstream). */
  allowlistUrls: string[];
  /** CSV-shaped excerpt: only Pages MoM rows whose Page matches allowlist pathnames. */
  filteredPagesEvidence: string;
};

export function siteOriginFromPublicUrl(publicSiteUrl: string): string {
  const t = publicSiteUrl.trim();
  if (!t) return "";
  try {
    return new URL(t).origin;
  } catch {
    return "";
  }
}

/** Pathname key for matching Page cells to entity sitemap URLs (lowercase, no trailing slash except root). */
export function pathnameKeyFromUrl(urlStr: string): string | null {
  const raw = urlStr.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    let p = u.pathname.toLowerCase();
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return p;
  } catch {
    return null;
  }
}

export function buildAllowlistPathnameSet(allowlistUrls: string[]): Set<string> {
  const set = new Set<string>();
  for (const u of allowlistUrls) {
    const k = pathnameKeyFromUrl(u);
    if (k) set.add(k);
  }
  return set;
}

/** Keep only URLs on the report property origin. */
export function filterUrlsToSiteOrigin(urls: string[], publicSiteUrl: string): string[] {
  const origin = siteOriginFromPublicUrl(publicSiteUrl).toLowerCase();
  if (!origin) return [...urls];
  const out: string[] = [];
  for (const raw of urls) {
    const u = raw.trim();
    if (!u) continue;
    try {
      if (new URL(u).origin.toLowerCase() === origin) out.push(u);
    } catch {
      /* skip invalid */
    }
  }
  return out;
}

export function entitySitemapUrlsBundleCsv(allowlistUrls: string[], sourceLabel: string): string {
  const header = `# ${sourceLabel.trim() || "Entity sitemap"}\nurl`;
  if (allowlistUrls.length === 0) return `${header}\n`;
  return `${header}\n${allowlistUrls.join("\n")}\n`;
}

export function appendEntitySitemapUrlsBundleFile(
  files: { name: string; content: string }[],
  allowlistUrls: string[],
  sourceLabel: string,
): void {
  if (files.some((f) => f.name.trim() === GSC_ENTITY_SITEMAP_URLS_FILENAME)) return;
  files.push({
    name: GSC_ENTITY_SITEMAP_URLS_FILENAME,
    content: entitySitemapUrlsBundleCsv(allowlistUrls, sourceLabel),
  });
}

export function pathnameMatchesSapLocalOrEntityArea(pathKey: string | null): boolean {
  if (!pathKey) return false;
  const p = pathKey.toLowerCase();
  for (const pref of SAP_LOCAL_PATHNAME_PREFIXES) {
    if (p === pref || p.startsWith(`${pref}/`)) return true;
  }
  return false;
}

export function dedupeSapAllowlistUrls(urls: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const raw of urls) {
    const u = raw.trim();
    if (!u) continue;
    const k = pathnameKeyFromUrl(u);
    if (k && !byKey.has(k)) byKey.set(k, u);
  }
  return [...byKey.values()];
}

