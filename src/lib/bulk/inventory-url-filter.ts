/**
 * Exclude WordPress pagination, plain ?p=ID, and Elementor template URLs from sitemap inventory.
 */

function parseInventoryUrl(url: string): URL | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

const ELEMENTOR_QUERY_PARAMS = ["elementor_library", "elementor-preview", "elementor_library_id"] as const;

/** True for ?p=ID, ?paged=N, /page/N/ pagination, and Elementor library/preview URLs. */
export function isInventoryExcludedSitemapUrl(url: string): boolean {
  const u = parseInventoryUrl(url);
  if (!u) return false;

  if (u.searchParams.has("p")) return true;
  if (u.searchParams.has("paged")) return true;

  for (const key of ELEMENTOR_QUERY_PARAMS) {
    if (u.searchParams.has(key)) return true;
  }

  const pathLower = u.pathname.toLowerCase();
  if (pathLower.includes("/elementor_library/") || pathLower.includes("/elementor-snippet/")) {
    return true;
  }

  const segments = u.pathname.split("/").filter(Boolean);
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]?.toLowerCase() ?? "";
    const next = segments[i + 1] ?? "";
    if (seg === "page" && /^\d+$/.test(next)) return true;
  }

  return false;
}

export function filterInventorySitemapUrls(urls: string[]): string[] {
  return urls.filter((url) => !isInventoryExcludedSitemapUrl(url));
}

export function filterInventorySitemapRows<T extends { url?: string }>(rows: T[]): T[] {
  const seenUrls = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const url = row.url?.trim();
    if (!url || isInventoryExcludedSitemapUrl(url)) continue;
    const key = url.toLowerCase();
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    out.push(row);
  }
  return out;
}
