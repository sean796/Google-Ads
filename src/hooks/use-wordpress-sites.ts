import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getStoredSites,
  hydrateRuntimeApiKeysFromCloud,
  restoreOriginalPropertyNamesOnce,
  restoreSitesFromServerMirrorIfEmpty,
} from "@/components/integrations/storage";
import { type WordPressSite } from "@/components/integrations/types";
import { wordpressSiteMenuDisplayName } from "@/lib/wordpress-site-display-name";
import { useWordPressSiteCrud } from "./wordpress-sites/use-wordpress-site-crud";
import { useWordPressConnectionAndSitemaps } from "./wordpress-sites/use-wordpress-connection-and-sitemaps";
import { useWordPressSitemapOperations } from "./wordpress-sites/use-wordpress-sitemap-operations";
import { useWordPressScheduledCalendar } from "./wordpress-sites/use-wordpress-scheduled-calendar";

/** Default list order: site name A-Z (case-insensitive), then URL, then id. */
function compareWordPressSitesByDisplayName(a: WordPressSite, b: WordPressSite): number {
  const nameCmp = wordpressSiteMenuDisplayName(a).localeCompare(wordpressSiteMenuDisplayName(b), undefined, {
    sensitivity: "base",
  });
  if (nameCmp !== 0) return nameCmp;
  const urlCmp = (a.siteUrl ?? "").trim().localeCompare((b.siteUrl ?? "").trim(), undefined, {
    sensitivity: "base",
  });
  if (urlCmp !== 0) return urlCmp;
  return a.id.localeCompare(b.id);
}

function sortWordPressSitesByDisplayName(list: WordPressSite[]): WordPressSite[] {
  return [...list].sort(compareWordPressSitesByDisplayName);
}

function useWordPressSitesState() {
  const [sites, setSites] = useState<WordPressSite[]>(() => getStoredSites());
  const [isTesting, setIsTesting] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState<string | null>(null);
  const [isFetchingScheduled, setIsFetchingScheduled] = useState<string | null>(null);
  const [isScrapingSitemap, setIsScrapingSitemap] = useState<Record<string, boolean>>({});
  const [isIndexingSitemap, setIsIndexingSitemap] = useState<Record<string, boolean>>({});
  const [isCheckingFuture, setIsCheckingFuture] = useState<Record<string, boolean>>({});
  const [isLoadingCalendar, setIsLoadingCalendar] = useState<Record<string, boolean>>({});

  const sitesSortedByName = useMemo(
    () => sortWordPressSitesByDisplayName(sites),
    [sites],
  );

  useEffect(() => {
    void restoreOriginalPropertyNamesOnce().then((restored) => {
      if (restored) setSites(getStoredSites());
    });
    void restoreSitesFromServerMirrorIfEmpty().then((restored) => {
      if (restored.length > 0) setSites(restored);
    });
    void hydrateRuntimeApiKeysFromCloud();
  }, []);

  const reloadSitesFromStorage = useCallback(() => {
    setSites(getStoredSites());
  }, []);

  const { handleTestConnection, handleDetectSitemaps, runAutoSetupForNewSite } =
    useWordPressConnectionAndSitemaps({ setSites, setIsTesting, setIsDetecting, setIsFetchingScheduled });

  const {
    handleAddSite, handleEditSite, handleDeleteSite, handleDeleteSitesBulk, handleToggleEnabled,
    handleConnectSite, handleSaveSite, handleSaveSitesBulk, handlePatchSite,
  } = useWordPressSiteCrud({ sites, setSites, runAutoSetupForNewSite });

  const {
    getScrapingKey, handleScrapeChildSitemap, handleIndexSitemap, handleSetEntitySitemap,
    handleSetCompetitorEntitySitemap, handleAddCustomSitemapTagLabel, handleToggleChildSystemRole,
    handleToggleChildCustomTag, handleToggleChildSitemapDisabled, handleAppendManualChildSitemap,
  } = useWordPressSitemapOperations({ sites, setSites, setIsScrapingSitemap, setIsIndexingSitemap });

  const { handleFetchScheduledPosts, handleLoadCalendarPosts, handleCheckFuturePosts } =
    useWordPressScheduledCalendar({ sites, setSites, setIsFetchingScheduled, setIsLoadingCalendar, setIsCheckingFuture });

  return {
    sites: sitesSortedByName,
    setSites,
    isTesting,
    isDetecting,
    isFetchingScheduled,
    isScrapingSitemap,
    isIndexingSitemap,
    isCheckingFuture,
    isLoadingCalendar,
    handleAddSite,
    handleEditSite,
    handleDeleteSite,
    handleDeleteSitesBulk,
    handleToggleEnabled,
    handleConnectSite,
    handleSaveSite,
    handleSaveSitesBulk,
    handleTestConnection,
    handleDetectSitemaps,
    handleFetchScheduledPosts,
    handleScrapeChildSitemap,
    handleIndexSitemap,
    handleCheckFuturePosts,
    handleLoadCalendarPosts,
    handleSetEntitySitemap,
    handleSetCompetitorEntitySitemap,
    handleAddCustomSitemapTagLabel,
    handleToggleChildSystemRole,
    handleToggleChildCustomTag,
    handleToggleChildSitemapDisabled,
    handlePatchSite,
    reloadSitesFromStorage,
    handleAppendManualChildSitemap,
    getScrapingKey,
  };
}

const WordPressSitesContext = createContext<ReturnType<typeof useWordPressSitesState> | null>(null);

export function WordPressSitesProvider({ children }: { children: ReactNode }) {
  const value = useWordPressSitesState();
  return createElement(WordPressSitesContext.Provider, { value }, children);
}

export function useWordPressSites(): ReturnType<typeof useWordPressSitesState> {
  const ctx = useContext(WordPressSitesContext);
  if (!ctx) {
    throw new Error("useWordPressSites must be used within WordPressSitesProvider");
  }
  return ctx;
}
