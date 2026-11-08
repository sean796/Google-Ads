import { loadManagerSettingsFromCloud } from "@/lib/manager-cloud-settings-api";
import { applyManagerCloudSnapshotToLocalStorage } from "@/lib/manager-cloud-settings-snapshot";
import { hydrateRuntimeApiKeys } from "@/lib/api";
import { saveWordPressProperties } from "@/lib/manager-wordpress-properties-api";
import { applyGa4PropertyIdDefaults } from "@/lib/ga4-property-id-defaults";
import { applySemrushProjectDefaults } from "@/lib/semrush-project-id-defaults";
import { applyWpEngineHostingDefaults } from "@/lib/wp-engine-install-defaults";
import { wordPressSiteHostKey } from "@/lib/wordpress-site-host-key";
import {
  fetchClientSiteLogoUrl,
  resolveClientSiteOrigin,
} from "@/lib/integrations/client-site-logo";
import type { WordPressSite } from "./types";
import { WORDPRESS_SITES_STORAGE_KEY } from "./types";
import { getDeletedSitesTombstones, isSiteTombstoned } from "./storage-deleted-sites";
import {
  applyShutterSpotDisplayNameMigration,
  isStalePhoenixArizonaLocation,
  minimalSiteForLocalStorage,
  normalizeSiteEntry,
  restoreOriginalIntegrationsSiteName,
  stripInlineClientLogoFromSite,
} from "./storage-site-normalize";
import { fetchWordPressSitesMirror, syncWordPressSitesToServer } from "./storage-server-sync";

export {
  DELETED_WP_SITES_STORAGE_KEY,
  PROTECTED_ACTIVE_CLIENT_NAMES,
  getDeletedSitesTombstones,
  recordDeletedSite,
  isSiteTombstoned,
} from "./storage-deleted-sites";
export type { DeletedSiteRecord } from "./storage-deleted-sites";
export {
  sortWordPressSitesByName,
  clientLogoUrlForLocalStorage,
  stripInlineClientLogoFromSite,
  slimSiteForLocalStorage,
  minimalSiteForLocalStorage,
} from "./storage-site-normalize";
export {
  syncWordPressSitesToServer,
  syncActiveWordPressSiteToServer,
  fetchWordPressSitesMirror,
} from "./storage-server-sync";

/** One-time undo for header display-name edits that overwrote or shortened property names. */
export const WP_SITES_RESTORE_ORIGINAL_NAMES_ONCE_KEY =
  "neo-pulse-wp-sites-restore-original-names-v1";

/** Node worker override for server post creator harness (no browser localStorage). */
let serverHarnessSitesOverride: WordPressSite[] | null = null;
/** In-memory runtime store for connected WordPress sites (backed by server mirror). */
let memorySitesStore: WordPressSite[] | null = null;

export function setServerHarnessSitesOverride(sites: WordPressSite[] | null): void {
  serverHarnessSitesOverride = sites;
}

let legacyLocalStorageCachesPurged = false;

function purgeLegacyLocalStorageCaches(): void {
  if (legacyLocalStorageCachesPurged || typeof localStorage === "undefined") return;
  legacyLocalStorageCachesPurged = true;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k.startsWith("neo-pulse-site-prefetch:") ||
        k.startsWith("neo-pulse-overview-rows-local:") ||
        k.startsWith("neo-pulse-overview-active-row-body:") ||
        k === "kb_files"
      ) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) {
      localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

function tryPersistSitesJson(json: string): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    localStorage.setItem(WORDPRESS_SITES_STORAGE_KEY, json);
    return true;
  } catch {
    purgeLegacyLocalStorageCaches();
    try {
      localStorage.setItem(WORDPRESS_SITES_STORAGE_KEY, json);
      return true;
    } catch {
      return false;
    }
  }
}

