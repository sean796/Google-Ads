import { useCallback, type Dispatch, type SetStateAction } from "react";
import { notify } from "@/lib/app-notifications";
import { notifyConnectionFailedX, notifyConnectionSuccessfulX, notifyDetectedXEndpointSX, notifyEntitySitemapAutoDetectedX, notifySitemapDetectedX } from "@/lib/notify-messages";
import { clearSiteMirrorIndexCache } from "@/lib/wordpress-api/fields-client";
import {
  testWordPressConnection,
  detectSitemaps,
  parseSitemap,
  getScheduledPosts,
} from "@/lib/wordpress-api";
import { saveSites } from "@/components/integrations/storage";
import { type WordPressSite } from "@/components/integrations/types";
import { extractNAPAndSaveToSiteSilent } from "@/lib/knowledge-graph-auto-trigger";
import { detectCompetitorEntitySitemap, detectEntitySitemap } from "@/lib/entity-sitemap-detector";
import { mergeAutoChildTagsOnDetect } from "@/lib/sitemap-child-tags";
import { warmEntitySiteCache } from "@/lib/local-analysis/entity-site-warm-cache";

export function useWordPressConnectionAndSitemaps({ setSites, setIsTesting, setIsDetecting, setIsFetchingScheduled }: {
  setSites: Dispatch<SetStateAction<WordPressSite[]>>;
  setIsTesting: Dispatch<SetStateAction<string | null>>;
  setIsDetecting: Dispatch<SetStateAction<string | null>>;
  setIsFetchingScheduled: Dispatch<SetStateAction<string | null>>;
}) {
  const handleTestConnection = useCallback(async (site: WordPressSite): Promise<boolean> => {
    setIsTesting(site.id);
    setSites(prev => {
      const updated = prev.map(s =>
        s.id === site.id ? { ...s, connectionStatus: 'testing' as const } : s
      );
      saveSites(updated);
      return updated;
    });

    try {
      const result = await testWordPressConnection(
        site.siteUrl,
        site.username,
        site.appPassword
      );

      setSites(prev => {
        const finalUpdated = prev.map(s =>
          s.id === site.id
            ? {
                ...s,
                connectionStatus: result.success ? ('success' as const) : ('failed' as const),
                lastTested: Date.now(),
                capabilities: result.success && result.capabilities ? result.capabilities : s.capabilities,
              }
            : s
        );
        saveSites(finalUpdated);
        return finalUpdated;
      });

      if (result.success) {
        clearSiteMirrorIndexCache(site.id);
        notify.success(notifyConnectionSuccessfulX(result.siteInfo?.name || site.name));
        void extractNAPAndSaveToSiteSilent(site);
        warmEntitySiteCache(site);
      } else {
        notify.error(notifyConnectionFailedX(result.message));
      }
      return result.success;
    } catch (error) {
      setSites(prev => {
        const finalUpdated = prev.map(s =>
          s.id === site.id ? { ...s, connectionStatus: 'failed' as const, lastTested: Date.now() } : s
        );
        saveSites(finalUpdated);
        return finalUpdated;
      });
      notify.error(error instanceof Error ? error.message : "Connection test failed");
      return false;
    } finally {
      setIsTesting(null);
    }
  }, [setIsTesting, setSites]);

  const handleDetectSitemaps = useCallback(async (site: WordPressSite) => {
    setIsDetecting(site.id);

    try {
      const result = await detectSitemaps(
        site.siteUrl,
        site.username,
        site.appPassword
      );

      if (result.found && result.sitemapUrl) {
        // Parse the sitemap
        try {
          const parseResult = await parseSitemap(
            site.siteUrl,
            result.sitemapUrl,
            site.username,
            site.appPassword
          );

          // NEVER save wp-sitemap.xml - convert to sitemap_index.xml if detected
          let sitemapUrl = result.sitemapUrl!;
          if (sitemapUrl.includes('/wp-sitemap.xml')) {
            console.warn('[WordPress] Rejecting wp-sitemap.xml, converting to sitemap_index.xml');
            sitemapUrl = sitemapUrl.replace('/wp-sitemap.xml', '/sitemap_index.xml');
          }

          // Extract endpoints from child sitemap URLs
          const sitemapEndpoints: Record<string, string> = {};
          if (parseResult.childSitemaps && parseResult.childSitemaps.length > 0) {
            for (const childSitemapUrl of parseResult.childSitemaps) {
              try {
                // Extract endpoint from sitemap URL (e.g., "service-areas-sitemap.xml" -> "service-areas")
                const sitemapFilename = childSitemapUrl.split('/').pop() || '';
                const endpoint = sitemapFilename.replace(/[-_]sitemap\.xml$/i, '');
                if (endpoint && endpoint.length > 0) {
                  sitemapEndpoints[childSitemapUrl] = endpoint;
                  console.log(`[WordPress] Detected endpoint for ${childSitemapUrl}: ${endpoint}`);
                }
              } catch (error) {
                console.warn(`[WordPress] Failed to extract endpoint from ${childSitemapUrl}:`, error);
              }
            }
          }

          let mergedSitemapData: NonNullable<WordPressSite["sitemaps"]>;
          setSites((prevSites) => {
            const prevSite = prevSites.find((x) => x.id === site.id);
            const prevDisabled = prevSite?.sitemaps?.disabledChildSitemapUrls ?? [];
            const nextChildren = parseResult.childSitemaps ?? [];
            const keptDisabled = prevDisabled.filter((u) => nextChildren.includes(u));
            const baseMerged: NonNullable<WordPressSite["sitemaps"]> = {
              mainSitemapUrl: sitemapUrl,
              detectedAt: Date.now(),
              type: result.type || parseResult.type,
              childSitemaps: parseResult.childSitemaps,
              urls: parseResult.urls,
              endpoints: sitemapEndpoints,
              ...(prevSite?.sitemaps?.childTagsByUrl
                ? { childTagsByUrl: prevSite.sitemaps.childTagsByUrl }
                : {}),
              ...(keptDisabled.length > 0
                ? { disabledChildSitemapUrls: keptDisabled }
                : {}),
            };
            mergedSitemapData = mergeAutoChildTagsOnDetect(
              { ...site, sitemaps: baseMerged },
              baseMerged,
            );
            const updated = prevSites.map((s) =>
              s.id === site.id ? { ...s, sitemaps: mergedSitemapData } : s,
            );
            saveSites(updated);
            return updated;
          });
          notify.success(notifySitemapDetectedX(result.sitemapUrl));
          
          // Show endpoint detection summary
          const endpointCount = Object.keys(sitemapEndpoints).length;
          if (endpointCount > 0) {
            const endpointsList = Object.values(sitemapEndpoints).join(', ');
            console.log(`[WordPress] Detected ${endpointCount} endpoints: ${endpointsList}`);
            notify.info(notifyDetectedXEndpointSX(endpointCount, endpointsList));
          }
          
          // Auto-detect entity sitemap after sitemap detection
          const updatedSite: WordPressSite = { ...site, sitemaps: mergedSitemapData };
          let detectedEntitySitemapUrl: string | undefined;
          let detectedCompetitorEntitySitemapUrl: string | undefined;
          try {
            console.log('[WordPress] Auto-detecting entity sitemap...');
            const detectedEntitySitemap = await detectEntitySitemap(updatedSite);
            if (detectedEntitySitemap) {
              detectedEntitySitemapUrl = detectedEntitySitemap;
              setSites(prevSites => {
                const sitesWithEntity = prevSites.map(s => {
                  if (s.id !== site.id || !s.sitemaps) return s;
                  const mergedTags = mergeAutoChildTagsOnDetect(s, s.sitemaps, {
                    detectedEntityUrl: detectedEntitySitemap,
                  });
                  return {
                    ...s,
                    entitySitemapUrl: detectedEntitySitemap,
                    sitemaps: mergedTags,
                  };
                });
                saveSites(sitesWithEntity);
                return sitesWithEntity;
              });
              console.log(`[WordPress] Auto-detected entity sitemap: ${detectedEntitySitemap}`);
              notify.success(notifyEntitySitemapAutoDetectedX(detectedEntitySitemap.split('/').pop()));
            }
          } catch (error) {
            console.warn('[WordPress] Error auto-detecting entity sitemap:', error);
            // Don't fail the whole process if entity detection fails
          }

          try {
            const detectedCompetitor = await detectCompetitorEntitySitemap({
              ...site,
              sitemaps: mergedSitemapData,
              entitySitemapUrl: detectedEntitySitemapUrl ?? site.entitySitemapUrl,
            });
            if (detectedCompetitor) {
              detectedCompetitorEntitySitemapUrl = detectedCompetitor;
              setSites((prevSites) => {
                const next = prevSites.map((s) => {
                  if (s.id !== site.id || !s.sitemaps) {
                    return s.id === site.id
                      ? { ...s, competitorEntitySitemapUrl: detectedCompetitor }
                      : s;
                  }
                  const mergedTags = mergeAutoChildTagsOnDetect(s, s.sitemaps, {
                    detectedCompetitorUrl: detectedCompetitor,
                  });
                  return {
                    ...s,
                    competitorEntitySitemapUrl: detectedCompetitor,
                    sitemaps: mergedTags,
                  };
                });
                saveSites(next);
                return next;
              });
              console.log(`[WordPress] Auto-detected competitor sitemap: ${detectedCompetitor}`);
            }
          } catch (error) {
            console.warn('[WordPress] Error auto-detecting competitor sitemap:', error);
          }

          const siteForSilentNap: WordPressSite = {
            ...site,
            sitemaps: mergedSitemapData,
            entitySitemapUrl: detectedEntitySitemapUrl ?? site.entitySitemapUrl,
            competitorEntitySitemapUrl:
              detectedCompetitorEntitySitemapUrl ?? site.competitorEntitySitemapUrl,
          };
          console.log('[NAP] Running silent NAP after sitemap detection', {
            siteId: site.id,
            hasMainSitemap: Boolean(siteForSilentNap.sitemaps?.mainSitemapUrl),
            entitySitemapUrl: siteForSilentNap.entitySitemapUrl,
          });
          void extractNAPAndSaveToSiteSilent(siteForSilentNap);
          
          // Auto-fetch scheduled posts after sitemap detection
          setIsFetchingScheduled(site.id);
          try {
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();

            const scheduledResult = await getScheduledPosts(
              site.siteUrl,
              site.username,
              site.appPassword,
              currentMonth,
              currentYear
            );

            console.log('[WordPress] Scheduled posts result:', scheduledResult);

            if (!scheduledResult.error) {
              // Use functional update to ensure we have the latest state
              setSites(prevSites => {
                const updatedWithScheduled = prevSites.map(s => {
                  if (s.id === site.id) {
                    return {
                      ...s,
                      scheduledPosts: {
                        count: scheduledResult.count || 0,
                        month: currentMonth,
                        year: currentYear,
                        fetchedAt: Date.now(),
                      },
                    };
                  }
                  return s;
                });
                saveSites(updatedWithScheduled);
                return updatedWithScheduled;
              });
              
              if (scheduledResult.debug) {
                console.log('[WordPress] Debug info:', scheduledResult.debug);
                if (scheduledResult.debug.totalScheduledPosts > 0 && scheduledResult.count === 0) {
                  console.warn(`[WordPress] Found ${scheduledResult.debug.totalScheduledPosts} scheduled posts total, but 0 for current month ${currentMonth + 1}/${currentYear}`);
                }
              }
            } else {
              // Still update with 0 count if there's an error, so user knows we tried
              setSites(prevSites => {
                const updatedWithScheduled = prevSites.map(s => {
                  if (s.id === site.id) {
                    return {
                      ...s,
                      scheduledPosts: {
                        count: 0,
                        month: currentMonth,
                        year: currentYear,
                        fetchedAt: Date.now(),
                      },
                    };
                  }
                  return s;
                });
                saveSites(updatedWithScheduled);
                return updatedWithScheduled;
              });
            }
          } catch (scheduledError) {
            // Update with 0 count on error so UI shows we attempted to fetch
            console.error('[WordPress] Error fetching scheduled posts:', scheduledError);
            setSites(prevSites => {
              const now = new Date();
              const updatedWithScheduled = prevSites.map(s => {
                if (s.id === site.id) {
                  return {
                    ...s,
                    scheduledPosts: {
                      count: 0,
                      month: now.getMonth(),
                      year: now.getFullYear(),
                      fetchedAt: Date.now(),
                    },
                  };
                }
                return s;
              });
              saveSites(updatedWithScheduled);
              return updatedWithScheduled;
            });
          } finally {
            setIsFetchingScheduled(null);
          }
        } catch (parseError) {
          notify.error(parseError instanceof Error ? parseError.message : "Failed to parse sitemap");
        }
      } else {
        notify.error(result.message || "No sitemap found");
      }
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to detect sitemaps");
    } finally {
      setIsDetecting(null);
    }
  }, [setIsDetecting, setIsFetchingScheduled, setSites]);

  const runAutoSetupForNewSite = useCallback(async (site: WordPressSite) => {
    const success = await handleTestConnection(site);
    if (success) {
      await handleDetectSitemaps(site);
    }
  }, [handleTestConnection, handleDetectSitemaps]);

  return {
    handleTestConnection,
    handleDetectSitemaps,
    runAutoSetupForNewSite,
  };
}
