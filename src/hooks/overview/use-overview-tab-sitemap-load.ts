import { useCallback, useEffect, useRef, useState } from "react";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import {
  NOTIFY_NO_PUBLISHED_URLS_FOUND_IN_WORDPRESS_INV,
} from "@/lib/notify-messages";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { applyFaqPlaceholderCountToRows, createEmptyOverviewRow } from "@/lib/overview/overview-row-helpers";
import { OVERVIEW_BULK_AI_FAQ_SEED_COUNT } from "@/components/overview/overview-tab-constants";
import {
  canLoadOverviewSitemapSource,
  overviewInventoryCollectionsForOverviewLoad,
  type OverviewSitemapSource,
} from "@/lib/overview/overview-sitemap-source";
import { applyInventoryPatchesToOverviewRows } from "@/lib/overview/overview-inventory-progressive-hydrate";
import { applyCachedElementorFieldsToOverviewRows } from "@/lib/elementor-page-content/elementor-section-headers-from-cache";
import {
  getOverviewRowsSessionCache,
  mergeOverviewRowsForSitemapLoad,
  setOverviewRowsSessionCache,
} from "@/lib/overview/overview-rows-session-cache";
import {
  buildOverviewSitemapLoadFingerprint,
  setOverviewSitemapLoadFingerprint,
} from "@/lib/overview/overview-sitemap-load-cache";
import {
  warmEntitySiteCache,
  getSitePrefetchUrlsForSource,
  NEO_PULSE_SITE_DATA_REFRESHED_EVENT,
} from "@/lib/local-analysis/entity-site-warm-cache";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import type { OverviewTabBase } from "@/hooks/overview/use-overview-tab-base";

type Args = Pick<
  OverviewTabBase,
  | "rowsRef"
  | "setRows"
  | "sitemapSource"
  | "resolveBindings"
  | "prefetchOverviewInventory"
  | "getInventoryMatchForUrl"
  | "bindings"
> & {
  site: WordPressSite | undefined;
  disableAutoSitemapLoad?: boolean;
};

type LoadOptions = {
  force?: boolean;
  silent?: boolean;
  applyToUi?: boolean;
  generation?: number;
};

function finalizeOverviewRowsFromInventory(
  rows: OverviewRow[],
  site: WordPressSite,
  source: OverviewSitemapSource,
  bindingMap: Record<string, OverviewBinding | undefined>,
  getInventoryMatchForUrl: Args["getInventoryMatchForUrl"],
): OverviewRow[] {
  const patched = applyInventoryPatchesToOverviewRows(
    rows,
    site,
    source,
    bindingMap,
    getInventoryMatchForUrl,
  );
  return applyCachedElementorFieldsToOverviewRows(patched, source);
}

