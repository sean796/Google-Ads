import { useCallback, type Dispatch, type SetStateAction } from "react";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_COULD_NOT_RESOLVE_ANY_URLS_TO_WORDPRESS_, NOTIFY_NO_POSTS_FOUND, NOTIFY_NO_URLS_FOUND_IN_SITEMAP, NOTIFY_PLEASE_DETECT_SITEMAPS_FIRST, notifyFailedToFetchScheduledPostsX, notifyFoundXFuturePostxInSitemap, notifyLoadedXPostsWithDatesXFuture, notifyLoadingXPostsFromSitemap } from "@/lib/notify-messages";
import { saveSites } from "@/components/integrations/storage";
import { type WordPressSite } from "@/components/integrations/types";
import {
  getScheduledPosts,
  parseSitemap,
  resolveWordPressUrls,
  getWordPressPostContent,
  checkFuturePosts,
} from "@/lib/wordpress-api";

export function useWordPressScheduledCalendar({ sites, setSites, setIsFetchingScheduled, setIsLoadingCalendar, setIsCheckingFuture }: {
  sites: WordPressSite[];
  setSites: Dispatch<SetStateAction<WordPressSite[]>>;
  setIsFetchingScheduled: Dispatch<SetStateAction<string | null>>;
  setIsLoadingCalendar: Dispatch<SetStateAction<Record<string, boolean>>>;
  setIsCheckingFuture: Dispatch<SetStateAction<Record<string, boolean>>>;
}) {
  const handleFetchScheduledPosts = useCallback(async (site: WordPressSite) => {
    setIsFetchingScheduled(site.id);

    try {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      const result = await getScheduledPosts(
        site.siteUrl,
        site.username,
        site.appPassword,
        currentMonth,
        currentYear
      );

      if (result.error) {
        notify.error(notifyFailedToFetchScheduledPostsX(result.error));
        return;
      }

      const updated = sites.map(s => {
        if (s.id === site.id) {
          return {
            ...s,
            scheduledPosts: {
              count: result.count,
              month: currentMonth,
              year: currentYear,
              fetchedAt: Date.now(),
            },
          };
        }
        return s;
      });

      setSites(updated);
      saveSites(updated);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to fetch scheduled posts");
    } finally {
      setIsFetchingScheduled(null);
    }
  }, [sites, setIsFetchingScheduled, setSites]);

  const handleLoadCalendarPosts = useCallback(async (site: WordPressSite, childSitemapUrl: string) => {
    if (!site.sitemaps) {
      notify.error(NOTIFY_PLEASE_DETECT_SITEMAPS_FIRST);
      return;
    }

    const loadingKey = `${site.id}-${childSitemapUrl}`;
    setIsLoadingCalendar(prev => ({
      ...prev,
      [loadingKey]: true
    }));

    try {
      // Parse sitemap to get URLs
      const parseResult = await parseSitemap(
        site.siteUrl,
        childSitemapUrl,
        site.username,
        site.appPassword
      );

      if (!parseResult.urls || parseResult.urls.length === 0) {
        notify.error(NOTIFY_NO_URLS_FOUND_IN_SITEMAP);
        return;
      }

      notify.info(notifyLoadingXPostsFromSitemap(parseResult.urls.length));

      // Resolve URLs to WordPress posts
      const resolveResult = await resolveWordPressUrls(
        site.siteUrl,
        site.username,
        site.appPassword,
        parseResult.urls
      );

      if (!resolveResult.resolved || resolveResult.resolved.length === 0) {
        notify.error(NOTIFY_COULD_NOT_RESOLVE_ANY_URLS_TO_WORDPRESS_);
        return;
      }

      // Fetch post content with dates
      const resolvedObjects = resolveResult.resolved.map(r => ({ id: r.id, subtype: r.subtype }));
      const postContentResult = await getWordPressPostContent(
        site.siteUrl,
        site.username,
        site.appPassword,
        undefined,
        undefined,
        resolvedObjects
      );

      if (postContentResult.posts && postContentResult.posts.length > 0) {
        const now = new Date();
        const postsMetadata = postContentResult.posts.map(post => {
          // Use status from API if available, otherwise determine from date
          let status = post.status || 'publish';
          if (!post.status && post.date_gmt) {
            try {
              const postDate = new Date(post.date_gmt);
              if (postDate > now) {
                status = 'future';
              }
            } catch (e) {
              // Keep default status if date parsing fails
            }
          }
          
          return {
            id: post.id,
            slug: post.slug,
            title: post.title,
            date_gmt: post.date_gmt || '',
            status: status,
            link: post.link,
          };
        });

        // Count future posts
        const futureCount = postsMetadata.filter(post => {
          if (post.status === 'future') return true;
          if (!post.date_gmt) return false;
          try {
            const postDate = new Date(post.date_gmt);
            return postDate > now;
          } catch {
            return false;
          }
        }).length;

        // Update site data with post metadata using functional update to ensure latest state
        setSites(prevSites => {
          const updated = prevSites.map(s => {
            if (s.id === site.id && s.sitemaps) {
              return {
                ...s,
                sitemaps: {
                  ...s.sitemaps,
                  postMetadata: {
                    ...(s.sitemaps.postMetadata || {}),
                    [childSitemapUrl]: {
                      posts: postsMetadata,
                      futureCount,
                      lastChecked: Date.now(),
                    },
                  },
                },
              };
            }
            return s;
          });
          saveSites(updated);
          return updated;
        });
        
        notify.success(notifyLoadedXPostsWithDatesXFuture(postsMetadata.length, futureCount));
      } else {
        notify.error(NOTIFY_NO_POSTS_FOUND);
      }
    } catch (error) {
      logger.error('Error loading calendar posts:', error);
      notify.error(error instanceof Error ? error.message : `Failed to load posts: ${childSitemapUrl}`);
    } finally {
      setIsLoadingCalendar(prev => {
        const updated = { ...prev };
        delete updated[loadingKey];
        return updated;
      });
    }
  }, [setIsLoadingCalendar, setSites]);

  const handleCheckFuturePosts = useCallback(async (site: WordPressSite, childSitemapUrl: string) => {
    if (!site.sitemaps) {
      notify.error(NOTIFY_PLEASE_DETECT_SITEMAPS_FIRST);
      return;
    }

    const checkingKey = `${site.id}-${childSitemapUrl}`;
    setIsCheckingFuture(prev => ({
      ...prev,
      [checkingKey]: true
    }));

    try {
      const result = await checkFuturePosts(
        site.siteUrl,
        site.username,
        site.appPassword,
        childSitemapUrl
      );

      if (result.success) {
        // Update site data with future posts metadata
        const updated = sites.map(s => {
          if (s.id === site.id && s.sitemaps) {
            const existingMetadata = s.sitemaps.postMetadata?.[childSitemapUrl];
            const updatedMetadata = {
              ...(existingMetadata || { posts: [], futureCount: 0, lastChecked: 0 }),
              futureCount: result.futureCount,
              lastChecked: Date.now(),
              // Update posts with future status if we have them
              posts: result.posts ? result.posts.map(p => ({
                ...p,
                status: p.status || (new Date(p.date_gmt) > new Date() ? 'future' : 'publish')
              })) : (existingMetadata?.posts || []),
            };

            return {
              ...s,
              sitemaps: {
                ...s.sitemaps,
                postMetadata: {
                  ...(s.sitemaps.postMetadata || {}),
                  [childSitemapUrl]: updatedMetadata,
                },
              },
            };
          }
          return s;
        });

        setSites(updated);
        saveSites(updated);
        notify.success(notifyFoundXFuturePostxInSitemap(result.futureCount, result.futureCount !== 1 ? 's' : ''));
      } else {
        notify.error(result.error || "Failed to check future posts");
      }
    } catch (error) {
      logger.error('Error checking future posts:', error);
      notify.error(error instanceof Error ? error.message : `Failed to check future posts: ${childSitemapUrl}`);
    } finally {
      setIsCheckingFuture(prev => {
        const updated = { ...prev };
        delete updated[checkingKey];
        return updated;
      });
    }
  }, [sites, setIsCheckingFuture, setSites]);

  return {
    handleFetchScheduledPosts,
    handleLoadCalendarPosts,
    handleCheckFuturePosts,
  };
}
