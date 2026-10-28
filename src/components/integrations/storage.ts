import { notify } from "@/lib/app-notifications";
import { NOTIFY_COULD_NOT_SAVE_SITES_TO_LOCAL_STORAGE } from "@/lib/notify-messages";
import { loadManagerSettingsFromCloud } from "@/lib/manager-cloud-settings-api";
import { applyManagerCloudSnapshotToLocalStorage } from "@/lib/manager-cloud-settings-snapshot";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import {
  editorialContentPackageTierForPropertyName,
  editorialPublishTimeLocalForPropertyName,
  isEditorialContentPackageTier,
  normalizeEditorialPropertyName,
} from "@/lib/editorial-content-package";
import { isOptimizationPackageTier } from "@/lib/wordpress-optimization-package";
import { wordPressSiteHostKey } from "@/lib/wordpress-site-host-key";
import { applyWpEngineHostingDefaults } from "@/lib/wp-engine-install-defaults";
import { applyGa4PropertyIdDefaults } from "@/lib/ga4-property-id-defaults";
import { applySemrushProjectDefaults } from "@/lib/semrush-project-id-defaults";
import { saveWordPressProperties } from "@/lib/manager-wordpress-properties-api";
import {
  isShutterSpotProperty,
  SHUTTER_SPOT_CANONICAL_NAME,
  SHUTTER_SPOT_GOOGLE_ADS_CUSTOMER_ID,
} from "@/lib/shutter-spot-site";
import {
  fetchClientSiteLogoUrl,
  resolveClientSiteOrigin,
} from "@/lib/integrations/client-site-logo";
import { DEFAULT_PROPERTIES_SEED_SITES } from "./default-properties-seed";
import type { WordPressSite } from "./types";
import { WORDPRESS_SITES_STORAGE_KEY } from "./types";

const ACTIVE_WP_SITE_STORAGE_KEY = "neo-pulse-active-wp-site-id";

export const DELETED_WP_SITES_STORAGE_KEY = "neo-pulse-deleted-wp-sites-v1";

export type DeletedSiteRecord = {
  id?: string;
  name?: string;
  host?: string;
};

const INITIAL_PERMANENTLY_DELETED: DeletedSiteRecord[] = [
  { name: "dr. rebecca", host: "drrebeccajane.ca" },
  { name: "ridgeline solar", host: "ridgelinesolar.ca" },
];

export const PROTECTED_ACTIVE_CLIENT_NAMES = new Set([
  "advance blinds",
  "blind magic",
  "blinds west",
  "dm interiors",
  "dm interiors & design",
  "elite shutters & shadings",
  "in the shade",
  "interiors by laura",
  "kwb",
  "lindsey blinds",
  "neo digital",
  "phoenix painting",
  "posh outdoors",
  "shutter spot",
  "superior blinds",
  "superior blinds: home",
  "superior tent rentals",
  "tailored interiors",
  "you junk it... i dump it",
]);

export function getDeletedSitesTombstones(): DeletedSiteRecord[] {
  if (typeof localStorage === "undefined") return INITIAL_PERMANENTLY_DELETED;
  try {
    const raw = localStorage.getItem(DELETED_WP_SITES_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(DELETED_WP_SITES_STORAGE_KEY, JSON.stringify(INITIAL_PERMANENTLY_DELETED));
      return INITIAL_PERMANENTLY_DELETED;
    }
    const list = JSON.parse(raw) as DeletedSiteRecord[];
    const merged: DeletedSiteRecord[] = [...INITIAL_PERMANENTLY_DELETED];
    let needsClean = false;

    for (const item of list) {
      const name = item.name?.trim().toLowerCase();
      const host = item.host?.trim().toLowerCase();
      const id = item.id?.trim();

      if (!name && !host && !id) {
        needsClean = true;
        continue;
      }
      if (name && PROTECTED_ACTIVE_CLIENT_NAMES.has(name)) {
        needsClean = true;
        continue;
      }

      if (!merged.some((m) => (id && m.id && m.id === id) || (name && m.name && m.name === name))) {
        merged.push({
          id: id || undefined,
          name: name || undefined,
          host: host || undefined,
        });
      }
    }

    if (needsClean) {
      localStorage.setItem(DELETED_WP_SITES_STORAGE_KEY, JSON.stringify(merged));
    }

    return merged;
  } catch {
    return INITIAL_PERMANENTLY_DELETED;
  }
}

