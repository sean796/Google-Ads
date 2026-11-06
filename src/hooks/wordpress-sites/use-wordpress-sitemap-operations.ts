import { useCallback, type Dispatch, type SetStateAction } from "react";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { NOTIFY_ALREADY_IN_LIST, NOTIFY_CLEAR_ENTITY_SITEMAP_IN_THE_SITEMAP_MENU, NOTIFY_ENTITY_SITEMAP_CLEARED, NOTIFY_INDEXING_SITEMAP, NOTIFY_PLEASE_DETECT_SITEMAPS_FIRST_BEFORE_SCRA, NOTIFY_SITEMAP_ADDED, NOTIFY_SITEMAP_EXCLUDED_FOR_THIS_PROPERTY, NOTIFY_SITEMAP_INCLUDED_FOR_THIS_PROPERTY, notifyEntitySitemapSetToX, notifyIndexingDoneXIndexedXErr } from "@/lib/notify-messages";
import { getStoredSites, saveSites } from "@/components/integrations/storage";
import { type WordPressSite } from "@/components/integrations/types";
import { indexSitemapUrls, type IndexingProgress } from "@/lib/wordpress-api";
import { scrapeChildSitemap } from "@/lib/wordpress-sitemap-scraper";
import {
  addCustomSitemapTagLabel,
  toggleChildCustomTag,
  toggleChildSystemRole,
} from "@/lib/sitemap-child-tags";

