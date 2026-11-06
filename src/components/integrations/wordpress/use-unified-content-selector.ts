import { useState, useEffect, useCallback } from "react";
import { getPublishedPosts, getPublishedPages, parseSitemap } from "@/lib/wordpress-api";
import { type WordPressSite } from "../types";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_NO_ENTITIES_FOUND_IN_ENTITY_SITEMAP, NOTIFY_NO_ENTITY_SITEMAP_CONFIGURED_PLEASE_SET_, NOTIFY_WORDPRESS_CREDENTIALS_MISSING_PLEASE_UPD, notifyFailedToFetchEntitiesX, notifyFailedToFetchPagesX, notifyFailedToFetchPostsX } from "@/lib/notify-messages";

export function useUnifiedContentSelector({
  site,
  value,
  onValueChange,
  postType,
  open,
  multiSelect,
}: {
  site: WordPressSite;
  value: string | string[];
  onValueChange: (url: string | string[]) => void;
  postType: 'post' | 'service-area' | 'page' | 'both';
  open: boolean;
  multiSelect: boolean;
}) {
  const [posts, setPosts] = useState<Array<{ id: number; title: string; link: string; slug?: string; date_gmt?: string; endpoint?: string }>>([]);
  const [serviceAreas, setServiceAreas] = useState<Array<{ id: number; title: string; link: string; slug?: string; date_gmt?: string; endpoint?: string }>>([]);
  const [pages, setPages] = useState<Array<{ id: number; title: string; link: string; slug?: string; date_gmt?: string; endpoint?: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasNoPosts, setHasNoPosts] = useState(false);
  const [hasNoEntities, setHasNoEntities] = useState(false);
  const [hasNoPages, setHasNoPages] = useState(false);

  const selectedUrls = Array.isArray(value) ? value : (value ? [value] : []);
  const selectedUrl = Array.isArray(value) ? '' : value;

  const currentItems = postType === 'post' ? posts : postType === 'service-area' ? serviceAreas : postType === 'page' ? pages : [...posts, ...serviceAreas]; // 'both' only includes posts and entities, not pages
  const selectedItem = currentItems.find(item => item.link === selectedUrl);
  const selectedItems = currentItems.filter(item => selectedUrls.includes(item.link));

  const fetchPosts = useCallback(async () => {
    if (!site.username || !site.appPassword) {
      notify.error(NOTIFY_WORDPRESS_CREDENTIALS_MISSING_PLEASE_UPD);
      return;
    }
setIsLoading(true);
    setHasNoPosts(false); // Reset flag when attempting to fetch
    const result = await getPublishedPosts(site.siteUrl, site.username, site.appPassword, 100, 0);
if (result.error) {
      // Handle "no posts" case gracefully - don't show error toast
      if (result.error.includes('No published posts found')) {
        console.log('[UnifiedContentSelector] No published posts found - this is normal if the site has no posts yet');
        setPosts([]);
        setHasNoPosts(true); // Mark that we've determined there are no posts
} else {
        notify.error(notifyFailedToFetchPostsX(result.error));
        setPosts([]);
        setHasNoPosts(false); // Reset flag on other errors (might be temporary)
      }
    } else {
      setPosts(result.posts || []);
      setHasNoPosts(result.posts?.length === 0); // Set flag if no posts returned
}
    setIsLoading(false);
  }, [site.siteUrl, site.username, site.appPassword]);

  const fetchEntities = useCallback(async () => {
    if (!site.username || !site.appPassword) {
      notify.error(NOTIFY_WORDPRESS_CREDENTIALS_MISSING_PLEASE_UPD);
      return;
    }
    
    if (!site.entitySitemapUrl) {
      notify.error(NOTIFY_NO_ENTITY_SITEMAP_CONFIGURED_PLEASE_SET_);
      setServiceAreas([]);
      return;
    }

    setIsLoading(true);
    try {
      // Parse entity sitemap to get entity URLs
      const parseResult = await parseSitemap(
        site.siteUrl,
        site.entitySitemapUrl,
        site.username,
        site.appPassword
      );
      
      if (parseResult.urls && parseResult.urls.length > 0) {
        // Convert URLs to entity format
        const entitiesFromSitemap = parseResult.urls.map((url: string, index: number) => {
          try {
            const urlObj = new URL(url);
            const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
            const slug = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : '';
            
            // Extract title from slug (convert kebab-case to Title Case)
            const title = slug
              .split('-')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ') || url;
            
            return {
              id: index + 1, // Temporary ID
              slug: slug,
              title: title,
              link: url,
              date_gmt: new Date().toISOString(),
            };
          } catch {
            return {
              id: index + 1,
              slug: '',
              title: url,
              link: url,
              date_gmt: new Date().toISOString(),
            };
          }
        });
        
        setServiceAreas(entitiesFromSitemap);
        setHasNoEntities(false); // Reset flag when entities are found
      } else {
        setServiceAreas([]);
        setHasNoEntities(true); // Mark that we've determined there are no entities
        notify.error(NOTIFY_NO_ENTITIES_FOUND_IN_ENTITY_SITEMAP);
      }
    } catch (error) {
      console.error('[UnifiedContentSelector] Error fetching entities:', error);
      notify.error(notifyFailedToFetchEntitiesX(error instanceof Error ? error.message : 'Unknown error'));
      setServiceAreas([]);
      setHasNoEntities(true); // CRITICAL: Set flag to prevent infinite retries in useEffect
    } finally {
      setIsLoading(false);
    }
  }, [site.siteUrl, site.username, site.appPassword, site.entitySitemapUrl]);

  const fetchPages = useCallback(async () => {
    if (!site.username || !site.appPassword) {
      notify.error(NOTIFY_WORDPRESS_CREDENTIALS_MISSING_PLEASE_UPD);
      return;
    }
    setIsLoading(true);
    setHasNoPages(false); // Reset flag when attempting to fetch
    const result = await getPublishedPages(site.siteUrl, site.username, site.appPassword, 100, 0);
    if (result.error) {
      // Handle "no pages" case gracefully - don't show error toast
      if (result.error.includes('No published') || result.error.includes('not found')) {
        console.log('[UnifiedContentSelector] No published pages found - this is normal if the site has no pages yet');
        setPages([]);
        setHasNoPages(true); // Mark that we've determined there are no pages
      } else {
        notify.error(notifyFailedToFetchPagesX(result.error));
        setPages([]);
        setHasNoPages(false); // Reset flag on other errors (might be temporary)
      }
    } else {
      // Exclude thank-you pages (noindex) from selector - Content Optimizer module
      const allPages = result.posts || [];
      const isThankYouPage = (p: { slug?: string; link?: string; title?: string }) => {
        const slug = (p.slug || '').toLowerCase();
        const link = (p.link || '').toLowerCase();
        let path = '';
        try {
          if (p.link) path = new URL(p.link).pathname.toLowerCase();
        } catch {
          path = link;
        }
        const title = (p.title || '').toLowerCase();
        return slug.includes('thank-you') || path.includes('thank-you') || link.includes('thank-you') || title.includes('thank you');
      };
      const pagesFiltered = allPages.filter((p) => !isThankYouPage(p));
      setPages(pagesFiltered);
      setHasNoPages(pagesFiltered.length === 0);
    }
    setIsLoading(false);
  }, [site.siteUrl, site.username, site.appPassword]);

  // Reset flags when site URL changes
  useEffect(() => {
    setHasNoPosts(false);
    setHasNoEntities(false);
    setHasNoPages(false);
    setPosts([]);
    setServiceAreas([]);
    setPages([]);
  }, [site.siteUrl]);

  useEffect(() => {
    // Don't fetch if we've already determined there are no posts/entities/pages
    if (open && postType === 'post' && posts.length === 0 && !isLoading && !hasNoPosts) {
      fetchPosts();
    } else if (open && postType === 'service-area' && serviceAreas.length === 0 && !isLoading && !hasNoEntities) {
      fetchEntities();
    } else if (open && postType === 'page' && pages.length === 0 && !isLoading && !hasNoPages) {
      fetchPages();
    } else if (open && postType === 'both') {
      // Fetch posts and entities if not already loaded (both does not include pages)
      if (posts.length === 0 && !isLoading && !hasNoPosts) {
        fetchPosts();
      }
      if (serviceAreas.length === 0 && !isLoading && !hasNoEntities && site.entitySitemapUrl) {
        fetchEntities();
      }
    }
  }, [open, postType, posts.length, serviceAreas.length, pages.length, isLoading, hasNoPosts, hasNoEntities, hasNoPages, fetchPosts, fetchEntities, fetchPages, site.entitySitemapUrl]);

  const filteredItems = currentItems.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.link.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.slug?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every(item => selectedUrls.includes(item.link));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onValueChange([...new Set([...selectedUrls, ...filteredItems.map(p => p.link)])]);
    } else {
      onValueChange(selectedUrls.filter(url => !filteredItems.map(p => p.link).includes(url)));
    }
  };

  const handleToggleItem = (itemUrl: string) => {
    if (selectedUrls.includes(itemUrl)) {
      onValueChange(selectedUrls.filter(url => url !== itemUrl));
    } else {
      onValueChange([...selectedUrls, itemUrl]);
    }
  };

  const getDisplayText = () => {
    if (multiSelect) {
      if (selectedItems.length > 0) {
        const typeLabel = postType === 'post' ? 'posts' : postType === 'service-area' ? 'service areas' : postType === 'page' ? 'pages' : 'URLs';
        return selectedItems.length === 1 ? selectedItems[0].link : `${selectedItems.length} ${typeLabel} selected`;
      }
      const typeLabel = postType === 'post' ? 'posts' : postType === 'service-area' ? 'entities' : postType === 'page' ? 'pages' : 'URLs';
      return `Select ${typeLabel}...`;
    }
    if (selectedItem) {
      return selectedItem.link;
    }
    if (selectedUrl) {
      return selectedUrl;
    }
    const typeLabel = postType === 'post' ? 'post' : postType === 'service-area' ? 'entity' : postType === 'page' ? 'page' : 'URL';
    return `Select or enter ${typeLabel}...`;
  };
  return {
    posts,
    serviceAreas,
    pages,
    isLoading,
    searchQuery,
    setSearchQuery,
    hasNoPosts,
    hasNoEntities,
    hasNoPages,
    setHasNoPosts,
    setHasNoEntities,
    setHasNoPages,
    selectedUrls,
    selectedUrl,
    selectedItem,
    selectedItems,
    fetchPosts,
    fetchEntities,
    fetchPages,
    filteredItems,
    allFilteredSelected,
    handleSelectAll,
    handleToggleItem,
    getDisplayText,
  };
}
