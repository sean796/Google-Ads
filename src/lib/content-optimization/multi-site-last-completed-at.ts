import type { WordPressSite } from "@/components/integrations/types";
import type { MultiSiteUrlSource } from "@/lib/content-optimization/multi-site-source-urls";
import { resolveSitemapSyncedAtIsoForMode } from "@/lib/content-optimization/multi-site-sitemap-synced-at";

const STORAGE_KEY = "neo-pulse-multi-site-last-sitemap-optimize";

function isValidCompletedIso(iso: string | undefined): boolean {
  if (!iso?.trim()) return false;
  const ms = new Date(iso).getTime();
  return !Number.isNaN(ms);
}

function maxIso(...candidates: (string | undefined)[]): string | undefined {
  let best: string | undefined;
  let bestMs = -Infinity;
  for (const iso of candidates) {
    if (!iso?.trim()) continue;
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = iso.trim();
    }
  }
  return best;
}

function latestIsoAcrossSources(
  by: Partial<Record<MultiSiteUrlSource, string>> | undefined,
): string | undefined {
  if (!by) return undefined;
  let best: string | undefined;
  let bestMs = -Infinity;
  for (const k of ["both", "post", "entity"] as const) {
    const iso = by[k];
    if (!isValidCompletedIso(iso)) continue;
    const trimmed = iso!.trim();
    const ms = new Date(trimmed).getTime();
    if (ms > bestMs) {
      bestMs = ms;
      best = trimmed;
    }
  }
  return best;
}

function latestCompletedIsoForBoth(
  by: Partial<Record<MultiSiteUrlSource, string>> | undefined,
): string | undefined {
  return latestIsoAcrossSources(by);
}

/**
 * Last AI optimization completion for the row sitemap mode (localStorage).
 * If there is a stored completion for "Both", that same timestamp is shown for Post and Entity too.
 */
export function resolveLastOptimizedIsoForSitemapMode(
  by: Partial<Record<MultiSiteUrlSource, string>> | undefined,
  source: MultiSiteUrlSource,
): string | undefined {
  if (!by) return undefined;
  if (isValidCompletedIso(by.both)) {
    return by.both!.trim();
  }
  if (source === "both") {
    return latestCompletedIsoForBoth(by);
  }
  const raw = by[source]?.trim();
  if (isValidCompletedIso(raw)) return raw;
  return latestIsoAcrossSources(by);
}

/** Latest sitemap sync, optimization completion, or manual row date for the multi-site row. */
export function resolveMultiSiteRowActivityIso(
  optimizedBySource: Partial<Record<MultiSiteUrlSource, string>> | undefined,
  manualBySource: Partial<Record<MultiSiteUrlSource, string>> | undefined,
  source: MultiSiteUrlSource,
  site: WordPressSite,
  postSitemapUrl: string | null,
): string | undefined {
  const synced = resolveSitemapSyncedAtIsoForMode(site, source, postSitemapUrl);
  const optimized = resolveLastOptimizedIsoForSitemapMode(optimizedBySource, source);
  const manual = resolveManualRowDateIsoForMode(manualBySource, source);
  return maxIso(optimized, manual, synced);
}

export type MultiSiteLastCompletedBySite = Record<string, Partial<Record<MultiSiteUrlSource, string>>>;

export function readMultiSiteLastCompletedMap(): MultiSiteLastCompletedBySite {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: MultiSiteLastCompletedBySite = {};
    for (const [siteId, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!siteId || !v || typeof v !== "object") continue;
      const rec = v as Record<string, unknown>;
      const post = typeof rec.post === "string" ? rec.post : undefined;
      const entity = typeof rec.entity === "string" ? rec.entity : undefined;
      const both = typeof rec.both === "string" ? rec.both : undefined;
      if (post || entity || both)
        out[siteId] = { ...(post ? { post } : {}), ...(entity ? { entity } : {}), ...(both ? { both } : {}) };
    }
    return out;
  } catch {
    return {};
  }
}

export function persistMultiSiteLastCompleted(
  siteId: string,
  source: MultiSiteUrlSource,
  completedAtIso: string,
): MultiSiteLastCompletedBySite {
  const prev = readMultiSiteLastCompletedMap();
  const next = {
    ...prev,
    [siteId]: {
      ...(prev[siteId] || {}),
      [source]: completedAtIso,
    },
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

const MANUAL_ROW_DATE_STORAGE_KEY = "neo-pulse-multi-site-manual-row-date";

export type MultiSiteManualRowDateBySite = Record<string, Partial<Record<MultiSiteUrlSource, string>>>;

export function readMultiSiteManualRowDateMap(): MultiSiteManualRowDateBySite {
  try {
    const raw = localStorage.getItem(MANUAL_ROW_DATE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: MultiSiteManualRowDateBySite = {};
    for (const [siteId, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!siteId || !v || typeof v !== "object") continue;
      const rec = v as Record<string, unknown>;
      const post = typeof rec.post === "string" ? rec.post : undefined;
      const entity = typeof rec.entity === "string" ? rec.entity : undefined;
      const both = typeof rec.both === "string" ? rec.both : undefined;
      if (post || entity || both)
        out[siteId] = { ...(post ? { post } : {}), ...(entity ? { entity } : {}), ...(both ? { both } : {}) };
    }
    return out;
  } catch {
    return {};
  }
}

export function persistMultiSiteManualRowDate(
  siteId: string,
  source: MultiSiteUrlSource,
  pickedAtIso: string,
): MultiSiteManualRowDateBySite {
  const prev = readMultiSiteManualRowDateMap();
  const next = {
    ...prev,
    [siteId]: {
      ...(prev[siteId] || {}),
      [source]: pickedAtIso,
    },
  };
  try {
    localStorage.setItem(MANUAL_ROW_DATE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

/** Manual calendar pick for a row sitemap mode (localStorage). */
export function resolveManualRowDateIsoForMode(
  by: Partial<Record<MultiSiteUrlSource, string>> | undefined,
  source: MultiSiteUrlSource,
): string | undefined {
  if (!by) return undefined;
  if (isValidCompletedIso(by.both)) {
    return by.both!.trim();
  }
  if (source === "both") {
    return latestIsoAcrossSources(by);
  }
  const raw = by[source]?.trim();
  if (isValidCompletedIso(raw)) return raw;
  return latestIsoAcrossSources(by);
}

/** Store a local calendar day as noon local time (stable display across time zones). */
export function localCalendarDateToIso(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  return d.toISOString();
}

export function isoToLocalCalendarDate(iso: string | undefined): Date | undefined {
  if (!iso?.trim()) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Human-readable local calendar date with year (no time of day). */
export function formatMultiSiteCompletedAtLabel(iso: string | undefined): string | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
