import { wordPressSiteHostKey } from "@/lib/wordpress-site-host-key";

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