export function recordDeletedSite(site: {
  id?: string;
  name?: string;
  siteUrl?: string;
  productionSiteUrl?: string;
}): void {
  if (typeof localStorage === "undefined") return;
  try {
    const name = site.name?.trim().toLowerCase();
    if (name && PROTECTED_ACTIVE_CLIENT_NAMES.has(name)) return;

    const tombstones = getDeletedSitesTombstones();
    const host = wordPressSiteHostKey(site.productionSiteUrl || site.siteUrl || "");
    const id = site.id?.trim();

    if (!id && (!name || name.length < 3) && (!host || host.length < 4)) return;

    if (!tombstones.some((t) => (id && t.id === id) || (name && t.name === name) || (host && t.host === host))) {
      tombstones.push({
        id: id || undefined,
        name: name || undefined,
        host: host || undefined,
      });
      localStorage.setItem(DELETED_WP_SITES_STORAGE_KEY, JSON.stringify(tombstones));
    }
  } catch (e) {
    console.warn("[storage] Failed to record deleted site tombstone:", e);
  }
}

export function isSiteTombstoned(
  site: { id?: string; name?: string; siteUrl?: string; productionSiteUrl?: string },
  tombstones?: DeletedSiteRecord[],
): boolean {
  const name = site.name?.trim().toLowerCase();
  if (name && PROTECTED_ACTIVE_CLIENT_NAMES.has(name)) {
    return false;
  }

  const records = tombstones ?? getDeletedSitesTombstones();
  const id = site.id?.trim();
  const host = wordPressSiteHostKey(site.productionSiteUrl || site.siteUrl || "").toLowerCase();

  for (const t of records) {
    const tId = t.id?.trim();
    const tName = t.name?.trim().toLowerCase();
    const tHost = t.host?.trim().toLowerCase();

    if (id && tId && id === tId) return true;
    if (name && tName && tName.length >= 3 && name === tName) return true;
    if (host && tHost && tHost.length >= 4 && host === tHost) return true;
  }
  return false;
}

/** One-time undo for header display-name edits that overwrote or shortened property names. */
export const WP_SITES_RESTORE_ORIGINAL_NAMES_ONCE_KEY =
  "neo-pulse-wp-sites-restore-original-names-v1";

function pickLongestTrimmedName(...candidates: string[]): string {
  const trimmed = candidates.map((c) => c.trim()).filter(Boolean);
  if (trimmed.length === 0) return "";
  return trimmed.sort((a, b) => b.length - a.length)[0];
}

function restoreOriginalIntegrationsSiteName(
  site: WordPressSite,
  mirrorRow?: WordPressSite,
): WordPressSite {
  const nap = site.napInfo?.name?.trim() ?? "";
  const mirrorName = mirrorRow?.name?.trim() ?? "";
  const bestName = pickLongestTrimmedName(site.name, nap, mirrorName);

  let next: WordPressSite =
    bestName && bestName !== site.name.trim() ? { ...site, name: bestName } : { ...site };

  if (next.menuDisplayName !== undefined) {
    const { menuDisplayName: _menu, ...rest } = next;
    next = rest as WordPressSite;
  }

  return next;
}

/** Node worker override for server post creator harness (no browser localStorage). */
let serverHarnessSitesOverride: WordPressSite[] | null = null;

export function setServerHarnessSitesOverride(sites: WordPressSite[] | null): void {
  serverHarnessSitesOverride = sites;
}

/** Shallow-sorted copy for cloud backup; preserves each site `id` and does not mutate the live list order. */
export function sortWordPressSitesByName(sites: WordPressSite[]): WordPressSite[] {
  return [...sites].sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }),
  );
}

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
      console.warn("[Integrations] Server sync failed:", res.status);
    }
  } catch (e) {
    console.warn("[Integrations] Server sync error:", e);
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
      console.warn("[Integrations] Active site sync failed:", res.status);
    }
  } catch (e) {
    console.warn("[Integrations] Active site sync error:", e);
  }
}

/** Inline data URLs must not be persisted in browser storage (quota). Server holds uploaded logos. */
export function clientLogoUrlForLocalStorage(url?: string): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed || trimmed.startsWith("data:")) return undefined;
  return trimmed;
}