export function getStoredSites(): WordPressSite[] {
  const tombstones = getDeletedSitesTombstones();
  if (serverHarnessSitesOverride?.length) {
    return serverHarnessSitesOverride
      .filter((s) => !isSiteTombstoned(s, tombstones))
      .map(normalizeSiteEntry);
  }
  if (memorySitesStore && memorySitesStore.length > 0) {
    return memorySitesStore
      .filter((s) => !isSiteTombstoned(s, tombstones))
      .map(normalizeSiteEntry);
  }
  if (typeof localStorage !== "undefined") {
    purgeLegacyLocalStorageCaches();
    try {
      const stored = localStorage.getItem(WORDPRESS_SITES_STORAGE_KEY);
      if (stored) {
        const sites = JSON.parse(stored) as WordPressSite[];
        const activeSites = sites.filter((s) => !isSiteTombstoned(s, tombstones));
        if (activeSites.length > 0) {
          const migrated = activeSites.map(normalizeSiteEntry);
          memorySitesStore = migrated;
          return migrated;
        }
      }
    } catch {
      /* ignore corrupt or legacy storage */
    }
  }

  // Wave 0: no bundled seed. A fresh profile with no server mirror gets an
  // empty, visible site list until the mirror loads.
  memorySitesStore = [];
  return [];
}

export function saveSites(sites: WordPressSite[]): void {
  const tombstones = getDeletedSitesTombstones();
  const filtered = sites.filter((s) => !isSiteTombstoned(s, tombstones));

  const target = sites.length > 0 && filtered.length === 0 ? sites : filtered;
  const persisted = target.map((s) => normalizeSiteEntry(stripInlineClientLogoFromSite(s)));
  memorySitesStore = persisted;

  void syncWordPressSitesToServer(persisted);
  void saveWordPressProperties(persisted).catch(() => {});

  const minimalJson = JSON.stringify(persisted.map(minimalSiteForLocalStorage));
  if (!tryPersistSitesJson(minimalJson)) {
    try {
      localStorage.removeItem(WORDPRESS_SITES_STORAGE_KEY);
    } catch {
      /* ignore */
    }
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
  "primaryLocalKeyword",
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
    const rowLocs = row.locations ?? row.napInfo?.locations ?? [];
    const localLocs = next.locations ?? next.napInfo?.locations ?? [];
    if (
      rowLocs.length > 0 &&
      (localLocs.length === 0 ||
        isStalePhoenixArizonaLocation(next) ||
        (localLocs.length < rowLocs.length && localLocs[0]?.city === rowLocs[0]?.city))
    ) {
      next = {
        ...next,
        locations: rowLocs,
        napInfo: row.napInfo ?? { ...(next.napInfo ?? { name: next.name }), locations: rowLocs },
      };
      changed = true;
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

  const tombstones = getDeletedSitesTombstones();
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
  hydrateRuntimeApiKeys(snapshot.keys);
  const keys = { ...snapshot.keys };
  delete keys[WORDPRESS_SITES_STORAGE_KEY];
  const result = applyManagerCloudSnapshotToLocalStorage({ ...snapshot, keys });
  return result.keyCount > 0 && !result.error;
}

let runtimeKeysHydration: Promise<void> | null = null;
let runtimeKeysHydrationScope = "";

function workspaceHydrationScope(teamId?: number | null): string {
  return teamId == null ? "manager" : `team:${teamId}`;
}

/** Hydrate in-memory API keys from workspace storage (same team scope as save). */
export function hydrateRuntimeApiKeysFromCloud(teamId?: number | null): Promise<void> {
  const scope = workspaceHydrationScope(teamId);
  if (runtimeKeysHydration && runtimeKeysHydrationScope === scope) {
    return runtimeKeysHydration;
  }
  runtimeKeysHydrationScope = scope;
  runtimeKeysHydration = (async () => {
    const { snapshot } = await loadManagerSettingsFromCloud(teamId);
    if (snapshot) hydrateRuntimeApiKeys(snapshot.keys);
    try {
      window.dispatchEvent(new CustomEvent("neo-pulse-runtime-keys-hydrated"));
    } catch {
      /* non-browser */
    }
  })().catch(() => {
    runtimeKeysHydration = null;
    runtimeKeysHydrationScope = "";
  });
  return runtimeKeysHydration;
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