export function useOverviewTabSitemapLoad({
  rowsRef,
  setRows,
  sitemapSource,
  site,
  resolveBindings,
  prefetchOverviewInventory,
  getInventoryMatchForUrl,
  bindings,
  disableAutoSitemapLoad = false,
}: Args) {
  const [overviewSitemapLoadBusy, setOverviewSitemapLoadBusy] = useState(false);
  const uiLoadCountByGenerationRef = useRef<Map<number, number>>(new Map());
  const inFlightBySourceRef = useRef<Set<OverviewSitemapSource>>(new Set());
  const siteRef = useRef(site);
  siteRef.current = site;
  const sitemapSourceRef = useRef(sitemapSource);
  sitemapSourceRef.current = sitemapSource;
  const initialLoadKeyRef = useRef<string | null>(null);
  const prevSiteIdRef = useRef<string | undefined>(undefined);
  const prevSitemapSourceRef = useRef<OverviewSitemapSource | null>(null);
  const loadGenerationRef = useRef(0);

  const isStaleLoad = useCallback((generation: number) => generation !== loadGenerationRef.current, []);

  const syncOverviewSitemapLoadBusy = useCallback(() => {
    let activeCount = 0;
    for (const count of uiLoadCountByGenerationRef.current.values()) {
      activeCount += count;
    }
    setOverviewSitemapLoadBusy(activeCount > 0);
  }, []);

  const beginUiLoad = useCallback(
    (generation: number) => {
      const next = (uiLoadCountByGenerationRef.current.get(generation) ?? 0) + 1;
      uiLoadCountByGenerationRef.current.set(generation, next);
      setOverviewSitemapLoadBusy(true);
    },
    [],
  );

  const endUiLoad = useCallback(
    (generation: number) => {
      const current = uiLoadCountByGenerationRef.current.get(generation) ?? 0;
      const next = Math.max(0, current - 1);
      if (next === 0) uiLoadCountByGenerationRef.current.delete(generation);
      else uiLoadCountByGenerationRef.current.set(generation, next);
      syncOverviewSitemapLoadBusy();
    },
    [syncOverviewSitemapLoadBusy],
  );

  const loadOverviewSource = useCallback(
    async (
      activeSite: WordPressSite,
      source: OverviewSitemapSource,
      options?: LoadOptions,
    ): Promise<void> => {
      const force = options?.force === true;
      const generation = options?.generation ?? loadGenerationRef.current;

      if (!canLoadOverviewSitemapSource(activeSite, source)) {
        return;
      }
      if (isStaleLoad(generation)) return;
      warmEntitySiteCache(activeSite);
      if (inFlightBySourceRef.current.has(source)) {
        if (!force) {
          return;
        }
        inFlightBySourceRef.current.delete(source);
      }
      const silent = options?.silent === true;
      const applyToUi =
        options?.applyToUi !== false && source === sitemapSourceRef.current;

      const commitRows = (rowsToStore: OverviewRow[]) => {
        const filtered = rowsToStore.filter((row) => Boolean(row.url?.trim()));
        if (!filtered.length) return;
        setOverviewRowsSessionCache(activeSite.id, source, filtered);
        setOverviewSitemapLoadFingerprint(
          activeSite.id,
          source,
          buildOverviewSitemapLoadFingerprint(activeSite, source),
        );
        if (!isStaleLoad(generation) && source === sitemapSourceRef.current) {
          setRows(filtered);
        }
      };

      inFlightBySourceRef.current.add(source);

      const sessionRows = getOverviewRowsSessionCache(activeSite.id, source) ?? [];
      const hasImmediateRows =
        sessionRows.length > 0 ||
        (applyToUi &&
          rowsRef.current.some(
            (row) =>
              row.url?.trim() &&
              ((row.title || row.pageHeading || "").trim().length > 0),
          ));

      if (hasImmediateRows && applyToUi && !isStaleLoad(generation)) {
        if (sessionRows.length) {
          setRows(sessionRows);
        }
      }

      let uiLoadOpen = false;
      if (!silent && applyToUi && !hasImmediateRows) {
        beginUiLoad(generation);
        uiLoadOpen = true;
      }

      try {
        const inventoryCollections = overviewInventoryCollectionsForOverviewLoad(
          activeSite,
          source,
        );

        const sessionByUrl = new Map(sessionRows.map((r) => [r.url, r]));

        const inv = await prefetchOverviewInventory(activeSite, {
          downloadCsv: false,
          collections: inventoryCollections,
          includeContent: true,
          includePageHeading: true,
          source,
          silent: true,
          forceRefresh: force,
        });

        if (isStaleLoad(generation)) return;

        if (!inv.ok) {
          if (!silent || force) {
            notifyHeaderError(
              "WordPress load failed",
              inv.error || "Could not load WordPress inventory.",
              { duration: 10000 },
            );
          }
          return;
        }

        const warmFallbackUrls =
          !inv.urls?.length ? getSitePrefetchUrlsForSource(activeSite.id, source) ?? [] : [];
        const sessionFallbackUrls =
          !inv.urls?.length && !warmFallbackUrls.length
            ? (getOverviewRowsSessionCache(activeSite.id, source) ?? [])
                .map((r) => r.url?.trim())
                .filter((u): u is string => Boolean(u))
            : [];
        const resolvedUrls = inv.urls?.length
          ? inv.urls
          : warmFallbackUrls.length
            ? warmFallbackUrls
            : sessionFallbackUrls;

        if (!resolvedUrls.length) {
          if (!silent || force) {
            notify.error(NOTIFY_NO_PUBLISHED_URLS_FOUND_IN_WORDPRESS_INV);
          }
          return;
        }

        const existingByUrl = applyToUi
          ? new Map(rowsRef.current.filter((r) => r.url?.trim()).map((r) => [r.url, r]))
          : new Map<string, OverviewRow>();
        const merged = mergeOverviewRowsForSitemapLoad(
          resolvedUrls,
          existingByUrl,
          sessionByUrl,
          createEmptyOverviewRow,
        );
        const rowsFinal = applyFaqPlaceholderCountToRows(
          merged,
          OVERVIEW_BULK_AI_FAQ_SEED_COUNT,
        );

        const bindingMap = await resolveBindings(resolvedUrls, activeSite, undefined, {
          inventoryOnly: true,
          persistBindings: applyToUi,
          source,
        });

        if (isStaleLoad(generation)) return;

        const rowsToCommit = finalizeOverviewRowsFromInventory(
          rowsFinal,
          activeSite,
          source,
          bindingMap,
          getInventoryMatchForUrl,
        );

        if (isStaleLoad(generation)) return;
        commitRows(rowsToCommit);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load sitemap.";
        if (!silent || force) {
          notifyHeaderError("Load failed", msg, { duration: 10000 });
        }
      } finally {
        inFlightBySourceRef.current.delete(source);
        if (uiLoadOpen) {
          endUiLoad(generation);
        }
      }
    },
    [
      rowsRef,
      resolveBindings,
      prefetchOverviewInventory,
      getInventoryMatchForUrl,
      setRows,
      isStaleLoad,
      beginUiLoad,
      endUiLoad,
    ],
  );

  const loadOverviewSourceRef = useRef(loadOverviewSource);
  loadOverviewSourceRef.current = loadOverviewSource;

  const handleLoadSitemap = useCallback(
    async (options?: LoadOptions) => {
      const activeSite = siteRef.current;
      if (!activeSite?.username?.trim() || !activeSite.appPassword?.trim()) return;
      loadGenerationRef.current += 1;
      inFlightBySourceRef.current.clear();
      uiLoadCountByGenerationRef.current.clear();
      setOverviewSitemapLoadBusy(false);
      const generation = loadGenerationRef.current;
      await loadOverviewSource(activeSite, sitemapSourceRef.current, {
        force: options?.force === true,
        silent: options?.silent === true,
        applyToUi: true,
        generation,
      });
    },
    [loadOverviewSource, sitemapSource],
  );

  useEffect(() => {
    if (disableAutoSitemapLoad) {
      return;
    }
    const onSiteDataRefreshed = (event: Event) => {
      const detail = (event as CustomEvent<{ siteId?: string }>).detail;
      const activeSite = siteRef.current;
      if (!activeSite?.id || !detail?.siteId || detail.siteId !== activeSite.id) return;
      void handleLoadSitemap({ force: true, silent: false, applyToUi: true });
    };
    window.addEventListener(NEO_PULSE_SITE_DATA_REFRESHED_EVENT, onSiteDataRefreshed);
    return () => window.removeEventListener(NEO_PULSE_SITE_DATA_REFRESHED_EVENT, onSiteDataRefreshed);
  }, [handleLoadSitemap, disableAutoSitemapLoad]);

  useEffect(() => {
    if (disableAutoSitemapLoad) {
      return;
    }
    if (!site?.username?.trim() || !site.appPassword?.trim()) {
      return;
    }
    const activeSource = sitemapSourceRef.current;

    if (prevSiteIdRef.current !== undefined && prevSiteIdRef.current !== site.id) {
      initialLoadKeyRef.current = null;
      loadGenerationRef.current += 1;
      inFlightBySourceRef.current.clear();
      uiLoadCountByGenerationRef.current.clear();
      setOverviewSitemapLoadBusy(false);
    }
    prevSiteIdRef.current = site.id;

    const prevSource = prevSitemapSourceRef.current;
    const sourceChanged = prevSource !== null && prevSource !== activeSource;
    prevSitemapSourceRef.current = activeSource;

    const loadKey = `${site.id}:${activeSource}:${site.entitySitemapUrl ?? ""}`;
    const isNewLoadKey = initialLoadKeyRef.current !== loadKey;
    if (!isNewLoadKey && !sourceChanged) {
      return;
    }
    initialLoadKeyRef.current = loadKey;

    const shouldCancelInFlight = prevSource !== null && (sourceChanged || isNewLoadKey);
    if (shouldCancelInFlight) {
      loadGenerationRef.current += 1;
      inFlightBySourceRef.current.clear();
      uiLoadCountByGenerationRef.current.clear();
      setOverviewSitemapLoadBusy(false);
    }

    if (sourceChanged) {
      const cachedRows = getOverviewRowsSessionCache(site.id, activeSource);
      if (cachedRows?.length) {
        setRows(cachedRows);
      }
    }

    const generation = loadGenerationRef.current;

    void loadOverviewSourceRef.current(site, activeSource, {
      force: false,
      silent: false,
      applyToUi: true,
      generation,
    });
  }, [
    site?.id,
    site?.username,
    site?.appPassword,
    site?.entitySitemapUrl,
    sitemapSource,
    setRows,
    disableAutoSitemapLoad,
  ]);

  return { handleLoadSitemap, overviewSitemapLoadBusy };
}