export function stripInlineClientLogoFromSite(site: WordPressSite): WordPressSite {
  const url = site.clientLogoUrl?.trim();
  if (!url?.startsWith("data:")) return site;
  return {
    ...site,
    clientLogoUrl: undefined,
    clientLogoSource: undefined,
    clientLogoFetchedAt: undefined,
  };
}

/** Drop large sitemap payloads (urls, postMetadata) that can exceed localStorage quota. Keeps childSitemaps + endpoints. */
export function slimSiteForLocalStorage(site: WordPressSite): WordPressSite {
  let next = site;
  if (site.sitemaps) {
    const {
      urls: _urls,
      postMetadata: _postMetadata,
      ...sitemapRest
    } = site.sitemaps;
    next = { ...site, sitemaps: sitemapRest };
  }
  const logoUrl = clientLogoUrlForLocalStorage(next.clientLogoUrl);
  if (logoUrl === next.clientLogoUrl?.trim() || (!logoUrl && !next.clientLogoUrl?.trim())) {
    return next;
  }
  return { ...next, clientLogoUrl: logoUrl };
}

/** Credentials + config only when slim payload still exceeds quota. */
export function minimalSiteForLocalStorage(site: WordPressSite): WordPressSite {
  const slim = slimSiteForLocalStorage(site);
  return {
    id: slim.id,
    name: slim.name,
    menuDisplayName: slim.menuDisplayName,
    siteUrl: slim.siteUrl,
    productionSiteUrl: slim.productionSiteUrl,
    username: slim.username,
    appPassword: slim.appPassword,
    connectedAt: slim.connectedAt,
    lastTested: slim.lastTested,
    connectionStatus: slim.connectionStatus,
    capabilities: slim.capabilities,
    enabled: slim.enabled,
    entitySitemapUrl: slim.entitySitemapUrl,
    competitorEntitySitemapUrl: slim.competitorEntitySitemapUrl,
    manualEndpoint: slim.manualEndpoint,
    ga4PropertyId: slim.ga4PropertyId,
    googleAdsCustomerId: slim.googleAdsCustomerId,
    gbpLocationId: slim.gbpLocationId,
    semrushSiteAuditProjectId: slim.semrushSiteAuditProjectId,
    semrushPositionTrackingProjectId: slim.semrushPositionTrackingProjectId,
    semrushPositionTrackingCampaignId: slim.semrushPositionTrackingCampaignId,
    wpEngineInstall: slim.wpEngineInstall,
    wpEngineAccountId: slim.wpEngineAccountId,
    editorialCountsPeriodStartYmd: slim.editorialCountsPeriodStartYmd,
    optimizationPackage: slim.optimizationPackage,
    editorialContentPackage: slim.editorialContentPackage,
    editorialPublishTimeLocal: slim.editorialPublishTimeLocal,
    industryVertical: slim.industryVertical,
    benchmarkCustomTag: slim.benchmarkCustomTag,
    primaryLocalKeyword: slim.primaryLocalKeyword,
    clientLogoUrl: clientLogoUrlForLocalStorage(slim.clientLogoUrl),
    clientLogoSource: slim.clientLogoSource,
    clientLogoFetchedAt: slim.clientLogoFetchedAt,
    clientLogoBoxTheme: slim.clientLogoBoxTheme,
    profileTags: slim.profileTags,
    pluginAccessToken: slim.pluginAccessToken,
    slackEnabledForProperty: slim.slackEnabledForProperty,
    slackChannelId: slim.slackChannelId,
    slackChannelName: slim.slackChannelName,
    slackIncomingWebhookUrl: slim.slackIncomingWebhookUrl,
    slackMentionSnippet: slim.slackMentionSnippet,
    slackConnectionStatus: slim.slackConnectionStatus,
    slackLastTestAt: slim.slackLastTestAt,
    postBankEnabled: slim.postBankEnabled,
    sitemaps: slim.sitemaps
      ? {
          mainSitemapUrl: slim.sitemaps.mainSitemapUrl,
          detectedAt: slim.sitemaps.detectedAt,
          type: slim.sitemaps.type,
          disabledChildSitemapUrls: slim.sitemaps.disabledChildSitemapUrls,
          childSitemaps: slim.sitemaps.childSitemaps,
          endpoints: slim.sitemaps.endpoints,
        }
      : undefined,
    scheduledPosts: slim.scheduledPosts,
  };
}

