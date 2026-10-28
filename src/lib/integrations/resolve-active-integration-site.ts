import type { WordPressSite } from "@/components/integrations/types";
import { ACTIVE_WP_SITE_STORAGE_KEY } from "@/contexts/active-wordpress-site-context";

/** Sync active site for first paint (matches boot + ActiveWordPressSiteProvider rules). */
export function resolveActiveIntegrationSite(
  sites: WordPressSite[],
  activeWordPressSiteId: string | null,
): WordPressSite | null {
  if (sites.length === 0) return null;

  const enabled = sites.filter((s) => s.enabled !== false);
  const pool = enabled.length > 0 ? enabled : sites;

  if (activeWordPressSiteId && pool.some((s) => s.id === activeWordPressSiteId)) {
    return pool.find((s) => s.id === activeWordPressSiteId) ?? null;
  }

  let storedId: string | null = null;
  try {
    storedId = localStorage.getItem(ACTIVE_WP_SITE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (storedId && pool.some((s) => s.id === storedId)) {
    return pool.find((s) => s.id === storedId) ?? null;
  }

  return pool[0] ?? null;
}
