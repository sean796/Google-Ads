import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import {
  buildDashboardEditorialMonthOptions,
  getDefaultDashboardEditorialMonthKey,
  resolveEditorialCountsRangeForDashboard,
  getLocalDayKey,
  type EditorialCountsRange,
} from "@/lib/quarter-bounds";
import { isEntitySitemapDisabled } from "@/lib/entity-endpoint-extractor";
import { fetchQuarterEditorialCounts } from "@/lib/wordpress-api/post-quarter-counts";
import type { QuarterEditorialCountsResult, QuarterEditorialTileStats } from "@/lib/wordpress-api/types";

const CACHE_PREFIX = "neo-pulse-quarter-editorial:v3";

type CachedQuarterPayload = Pick<
  QuarterEditorialCountsResult,
  | "postsPublished"
  | "postsScheduled"
  | "entityPublished"
  | "entityScheduled"
  | "entityConfigured"
  | "entityCountsAvailable"
  | "entityCollection"
>;

function cacheKey(siteId: string, after: string, before: string): string {
  return `${CACHE_PREFIX}:${siteId}:${after}:${before}`;
}

function parseCached(raw: string): CachedQuarterPayload | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof o.postsPublished !== "number" ||
      typeof o.postsScheduled !== "number" ||
      typeof o.entityConfigured !== "boolean" ||
      typeof o.entityCountsAvailable !== "boolean"
    ) {
      return null;
    }
    if (o.entityCountsAvailable) {
      if (typeof o.entityPublished !== "number" || typeof o.entityScheduled !== "number") {
        return null;
      }
    }
    return {
      postsPublished: o.postsPublished,
      postsScheduled: o.postsScheduled,
      entityPublished:
        typeof o.entityPublished === "number" ? o.entityPublished : null,
      entityScheduled:
        typeof o.entityScheduled === "number" ? o.entityScheduled : null,
      entityConfigured: o.entityConfigured,
      entityCountsAvailable: o.entityCountsAvailable,
      entityCollection:
        typeof o.entityCollection === "string" ? o.entityCollection : undefined,
    };
  } catch {
    /* ignore */
  }
  return null;
}

function readCache(
  siteId: string,
  after: string,
  before: string,
): CachedQuarterPayload | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(siteId, after, before));
    if (!raw) return null;
    return parseCached(raw);
  } catch {
    return null;
  }
}