function siteHostForLocalDefaults(site: WordPressSite): string {
  try {
    const raw = (site.productionSiteUrl || site.siteUrl || "").trim();
    if (!raw) return "";
    const url = raw.startsWith("http") ? raw : `https://${raw}`;
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Integrations display name stays Shutter Spot (Google Ads MCC sub-account 745-406-1453). */
function applyShutterSpotDisplayNameMigration(site: WordPressSite): WordPressSite {
  if (!isShutterSpotProperty(site)) return site;
  const ads = (site.googleAdsCustomerId ?? "").replace(/\D/g, "");
  return {
    ...site,
    name: SHUTTER_SPOT_CANONICAL_NAME,
    googleAdsCustomerId: ads.length === 10 ? site.googleAdsCustomerId : SHUTTER_SPOT_GOOGLE_ADS_CUSTOMER_ID,
  };
}

function findSeedSiteForEditorialMerge(site: WordPressSite): WordPressSite | undefined {
  const byId = DEFAULT_PROPERTIES_SEED_SITES.find((s) => s.id === site.id);
  if (byId) return byId;
  const host = wordPressSiteHostKey(site.siteUrl);
  if (host) {
    const byHost = DEFAULT_PROPERTIES_SEED_SITES.find((s) => wordPressSiteHostKey(s.siteUrl) === host);
    if (byHost) return byHost;
  }
  const norm = normalizeEditorialPropertyName(site.name);
  if (!norm) return undefined;
  return DEFAULT_PROPERTIES_SEED_SITES.find((s) => normalizeEditorialPropertyName(s.name) === norm);
}

/** Persist editorial tier for the 13 named clients (seed, then canonical name map). */
function applyEditorialContentPackageDefaults(site: WordPressSite): WordPressSite {
  const seed = findSeedSiteForEditorialMerge(site);
  const fromName = editorialContentPackageTierForPropertyName(site.name);
  const fromSeed =
    seed?.editorialContentPackage?.trim() &&
    isEditorialContentPackageTier(seed.editorialContentPackage.trim())
      ? seed.editorialContentPackage.trim()
      : undefined;
  const stored =
    site.editorialContentPackage?.trim() &&
    isEditorialContentPackageTier(site.editorialContentPackage.trim())
      ? site.editorialContentPackage.trim()
      : undefined;
  const tier = stored ?? fromSeed ?? fromName;
  const publishTime =
    site.editorialPublishTimeLocal?.trim() ||
    seed?.editorialPublishTimeLocal?.trim() ||
    editorialPublishTimeLocalForPropertyName(site.name) ||
    undefined;

  const next = { ...site };
  if (tier) {
    next.editorialContentPackage = tier;
  } else {
    delete next.editorialContentPackage;
  }
  if (publishTime) {
    next.editorialPublishTimeLocal = publishTime;
  } else if (!stored && !fromSeed && !fromName) {
    delete next.editorialPublishTimeLocal;
  }
  return next;
}

function tryPersistSitesJson(json: string): boolean {
  try {
    localStorage.setItem(WORDPRESS_SITES_STORAGE_KEY, json);
    return true;
  } catch (e) {
    if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) {
      return false;
    }
    throw e;
  }
}

export function getStoredSites(): WordPressSite[] {
  if (serverHarnessSitesOverride?.length) {
    const tombstones = getDeletedSitesTombstones();
    return serverHarnessSitesOverride.filter((s) => !isSiteTombstoned(s, tombstones));
  }
  if (typeof localStorage === "undefined") {
    return DEFAULT_PROPERTIES_SEED_SITES.filter((s) => !isSiteTombstoned(s));
  }
  try {
    const stored = localStorage.getItem(WORDPRESS_SITES_STORAGE_KEY);
    if (stored) {
      const sites = JSON.parse(stored) as WordPressSite[];
      const tombstones = getDeletedSitesTombstones();
      const activeSites = sites.filter((s) => !isSiteTombstoned(s, tombstones));

      // If active sites exist, process migrations and return
      if (activeSites.length > 0) {
        // If any deleted sites were found in local storage, purge them immediately
        if (activeSites.length !== sites.length) {
          localStorage.setItem(WORDPRESS_SITES_STORAGE_KEY, JSON.stringify(activeSites));
          void syncWordPressSitesToServer(activeSites);
          void saveWordPressProperties(activeSites).catch(() => {});
        }

        // Migrate wp-sitemap.xml URLs to sitemap_index.xml
        const migrated = activeSites.map((site) => {
          const migratedSite = {
            ...site,
            enabled: site.enabled !== undefined ? site.enabled : true,
          };

          // Convert wp-sitemap.xml to sitemap_index.xml if it exists
          if (migratedSite.sitemaps?.mainSitemapUrl?.includes("/wp-sitemap.xml")) {
            console.log(`[Migration] Converting wp-sitemap.xml to sitemap_index.xml for site: ${site.name}`);
            migratedSite.sitemaps.mainSitemapUrl = migratedSite.sitemaps.mainSitemapUrl.replace(
              "/wp-sitemap.xml",
              "/sitemap_index.xml",
            );
          }

          const rawPkg = migratedSite.optimizationPackage?.trim();
          if (rawPkg && isOptimizationPackageTier(rawPkg)) {
            migratedSite.optimizationPackage = rawPkg;
          } else {
            delete migratedSite.optimizationPackage;
          }

          return applyEditorialContentPackageDefaults(
            applySemrushProjectDefaults(
              applyGa4PropertyIdDefaults(
                applyWpEngineHostingDefaults(applyShutterSpotDisplayNameMigration(migratedSite)),
              ),
            ),
          );
        });

        // Save migrated sites back to localStorage if any changes were made
        if (JSON.stringify(migrated) !== JSON.stringify(sites)) {
          localStorage.setItem(WORDPRESS_SITES_STORAGE_KEY, JSON.stringify(migrated));
        }

        return migrated;
      }
    }
  } catch (e) {
    console.error("Failed to parse stored WordPress sites:", e);
  }

  // Return default seed and self-heal storage if not populated
  const tombstones = getDeletedSitesTombstones();
  const seed = DEFAULT_PROPERTIES_SEED_SITES.filter((s) => !isSiteTombstoned(s, tombstones));
  if (typeof localStorage !== "undefined" && seed.length > 0) {
    try {
      localStorage.setItem(WORDPRESS_SITES_STORAGE_KEY, JSON.stringify(seed));
    } catch {
      /* ignore */
    }
  }
  return seed;
}

export function saveSites(sites: WordPressSite[]): void {
  const tombstones = getDeletedSitesTombstones();
  const filtered = sites.filter((s) => !isSiteTombstoned(s, tombstones));

  // Safety guard: never wipe all sites via tombstone filtering if incoming list was non-empty
  const target = sites.length > 0 && filtered.length === 0 ? sites : filtered;
  const persisted = target.map(stripInlineClientLogoFromSite);

  void syncWordPressSitesToServer(persisted);
  void saveWordPressProperties(persisted).catch(() => {});

  try {
    const fullJson = JSON.stringify(persisted);
    if (tryPersistSitesJson(fullJson)) return;

    const slimJson = JSON.stringify(persisted.map(slimSiteForLocalStorage));
    if (tryPersistSitesJson(slimJson)) {
      console.warn(
        "[Integrations] Saved slim WordPress sites (omitted sitemap URLs/post metadata) due to localStorage quota.",
      );
      return;
    }

    const minimalJson = JSON.stringify(persisted.map(minimalSiteForLocalStorage));
    if (tryPersistSitesJson(minimalJson)) {
      console.warn(
        "[Integrations] Saved minimal WordPress sites (credentials + config only) due to localStorage quota.",
      );
      return;
    }

    console.warn(
      "Failed to save WordPress sites to localStorage (quota exceeded even after slimming). Session and server sync are unchanged.",
    );
    notify.error(NOTIFY_COULD_NOT_SAVE_SITES_TO_LOCAL_STORAGE);
  } catch (e) {
    console.error("Failed to save WordPress sites:", e);
    notify.error(NOTIFY_COULD_NOT_SAVE_SITES_TO_LOCAL_STORAGE);
  }
}

/**
 * Restores Integrations property names from NAP + server mirror (longest label wins).
 * Clears header-only `menuDisplayName` overrides. Runs once per browser profile.
 */
export async function restoreOriginalPropertyNamesOnce(): Promise<boolean> {
  if (typeof localStorage === "undefined") return false;
  if (localStorage.getItem(WP_SITES_RESTORE_ORIGINAL_NAMES_ONCE_KEY)) return false;

  const stored = localStorage.getItem(WORDPRESS_SITES_STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(WP_SITES_RESTORE_ORIGINAL_NAMES_ONCE_KEY, "1");
    return false;
  }

  let sites: WordPressSite[];
  try {
    sites = JSON.parse(stored) as WordPressSite[];
  } catch {
    localStorage.setItem(WP_SITES_RESTORE_ORIGINAL_NAMES_ONCE_KEY, "1");
    return false;
  }

  const serverSites = await fetchWordPressSitesMirror();
  let changed = false;
  const restored = sites.map((site) => {
    const mirror = findMirrorSiteRow(site, serverSites);
    const before = JSON.stringify({ name: site.name, menuDisplayName: site.menuDisplayName });
    let next = restoreOriginalIntegrationsSiteName(site, mirror);
    next = applySemrushProjectDefaults(
      applyGa4PropertyIdDefaults(
        applyWpEngineHostingDefaults(applyShutterSpotDisplayNameMigration(next)),
      ),
    );
    if (JSON.stringify({ name: next.name, menuDisplayName: next.menuDisplayName }) !== before) {
      changed = true;
    }
    return next;
  });

  localStorage.setItem(WP_SITES_RESTORE_ORIGINAL_NAMES_ONCE_KEY, "1");
  if (changed) saveSites(restored);
  return changed;
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
    // local /api unreachable, fallback to Render Hub
  }

  // Fallback 1: Production Render hub live mirror with strict timeout
  try {
    const hubUrl = "https://pulse-host-wp-hub.onrender.com/api/manager-wordpress-properties/load";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${hubUrl}?_=${Date.now()}`, {
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
    // continue to bundled seed
  }

  // Fallback 2: Bundled seed
  const tombstones = getDeletedSitesTombstones();
  return DEFAULT_PROPERTIES_SEED_SITES.filter((s) => !isSiteTombstoned(s, tombstones));
}

function findMirrorSiteRow(local: WordPressSite, serverSites: WordPressSite[]): WordPressSite | undefined {
  const byId = serverSites.find((s) => s.id === local.id);
  if (byId) return byId;
  const host = wordPressSiteHostKey(local.siteUrl);
  if (host) {
    const byHost = serverSites.find((s) => wordPressSiteHostKey(s.siteUrl) === host);
    if (byHost) return byHost;
  }
  const nameKey = (local.name ?? "").trim().toLowerCase();
  if (!nameKey) return undefined;
  return serverSites.find((s) => (s.name ?? "").trim().toLowerCase() === nameKey);
}

const MIRROR_INTEGRATION_ID_FIELDS = [
  "gbpLocationId",
  "ga4PropertyId",
  "googleAdsCustomerId",
  "semrushSiteAuditProjectId",
  "semrushPositionTrackingProjectId",
  "semrushPositionTrackingCampaignId",
  "wpEngineInstall",
  "wpEngineAccountId",
] as const;

/** Merge server-mirrored integration IDs (GBP, GA4, Google Ads, Semrush, WP Engine) onto local sites when the browser copy is missing them. */
export async function mergeServerGbpLocationIdsIntoLocalSites(): Promise<boolean> {
  const serverSites = await fetchWordPressSitesMirror();
  if (serverSites.length === 0) return false;

  const local = getStoredSites();
  if (local.length === 0) return false;

  let changed = false;
  const merged = local.map((site) => {
    const row = findMirrorSiteRow(site, serverSites);
    if (!row) return site;
    let next = site;
    for (const field of MIRROR_INTEGRATION_ID_FIELDS) {
      const value = row[field]?.trim();
      if (value && !site[field]?.trim()) {
        next = { ...next, [field]: value };
        changed = true;
      }
    }
    const serverLogo = row.clientLogoUrl?.trim();
    if (serverLogo) {
      const localLogo = site.clientLogoUrl?.trim();
      const serverAt = row.clientLogoFetchedAt ?? 0;
      const localAt = site.clientLogoFetchedAt ?? 0;
      if (!localLogo || serverAt > localAt) {
        next = {
          ...next,
          clientLogoUrl: serverLogo,
          clientLogoSource: row.clientLogoSource,
          clientLogoFetchedAt: row.clientLogoFetchedAt,
        };
        changed = true;
      }
    }
    return next;
  });

  // NOTE: Never resurrect server sites that do not exist in local.
  // Pushing serverSite back into local was resurrecting deleted properties!

  if (!changed) return false;
  saveSites(merged);
  return true;
}

/** Homepage logo fetch for properties missing `clientLogoUrl` (same as Profile “Fetch from site”). */
export async function fetchAndPersistMissingClientLogos(
  sitesToScan: WordPressSite[] = getStoredSites(),
): Promise<boolean> {
  const targets = sitesToScan.filter(
    (s) => !s.clientLogoUrl?.trim() && Boolean(resolveClientSiteOrigin(s)),
  );
  if (targets.length === 0) return false;

  const byId = new Map(getStoredSites().map((s) => [s.id, s]));
  let changed = false;

  for (const site of targets) {
    try {
      const result = await fetchClientSiteLogoUrl(site);
      byId.set(site.id, {
        ...site,
        clientLogoUrl: result.logoUrl,
        clientLogoSource: result.source,
        clientLogoFetchedAt: Date.now(),
      });
      changed = true;
    } catch {
      continue;
    }
  }

  if (!changed) return false;
  saveSites([...byId.values()]);
  return true;
}

export function hasUsableLocalSites(sites: WordPressSite[]): boolean {
  return sites.some((s) => Boolean(s.siteUrl?.trim() && s.username?.trim()));
}

/** Restore properties from server mirror only when local storage has no usable sites. */
export async function restoreSitesFromServerMirrorIfEmpty(): Promise<WordPressSite[]> {
  const rawStored = typeof localStorage !== "undefined" ? localStorage.getItem(WORDPRESS_SITES_STORAGE_KEY) : null;
  if (rawStored) {
    try {
      const parsed = JSON.parse(rawStored) as WordPressSite[];
      if (hasUsableLocalSites(parsed)) {
        return getStoredSites();
      }
    } catch {
      /* ignore */
    }
  }

  // Pre-seed storage immediately so UI paints immediately with all 17 clients
  const tombstones = getDeletedSitesTombstones();
  const seed = DEFAULT_PROPERTIES_SEED_SITES.filter((s) => !isSiteTombstoned(s, tombstones));
  if (seed.length > 0) {
    saveSites(seed);
  }

  // Then fetch mirror in background
  const mirror = await fetchWordPressSitesMirror();
  if (mirror.length > 0) {
    const filteredMirror = mirror.filter((s) => !isSiteTombstoned(s, tombstones));
    if (filteredMirror.length > 0) {
      saveSites(filteredMirror);
    }
  }

  return getStoredSites();
}

/** First visit on a new origin: pull server sites.json into localStorage when empty. */
export async function hydrateLocalSitesFromServerMirrorIfEmpty(): Promise<boolean> {
  const before = hasUsableLocalSites(getStoredSites());
  const restored = await restoreSitesFromServerMirrorIfEmpty();
  return restored.length > 0 && !before;
}

/** After sites hydrate, restore manager cloud snapshot when browser storage is fresh. Never overwrites properties. */
export async function hydrateManagerCloudSettingsIfEmpty(): Promise<boolean> {
  if (!hasUsableLocalSites(getStoredSites())) return false;
  try {
    if (localStorage.getItem(WORDPRESS_SITES_STORAGE_KEY) == null) return false;
  } catch {
    return false;
  }
  const { snapshot } = await loadManagerSettingsFromCloud();
  if (!snapshot) return false;
  const keys = { ...snapshot.keys };
  delete keys[WORDPRESS_SITES_STORAGE_KEY];
  const result = applyManagerCloudSnapshotToLocalStorage({ ...snapshot, keys });
  return result.keyCount > 0 && !result.error;
}

/** Boot hook for new domains (e.g. neodigital.ca/app). */
export async function hydrateLocalAppStateFromServerIfEmpty(): Promise<{
  sitesHydrated: boolean;
  cloudHydrated: boolean;
}> {
  await restoreSitesFromServerMirrorIfEmpty();
  const sitesHydrated = getStoredSites().length > 0;
  const cloudHydrated = sitesHydrated ? await hydrateManagerCloudSettingsIfEmpty() : false;
  return { sitesHydrated, cloudHydrated };
}

/** GA4 Property ID field only (Google Ads customer ID is separate). */
export function inferGa4PropertyIdFromSiteFields(site: WordPressSite): string {
  return site.ga4PropertyId?.trim() ?? "";
}

