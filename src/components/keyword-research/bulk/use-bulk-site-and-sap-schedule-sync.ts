import { useEffect, useState } from "react";

import { resolveActiveIntegrationSite } from "@/lib/integrations/resolve-active-integration-site";
import { getStoredSites } from "@/components/integrations/storage";
import type { ConnectedSiteSummary, WordPressSite } from "@/components/integrations/types";
import type { WordPressPostDestination } from "@/lib/bulk-auto-generate";
import { getFirstOfThisMonthDate, type ScheduleFrequency } from "@/lib/wordpress-scheduler";
import { loadSapBulkSchedulePrefs, saveSapBulkSchedulePrefs } from "@/lib/bulk-schedule-prefs";
import { normalizeBulkPostDestination } from "@/lib/bulk-post-destination-normalize";
import { defaultBulkSitemapMode } from "@/lib/bulk/bulk-sitemap-mode";

export interface UseBulkSiteAndSapScheduleSyncArgs {
  sapMode: boolean;
  forcedInputMode?: "csv" | "prompt" | "blog-import";
  activeWordPressSiteId: string | null;
  initialBulkPostDestination?: WordPressPostDestination;
}

export function useBulkSiteAndSapScheduleSync(args: UseBulkSiteAndSapScheduleSyncArgs) {
  const {
    sapMode,
    forcedInputMode,
    activeWordPressSiteId,
    initialBulkPostDestination,
  } = args;
  const [featuredImagePerBlog, setFeaturedImagePerBlog] = useState<boolean>(true);
  const [featuredImageType, setFeaturedImageType] = useState<'ai-generated' | 'google-maps'>('ai-generated');

  // Connected WordPress site (for target topic) - initialize synchronously for zero-CLS first paint
  const [wordPressSite, setWordPressSite] = useState<WordPressSite | null>(() =>
    resolveActiveIntegrationSite(getStoredSites(), activeWordPressSiteId),
  );
  const [connectedSite, setConnectedSite] = useState<ConnectedSiteSummary | null>(() => {
    const resolved = resolveActiveIntegrationSite(getStoredSites(), activeWordPressSiteId);
    return resolved
      ? {
          name: resolved.name,
          siteUrl: resolved.siteUrl,
          productionSiteUrl: resolved.productionSiteUrl,
        }
      : null;
  });

  // WordPress posting options - Multiple sites support
  const [selectedWordPressSites, setSelectedWordPressSites] = useState<Set<string>>(() =>
    wordPressSite ? new Set([wordPressSite.id]) : new Set(),
  );
  const [siteConfigs, setSiteConfigs] = useState<
    Record<string, import("@/components/keyword-research/bulk/BulkGeneratorSitemapMenu").BulkSiteSitemapConfig>
  >({});
  const [scheduleFrequency, setScheduleFrequency] = useState<ScheduleFrequency>('daily');
  const [customInterval, setCustomInterval] = useState<number>(0);
  /** Permutation: processing slot i uses base row at index rowOrder[i]. */
  const [rowOrder, setRowOrder] = useState<number[]>([]);
  const [dayOfWeek, setDayOfWeek] = useState<number>(0);
  const [startDateOption, setStartDateOption] = useState<'immediate' | 'custom'>('immediate');
  const [customStartDate, setCustomStartDate] = useState<Date>(() => getFirstOfThisMonthDate('09:00'));
  const [startTime, setStartTime] = useState<string>('09:00');
  const [useCsvPublishDates, setUseCsvPublishDates] = useState(false);
  const [wordpressDraftOnly, setWordpressDraftOnly] = useState(false);
  const [bulkPostDestination, setBulkPostDestination] = useState<WordPressPostDestination>(() => {
    if (initialBulkPostDestination) return normalizeBulkPostDestination(initialBulkPostDestination);
    return 'wordpress';
  });

  useEffect(() => {
    if (sapMode) setFeaturedImageType("google-maps");
  }, [sapMode]);

  // Track the active site matching the header picker (activeWordPressSiteId),
  // falling back to enabled site with successful connection status.
  useEffect(() => {
    const updateToActiveSite = () => {
      const sites = getStoredSites();
      const resolved = resolveActiveIntegrationSite(sites, activeWordPressSiteId);
      
      if (resolved) {
        const newConnectedSite: ConnectedSiteSummary = {
          name: resolved.name,
          siteUrl: resolved.siteUrl,
          productionSiteUrl: resolved.productionSiteUrl,
        };
        
        setConnectedSite(prev => {
          if (
            !prev ||
            prev.name !== newConnectedSite.name ||
            prev.siteUrl !== newConnectedSite.siteUrl ||
            prev.productionSiteUrl !== newConnectedSite.productionSiteUrl
          ) {
            return newConnectedSite;
          }
          return prev;
        });
        setWordPressSite(prev => {
          if (
            prev &&
            prev.id === resolved.id &&
            prev.siteUrl === resolved.siteUrl &&
            prev.name === resolved.name &&
            prev.entitySitemapUrl === resolved.entitySitemapUrl
          ) {
            return prev;
          }
          return resolved;
        });
      } else {
        setConnectedSite(null);
        setWordPressSite(null);
      }
    };

    updateToActiveSite();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'wordpress_sites') {
        updateToActiveSite();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [activeWordPressSiteId]);

  /** SAP generator: restore schedule from localStorage or apply defaults (custom times/month, start 1st of this month, 09:00). */
  useEffect(() => {
    if (!sapMode) return;
    const stored = loadSapBulkSchedulePrefs();
    if (stored) {
      setScheduleFrequency(stored.scheduleFrequency);
      setCustomInterval(stored.customInterval);
      setDayOfWeek(stored.dayOfWeek);
      setStartDateOption(stored.startDateOption);
      setCustomStartDate(new Date(stored.customStartDateIso));
      setStartTime(stored.startTime);
      setUseCsvPublishDates(false);
      if (stored.postDestination != null) {
        setBulkPostDestination(normalizeBulkPostDestination(stored.postDestination));
      }
    } else {
      setScheduleFrequency('custom');
      setCustomInterval(4);
      setStartDateOption('custom');
      setCustomStartDate(getFirstOfThisMonthDate('09:00'));
      setStartTime('09:00');
    }
  }, [sapMode]);

  /** SAP: default site + sitemap from prefs or entity when available. */
  useEffect(() => {
    if (!sapMode || !wordPressSite) return;
    const stored = loadSapBulkSchedulePrefs();
    const desiredType = stored ? stored.sitemapType : wordPressSite.entitySitemapUrl ? "entity" : "post";
    setSelectedWordPressSites((prev) =>
      prev.size === 1 && prev.has(wordPressSite.id) ? prev : new Set([wordPressSite.id]),
    );
    setSiteConfigs((prev) => {
      const cur = prev[wordPressSite.id];
      if (cur?.sitemapType === desiredType) return prev;
      return {
        ...prev,
        [wordPressSite.id]: { ...cur, sitemapType: desiredType },
      };
    });
  }, [sapMode, wordPressSite]);

  /** Blog generator workspace: auto-select connected site for posting.
   * WordPressPostingConfig may not mount until the details panel opens. */
  useEffect(() => {
    if (sapMode || !wordPressSite) return;
    setSelectedWordPressSites((prev) => {
      if (prev.size === 1 && prev.has(wordPressSite.id)) return prev;
      return new Set([wordPressSite.id]);
    });
    setSiteConfigs((prev) => {
      if (prev[wordPressSite.id]) return prev;
      return {
        ...prev,
        [wordPressSite.id]: {
          sitemapType: defaultBulkSitemapMode(),
          ...(forcedInputMode === "prompt" ? { scopeTags: ["posts"] as const } : {}),
        },
      };
    });
  }, [sapMode, wordPressSite, forcedInputMode]);

  /** Persist SAP bulk schedule + WP choices. */
  useEffect(() => {
    if (!sapMode) return;
    const selectedId = Array.from(selectedWordPressSites)[0] ?? null;
    const t = window.setTimeout(() => {
      saveSapBulkSchedulePrefs({
        v: 1,
        scheduleFrequency,
        customInterval,
        dayOfWeek,
        startDateOption,
        customStartDateIso: customStartDate.toISOString(),
        startTime,
        selectedSiteId: selectedId,
        sitemapType: selectedId ? (siteConfigs[selectedId]?.sitemapType ?? 'post') : 'post',
        useCsvPublishDates,
        postDestination: bulkPostDestination,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [
    sapMode,
    scheduleFrequency,
    customInterval,
    dayOfWeek,
    startDateOption,
    customStartDate,
    startTime,
    selectedWordPressSites,
    siteConfigs,
    useCsvPublishDates,
    bulkPostDestination,
  ]);

  return {
    wordPressSite, setWordPressSite, connectedSite, setConnectedSite,
    selectedWordPressSites, setSelectedWordPressSites, siteConfigs,
    setSiteConfigs, scheduleFrequency, setScheduleFrequency, customInterval,
    setCustomInterval, rowOrder, setRowOrder, dayOfWeek, setDayOfWeek,
    startDateOption, setStartDateOption, customStartDate, setCustomStartDate,
    startTime, setStartTime, useCsvPublishDates, setUseCsvPublishDates,
    wordpressDraftOnly, setWordpressDraftOnly, bulkPostDestination,
    setBulkPostDestination, featuredImagePerBlog, setFeaturedImagePerBlog,
    featuredImageType, setFeaturedImageType,
  };
}
