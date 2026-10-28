import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { readOverviewRowsForFirstPaint } from "@/lib/overview/overview-sitemap-warm-rows-sync";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

const STORAGE_KEY_PREFIX = "neo-pulse-overview-studio-active-url-v1:";

export function readOverviewStudioActiveUrl(siteId: string): string | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${siteId}`);
    return raw?.trim() || null;
  } catch {
    return null;
  }
}

export function writeOverviewStudioActiveUrl(siteId: string, url: string | null): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}${siteId}`;
    if (!url?.trim()) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, url.trim());
  } catch {
    // quota
  }
}

/** URL to highlight in Visual Document Studio on first paint (no useEffect delay). */
export function resolveOverviewStudioActiveUrlForPaint(
  site: WordPressSite | undefined,
  source: OverviewSitemapSource,
): string | null {
  if (!site?.id) return null;
  const rows = readOverviewRowsForFirstPaint(site, source);
  const stored = readOverviewStudioActiveUrl(site.id);
  if (stored && rows.length) {
    const storedKey = normalizePageUrlKey(stored);
    if (rows.some((row) => normalizePageUrlKey(row.url) === storedKey)) {
      return stored;
    }
  }
  if (stored && !rows.length) return stored;
  return rows[0]?.url?.trim() || stored;
}
