import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { logger } from "@/lib/logger";
import type { WordPressSite } from "./types";
import { getDeletedSitesTombstones, isSiteTombstoned } from "./storage-deleted-sites";

const ACTIVE_WP_SITE_STORAGE_KEY = "neo-pulse-active-wp-site-id";

function readActiveSiteIdFromStorage(): string | null {
  try {
    return localStorage.getItem(ACTIVE_WP_SITE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Writes the same WordPress credentials the app uses (Integrations) to server/data/neo-pulse-wordpress-sites.json
 * so the Flo email worker can use them without a manual file or CLI.
 */
export async function syncWordPressSitesToServer(sites: WordPressSite[]): Promise<void> {
  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  const path = "/api/integrations/sync-wordpress-sites";
  const url = base ? `${base}${path}` : path;
  const minimal = sites
    .map((s) => ({
      id: s.id,
      name: s.name,
      siteUrl: s.siteUrl,
      username: s.username,
      appPassword: s.appPassword,
      gbpLocationId: s.gbpLocationId,
      ga4PropertyId: s.ga4PropertyId,
      googleAdsCustomerId: s.googleAdsCustomerId,
      semrushSiteAuditProjectId: s.semrushSiteAuditProjectId,
      semrushPositionTrackingProjectId: s.semrushPositionTrackingProjectId,
      semrushPositionTrackingCampaignId: s.semrushPositionTrackingCampaignId,
      wpEngineInstall: s.wpEngineInstall,
      wpEngineAccountId: s.wpEngineAccountId,
      optimizationPackage: s.optimizationPackage,
      editorialContentPackage: s.editorialContentPackage,
      editorialPublishTimeLocal: s.editorialPublishTimeLocal,
      editorialCountsPeriodStartYmd: s.editorialCountsPeriodStartYmd,
      entitySitemapUrl: s.entitySitemapUrl,
      competitorEntitySitemapUrl: s.competitorEntitySitemapUrl,
      manualEndpoint: s.manualEndpoint,
    }))
    .filter((s) => s.siteUrl?.trim() && s.username?.trim() && s.appPassword?.trim());
  const activeSiteId = readActiveSiteIdFromStorage();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ sites: minimal, activeSiteId }),
    });
    if (!res.ok) {
      logger.warn("[Integrations] Server sync failed:", res.status);
    }
  } catch (e) {
    logger.warn("[Integrations] Server sync error:", e);
  }
}

/** Mirror dashboard active site id to server so boot warm targets the correct property. */
export async function syncActiveWordPressSiteToServer(activeSiteId: string | null): Promise<void> {
  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  const path = "/api/integrations/sync-active-wp-site";
  const url = base ? `${base}${path}` : path;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ activeSiteId }),
    });
    if (!res.ok) {
      logger.warn("[Integrations] Active site sync failed:", res.status);
    }
  } catch (e) {
    logger.warn("[Integrations] Active site sync error:", e);
  }
}

/** Load property mirror from WordPress (sites.json) or Render Hub fallback. */
export async function fetchWordPressSitesMirror(): Promise<WordPressSite[]> {
  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  const path = "/api/manager-wordpress-properties/load";
  const url = base ? `${base}${path}` : path;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${url}?_=${Date.now()}`, {
      credentials: "include",
      headers: neoPulseApiHeaders(),
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { sites?: WordPressSite[] };
      const rawSites = Array.isArray(data.sites) ? data.sites : [];
      if (rawSites.length > 0) {
        const tombstones = getDeletedSitesTombstones();
        return rawSites.filter((s) => !isSiteTombstoned(s, tombstones));
      }
    }
  } catch {
    // Mirror unreachable: empty list, visible in the UI. No seed fallback.
  }
  return [];
}