function writeCache(siteId: string, after: string, before: string, payload: CachedQuarterPayload): void {
  try {
    sessionStorage.setItem(cacheKey(siteId, after, before), JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

function clearSiteCacheForRange(siteId: string, after: string, before: string): void {
  try {
    sessionStorage.removeItem(cacheKey(siteId, after, before));
  } catch {
    /* ignore */
  }
}

function resultToTilePartial(
  r: CachedQuarterPayload,
  range: EditorialCountsRange,
): Omit<QuarterEditorialTileStats, "loading"> {
  return {
    quarterLabel: range.quarterLabel,
    errorTitle: undefined,
    postsLive: typeof r.postsPublished === "number" ? r.postsPublished : null,
    postsScheduled: typeof r.postsScheduled === "number" ? r.postsScheduled : null,
    entityLive:
      r.entityCountsAvailable && typeof r.entityPublished === "number"
        ? r.entityPublished
        : null,
    entityScheduled:
      r.entityCountsAvailable && typeof r.entityScheduled === "number"
        ? r.entityScheduled
        : null,
    entityConfigured: Boolean(r.entityConfigured),
    entityCountsAvailable: Boolean(r.entityCountsAvailable),
    entityCollectionLabel: r.entityCollection?.trim(),
    countsPeriodAfterIso: range.after,
    countsPeriodEndExclusiveIso: range.before,
    countsPeriodMode: range.mode,
  };
}

function siteHasCredentials(s: WordPressSite): boolean {
  return Boolean(s.siteUrl?.trim() && s.username?.trim() && s.appPassword?.trim());
}

/** SAP (`service-area`) is always counted server-side, so the entity slot is always configured. */
function loadingPlaceholderForSite(_site: WordPressSite, range: EditorialCountsRange): QuarterEditorialTileStats {
  return {
    quarterLabel: range.quarterLabel,
    loading: true,
    postsLive: null,
    postsScheduled: null,
    entityLive: null,
    entityScheduled: null,
    entityConfigured: true,
    entityCountsAvailable: false,
    countsPeriodAfterIso: range.after,
    countsPeriodEndExclusiveIso: range.before,
    countsPeriodMode: range.mode,
  };
}

function canPreserveCountsOnError(tile: QuarterEditorialTileStats | undefined): boolean {
  return Boolean(
    tile &&
      typeof tile.postsLive === "number" &&
      typeof tile.postsScheduled === "number",
  );
}

/** Keep showing prior quarter totals while refetching when any live/scheduled count was > 0 for the same window. */
function shouldPreserveQuarterTileDuringRefresh(
  old: QuarterEditorialTileStats | undefined,
  range: EditorialCountsRange,
): boolean {
  if (!old) return false;
  if (old.countsPeriodAfterIso !== range.after || old.countsPeriodEndExclusiveIso !== range.before) {
    return false;
  }
  const pl = old.postsLive;
  const ps = old.postsScheduled;
  if (typeof pl === "number" && Number.isFinite(pl) && pl > 0) return true;
  if (typeof ps === "number" && Number.isFinite(ps) && ps > 0) return true;
  if (old.entityConfigured && old.entityCountsAvailable) {
    const el = old.entityLive;
    const es = old.entityScheduled;
    if (typeof el === "number" && Number.isFinite(el) && el > 0) return true;
    if (typeof es === "number" && Number.isFinite(es) && es > 0) return true;
  }
  return false;
}

/** Tiles for a manual refresh: keep prior non-zero totals visible (loading), else a loading placeholder; drop sites no longer listed. */
export function buildQuarterTilesForRefresh(
  list: WordPressSite[],
  prev: Record<string, QuarterEditorialTileStats>,
  resolveRange: (site: WordPressSite, now: Date) => EditorialCountsRange,
  now: Date,
): Record<string, QuarterEditorialTileStats> {
  const next: Record<string, QuarterEditorialTileStats> = { ...prev };
  for (const s of list) {
    const range = resolveRange(s, now);
    const old = prev[s.id];
    next[s.id] = shouldPreserveQuarterTileDuringRefresh(old, range)
      ? { ...old!, loading: true, errorTitle: undefined }
      : loadingPlaceholderForSite(s, range);
  }
  const keep = new Set(list.map((s) => s.id));
  for (const id of Object.keys(next)) {
    if (!keep.has(id)) delete next[id];
  }
  return next;
}

export function useQuarterEditorialCounts(sites: WordPressSite[]): {
  bySiteId: Record<string, QuarterEditorialTileStats>;
  dayKey: string;
  refreshAllQuarterCounts: () => Promise<void>;
  isRefreshingAllQuarterCounts: boolean;
  selectedMonthKey: string;
  setSelectedMonthKey: (monthKey: string) => void;
  monthOptions: Array<{ key: string; label: string }>;
} {
  const [tick, setTick] = useState(0);
  const [isRefreshingAllQuarterCounts, setIsRefreshingAllQuarterCounts] = useState(false);
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => getDefaultDashboardEditorialMonthKey());
  const monthOptions = useMemo(() => buildDashboardEditorialMonthOptions(new Date()), [tick]);

  const dayKey = useMemo(() => {
    void tick;
    return getLocalDayKey(new Date());
  }, [tick]);
  const dayKeyRef = useRef(dayKey);
  dayKeyRef.current = dayKey;

  useEffect(() => {
    const now = Date.now();
    const nextMid = new Date();
    nextMid.setDate(nextMid.getDate() + 1);
    nextMid.setHours(0, 0, 0, 0);
    const ms = Math.max(5_000, nextMid.getTime() - now);
    const t = window.setTimeout(() => setTick((x) => x + 1), ms);
    return () => window.clearTimeout(t);
  }, [tick]);

  useEffect(() => {
    let last = dayKeyRef.current;
    const id = window.setInterval(() => {
      const nk = getLocalDayKey(new Date());
      if (nk !== last) {
        last = nk;
        setTick((x) => x + 1);
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const nk = getLocalDayKey(new Date());
      if (nk !== dayKeyRef.current) {
        setTick((x) => x + 1);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const bootstrapBySiteFromCache = useCallback(
    (list: WordPressSite[], monthKey: string): Record<string, QuarterEditorialTileStats> => {
      const out: Record<string, QuarterEditorialTileStats> = {};
      const now = new Date();
      for (const s of list) {
        const range = resolveEditorialCountsRangeForDashboard(
          s.editorialCountsPeriodStartYmd,
          monthKey,
          now,
        );
        const cached = readCache(s.id, range.after, range.before);
        if (cached) {
          out[s.id] = {
            loading: false,
            ...resultToTilePartial(cached, range),
          };
        }
      }
      return out;
    },
    [],
  );

  const [bySiteId, setBySiteId] = useState<Record<string, QuarterEditorialTileStats>>(() => {
    const initialMonth = getDefaultDashboardEditorialMonthKey();
    const list = sites.filter(siteHasCredentials);
    return bootstrapBySiteFromCache(list, initialMonth);
  });
  const selectedMonthRef = useRef(selectedMonthKey);
  selectedMonthRef.current = selectedMonthKey;
  const sitesRef = useRef(sites);
  sitesRef.current = sites;

  const sitesKey = sites
    .map((s) => `${s.id}:${s.editorialCountsPeriodStartYmd?.trim() ?? ""}`)
    .join(",");

  const resolveRange = useCallback(
    (site: WordPressSite, now: Date) =>
      resolveEditorialCountsRangeForDashboard(
        site.editorialCountsPeriodStartYmd,
        selectedMonthKey,
        now,
      ),
    [selectedMonthKey],
  );

  const fetchQuarterFromNetwork = useCallback(async (site: WordPressSite) => {
    const range = resolveRange(site, new Date());
    const applyIfCurrent: typeof setBySiteId = (u) => {
      if (selectedMonthRef.current === selectedMonthKey) setBySiteId(u);
    };
    const entitySitemapUrlForFetch = isEntitySitemapDisabled(site) ? undefined : site.entitySitemapUrl;

    try {
      const result = await fetchQuarterEditorialCounts({
        siteUrl: site.siteUrl,
        username: site.username,
        appPassword: site.appPassword,
        after: range.after,
        before: range.before,
        entitySitemapUrl: entitySitemapUrlForFetch,
        manualEndpoint: site.manualEndpoint,
      });

      if (result.ok) {
        const eco = Boolean(result.entityCountsAvailable);
        const cachePayload: CachedQuarterPayload = {
          postsPublished: result.postsPublished ?? 0,
          postsScheduled: result.postsScheduled ?? 0,
          entityConfigured: Boolean(result.entityConfigured),
          entityCountsAvailable: eco,
          entityPublished: eco ? (result.entityPublished ?? 0) : null,
          entityScheduled: eco ? (result.entityScheduled ?? 0) : null,
          entityCollection: result.entityCollection,
        };

        writeCache(site.id, range.after, range.before, cachePayload);

        applyIfCurrent((prev) => ({
          ...prev,
          [site.id]: {
            loading: false,
            ...resultToTilePartial(cachePayload, range),
          },
        }));
      } else {
        const err = result.error || "Could not load quarter counts.";
        applyIfCurrent((prev) => {
          const old = prev[site.id];
          if (canPreserveCountsOnError(old)) {
            return {
              ...prev,
              [site.id]: {
                ...old,
                loading: false,
                errorTitle: err,
              },
            };
          }
          return {
            ...prev,
            [site.id]: {
              quarterLabel: range.quarterLabel,
              loading: false,
              postsLive: null,
              postsScheduled: null,
              entityLive: null,
              entityScheduled: null,
              entityConfigured: true,
              entityCountsAvailable: false,
              countsPeriodAfterIso: range.after,
              countsPeriodEndExclusiveIso: range.before,
              countsPeriodMode: range.mode,
              errorTitle: err,
            },
          };
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load quarter counts.";
      applyIfCurrent((prev) => {
        const old = prev[site.id];
        if (canPreserveCountsOnError(old)) {
          return {
            ...prev,
            [site.id]: {
              ...old,
              loading: false,
              errorTitle: msg,
            },
          };
        }
        return {
          ...prev,
          [site.id]: {
            quarterLabel: range.quarterLabel,
            loading: false,
            postsLive: null,
            postsScheduled: null,
            entityLive: null,
            entityScheduled: null,
            entityConfigured: true,
            entityCountsAvailable: false,
            countsPeriodAfterIso: range.after,
            countsPeriodEndExclusiveIso: range.before,
            countsPeriodMode: range.mode,
            errorTitle: msg,
          },
        };
      });
    }
  }, [resolveRange, selectedMonthKey]);

  const runFetch = useCallback(async () => {
    void tick;
    void sitesKey;
    void selectedMonthKey;
    const list = sitesRef.current.filter(siteHasCredentials);

    const missing: WordPressSite[] = [];
    setBySiteId((prev) => {
      const next: Record<string, QuarterEditorialTileStats> = { ...prev };
      for (const s of list) {
        const range = resolveRange(s, new Date());
        const cached = readCache(s.id, range.after, range.before);
        if (cached) {
          next[s.id] = {
            loading: false,
            ...resultToTilePartial(cached, range),
          };
        } else {
          missing.push(s);
          if (shouldPreserveQuarterTileDuringRefresh(prev[s.id], range)) {
            next[s.id] = {
              ...prev[s.id]!,
              loading: true,
              errorTitle: undefined,
            };
          } else {
            next[s.id] = loadingPlaceholderForSite(s, range);
          }
        }
      }
      const keep = new Set(list.map((s) => s.id));
      for (const id of Object.keys(next)) {
        if (!keep.has(id)) {
          delete next[id];
        }
      }
      return next;
    });

    if (missing.length === 0) return;
    await Promise.all(missing.map((site) => fetchQuarterFromNetwork(site)));
  }, [tick, sitesKey, selectedMonthKey, resolveRange, fetchQuarterFromNetwork]);

  useEffect(() => {
    void runFetch();
  }, [runFetch]);

  const refreshAllQuarterCounts = useCallback(async () => {
    const list = sitesRef.current.filter(siteHasCredentials);
    if (list.length === 0) {
      return;
    }
    for (const site of list) {
      const range = resolveRange(site, new Date());
      clearSiteCacheForRange(site.id, range.after, range.before);
    }
    setBySiteId((prev) => buildQuarterTilesForRefresh(list, prev, resolveRange, new Date()));
    setIsRefreshingAllQuarterCounts(true);
    try {
      await Promise.all(list.map((site) => fetchQuarterFromNetwork(site)));
    } finally {
      setIsRefreshingAllQuarterCounts(false);
    }
  }, [fetchQuarterFromNetwork, resolveRange]);

  return {
    bySiteId,
    dayKey,
    refreshAllQuarterCounts,
    isRefreshingAllQuarterCounts,
    selectedMonthKey,
    setSelectedMonthKey,
    monthOptions,
  };
}