export function useWordPressSitemapOperations({ sites, setSites, setIsScrapingSitemap, setIsIndexingSitemap }: {
  sites: WordPressSite[];
  setSites: Dispatch<SetStateAction<WordPressSite[]>>;
  setIsScrapingSitemap: Dispatch<SetStateAction<Record<string, boolean>>>;
  setIsIndexingSitemap: Dispatch<SetStateAction<Record<string, boolean>>>;
}) {
  const getScrapingKey = (siteId: string, sitemapUrl: string): string => {
    return `${siteId}:${sitemapUrl}`;
  };

  const handleScrapeChildSitemap = useCallback(async (site: WordPressSite, childSitemapUrl: string) => {
    if (!site.sitemaps) {
      notify.error(NOTIFY_PLEASE_DETECT_SITEMAPS_FIRST_BEFORE_SCRA);
      return;
    }

    const scrapingKey = getScrapingKey(site.id, childSitemapUrl);
    setIsScrapingSitemap(prev => ({
      ...prev,
      [scrapingKey]: true
    }));

    try {
      await scrapeChildSitemap(site, childSitemapUrl, (message) => {
        notify.info(message);
      });
      setSites(getStoredSites());
    } catch (error) {
      console.error('Error scraping child sitemap:', error);
      notify.error(error instanceof Error ? error.message : `Failed to scrape sitemap: ${childSitemapUrl}`);
    } finally {
      setIsScrapingSitemap(prev => {
        const updated = { ...prev };
        delete updated[scrapingKey];
        return updated;
      });
    }
  }, [setIsScrapingSitemap, setSites]);

  const handleIndexSitemap = useCallback(async (site: WordPressSite, sitemapUrl: string) => {
    const indexingKey = `${site.id}-${sitemapUrl}`;
    
    setIsIndexingSitemap(prev => ({
      ...prev,
      [indexingKey]: true
    }));

    // Show initial progress toast
    const progressToastId = notify.loading(NOTIFY_INDEXING_SITEMAP);

    try {
      const result = await indexSitemapUrls(
        site.siteUrl,
        sitemapUrl,
        site.username,
        site.appPassword,
        (progress: IndexingProgress) => {
          // Update progress toast
          notify.loading(
            `Indexing ${progress.processed}/${progress.total} (${progress.indexed} ok, ${progress.errors} err)`,
            { id: progressToastId },
          );
        }
      );

      if (result.success) {
        // Dismiss progress toast and show success
        notify.dismiss(progressToastId);
        notify.success(notifyIndexingDoneXIndexedXErr(result.indexed, result.errors), {
          duration: 8000,
        });
      } else {
        notify.dismiss(progressToastId);
        notify.error(
          `Indexing failed: ${result.error || 'Unknown error'}`,
          { duration: 6000 }
        );
      }
    } catch (error) {
      console.error('Error indexing sitemap:', error);
      notify.dismiss(progressToastId);
      
      const errorMessage = error instanceof Error ? error.message : `Failed to index sitemap: ${sitemapUrl}`;
      
      // Check for specific error types
      if (errorMessage.includes('sitemap index')) {
        notify.error(
          'This sitemap is an index (contains other sitemaps). Please process individual child sitemaps instead.',
          { duration: 6000 }
        );
      } else if (errorMessage.includes('No URLs found')) {
        notify.error(
          'No URLs found in this sitemap. Please check the sitemap URL.',
          { duration: 6000 }
        );
      } else {
        notifyHeaderError("WordPress site error", errorMessage, { duration: 6000 });
      }
    } finally {
      setIsIndexingSitemap(prev => {
        const updated = { ...prev };
        delete updated[indexingKey];
        return updated;
      });
    }
  }, [setIsIndexingSitemap]);

  const handleSetEntitySitemap = useCallback((site: WordPressSite, sitemapUrl: string) => {
    const trimmed = sitemapUrl.trim();
    const clearing =
      !trimmed || site.entitySitemapUrl?.trim() === trimmed;
    const updated = sites.map((s) => {
      if (s.id !== site.id) return s;
      if (clearing) {
        const url = site.entitySitemapUrl?.trim();
        if (url && s.sitemaps) {
          return toggleChildSystemRole(s, url, "entity");
        }
        return { ...s, entitySitemapUrl: undefined };
      }
      const next = toggleChildSystemRole(s, trimmed, "entity");
      return {
        ...next,
        ...(next.sitemaps
          ? { sitemaps: { ...next.sitemaps, detectedAt: Date.now() } }
          : {}),
      };
    });
    setSites(updated);
    saveSites(updated);
    if (clearing) {
      notify.info(NOTIFY_ENTITY_SITEMAP_CLEARED);
    } else {
      const tail = trimmed.split("/").pop() ?? trimmed;
      notify.success(notifyEntitySitemapSetToX(tail));
    }
  }, [sites, setSites]);

  const handleSetCompetitorEntitySitemap = useCallback((site: WordPressSite, sitemapUrl: string) => {
    const trimmed = sitemapUrl.trim();
    const clearing =
      !trimmed || site.competitorEntitySitemapUrl?.trim() === trimmed;
    const updated = sites.map((s) => {
      if (s.id !== site.id) return s;
      if (clearing) {
        const url = site.competitorEntitySitemapUrl?.trim();
        if (url && s.sitemaps) {
          return toggleChildSystemRole(s, url, "competitor");
        }
        return { ...s, competitorEntitySitemapUrl: undefined };
      }
      const next = toggleChildSystemRole(s, trimmed, "competitor");
      return {
        ...next,
        ...(next.sitemaps
          ? { sitemaps: { ...next.sitemaps, detectedAt: Date.now() } }
          : {}),
      };
    });
    setSites(updated);
    saveSites(updated);
    if (clearing) {
      notify.info('Competitor sitemap cleared for this property.');
    } else {
      const tail = trimmed.split('/').pop() ?? trimmed;
      notify.success(`Competitor sitemap set to ${tail}`);
    }
  }, [sites, setSites]);

  const handleAddCustomSitemapTagLabel = useCallback((site: WordPressSite, label: string) => {
    const updated = sites.map((s) =>
      s.id === site.id ? addCustomSitemapTagLabel(s, label) : s,
    );
    setSites(updated);
    saveSites(updated);
  }, [sites, setSites]);

  const handleToggleChildSystemRole = useCallback(
    (site: WordPressSite, childUrl: string, role: Parameters<typeof toggleChildSystemRole>[2]) => {
      const updated = sites.map((s) =>
        s.id === site.id ? toggleChildSystemRole(s, childUrl, role) : s,
      );
      setSites(updated);
      saveSites(updated);
    },
    [sites, setSites],
  );

  const handleToggleChildCustomTag = useCallback(
    (site: WordPressSite, childUrl: string, label: string) => {
      const updated = sites.map((s) =>
        s.id === site.id ? toggleChildCustomTag(s, childUrl, label) : s,
      );
      setSites(updated);
      saveSites(updated);
    },
    [sites, setSites],
  );

  const handleToggleChildSitemapDisabled = useCallback(
    (site: WordPressSite, childUrl: string) => {
      const prevSite = sites.find((s) => s.id === site.id);
      const children = prevSite?.sitemaps?.childSitemaps;
      if (!children?.includes(childUrl)) return;

      const entityUrl = prevSite?.entitySitemapUrl?.trim();
      if (entityUrl && entityUrl === childUrl.trim()) {
        notify.error(NOTIFY_CLEAR_ENTITY_SITEMAP_IN_THE_SITEMAP_MENU);
        return;
      }
      const competitorUrl = prevSite?.competitorEntitySitemapUrl?.trim();
      if (competitorUrl && competitorUrl === childUrl.trim()) {
        notify.error('Clear the competitor sitemap in the Sitemap menu before excluding this child sitemap.');
        return;
      }

      const current = prevSite.sitemaps?.disabledChildSitemapUrls ?? [];
      const wasDisabled = current.includes(childUrl);
      const nextDisabled = wasDisabled
        ? current.filter((u) => u !== childUrl)
        : [...current, childUrl];

      const updated = sites.map((s) => {
        if (s.id !== site.id || !s.sitemaps) return s;
        if (!s.sitemaps.childSitemaps?.includes(childUrl)) return s;
        const nextSitemaps = { ...s.sitemaps };
        if (nextDisabled.length > 0) {
          nextSitemaps.disabledChildSitemapUrls = nextDisabled;
        } else {
          delete nextSitemaps.disabledChildSitemapUrls;
        }
        return {
          ...s,
          sitemaps: nextSitemaps,
        };
      });
      setSites(updated);
      saveSites(updated);
      if (wasDisabled) {
        notify.success(NOTIFY_SITEMAP_INCLUDED_FOR_THIS_PROPERTY);
      } else {
        notify.info(NOTIFY_SITEMAP_EXCLUDED_FOR_THIS_PROPERTY);
      }
    },
    [sites, setSites],
  );

  const handleAppendManualChildSitemap = useCallback((site: WordPressSite, rawUrl: string) => {
    const url = rawUrl.trim();
    if (!url) return;

    setSites((prev) => {
      let outcome: "added" | "duplicate" | "noop" = "noop";
      const updated: typeof prev = [];
      for (const s of prev) {
        if (s.id !== site.id || !s.sitemaps) {
          updated.push(s);
          continue;
        }
        if (s.sitemaps.type === "index") {
          const existing = s.sitemaps.childSitemaps ?? [];
          if (existing.includes(url)) {
            outcome = "duplicate";
            updated.push(s);
            continue;
          }
          outcome = "added";
          updated.push({
            ...s,
            sitemaps: {
              ...s.sitemaps,
              childSitemaps: [...existing, url],
            },
          });
          continue;
        }
        if (s.sitemaps.type === "urlset") {
          const existing = s.sitemaps.urls ?? [];
          if (existing.includes(url)) {
            outcome = "duplicate";
            updated.push(s);
            continue;
          }
          outcome = "added";
          updated.push({
            ...s,
            sitemaps: {
              ...s.sitemaps,
              urls: [...existing, url],
            },
          });
          continue;
        }
        updated.push(s);
      }
      if (outcome === "added") {
        saveSites(updated);
        notify.success(NOTIFY_SITEMAP_ADDED);
      } else if (outcome === "duplicate") {
        notify.info(NOTIFY_ALREADY_IN_LIST);
      }
      return updated;
    });
  }, [setSites]);

  return {
    getScrapingKey,
    handleScrapeChildSitemap,
    handleIndexSitemap,
    handleSetEntitySitemap,
    handleSetCompetitorEntitySitemap,
    handleAddCustomSitemapTagLabel,
    handleToggleChildSystemRole,
    handleToggleChildCustomTag,
    handleToggleChildSitemapDisabled,
    handleAppendManualChildSitemap,
  };
}
