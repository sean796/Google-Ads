import { logger } from "@/lib/logger";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_WORDPRESS_LINKS_UNAVAILABLE_CONTINUING_W, notifyAiSelectedXRelevantItemsForKeyword, notifyFetchingFullContentFromXSelectedIt, notifyLoadedContentFromXWordpressItemsFo } from "@/lib/notify-messages";
import { getMuteOptimizationToasts } from "./optimization-toast-mute";
import { getWordPressPostContent, getPublishedPosts, getPublishedPages } from "@/lib/wordpress-api";
import { htmlToMarkdown } from "@/lib/wordpress-converter";
import { type WordPressSite } from "@/components/integrations/types";
import { updateOptimizationProgress } from "./optimization-helpers";
import { selectRelevantPostsForBlog } from "@/lib/wordpress-post-selector";
import type { ProgressSetter } from "./optimization-helpers-a";
import type { ResolvedTargetLike } from "./use-optimization-state";

export async function fetchWordPressContentForRAG(
  site: WordPressSite,
  siteId: string,
  resolved: ResolvedTargetLike | null | undefined,
  primaryKeyword: string,
  secondaryKeywords: string[],
  openRouterApiKey: string,
  researchModel: string,
  setOptimizationProgress: ProgressSetter
): Promise<{
  wordPressPosts: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>;
  wordPressRAGContext: string;
}> {
  updateOptimizationProgress(setOptimizationProgress, siteId, "load", 0.55, 'Fetching posts from WordPress API...');

  let wordPressPosts: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }> = [];
  let pagesMetadata: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }> = [];

  try {
    // Detect if this is a page
    const isPage = resolved?.subtype === 'page' || 
                   resolved?.endpoint === 'pages';
    
    // ALWAYS fetch via API - NO CACHE
    updateOptimizationProgress(setOptimizationProgress, siteId, "load", 0.55, isPage ? 'Loading posts and pages from WordPress REST API...' : 'Loading posts from WordPress REST API...');
    if (!getMuteOptimizationToasts()) notify.info(isPage ? 'Fetching WordPress posts and pages via API...' : 'Fetching WordPress posts via API...', { duration: 2000 });

    // Fetch all published posts from WordPress API
    const publishedResult = await getPublishedPosts(site.siteUrl, site.username, site.appPassword, 200, 0);
    
    // If this is a page, also fetch pages
    if (isPage) {
      try {
        const pagesResult = await getPublishedPages(site.siteUrl, site.username, site.appPassword, 200, 0);
        if (pagesResult.posts && pagesResult.posts.length > 0) {
          pagesMetadata = pagesResult.posts.map((p) => ({
            id: p.id,
            slug: p.slug || '',
            title: p.title || '',
            excerpt: (p.excerpt || '').replace(/<[^>]+>/g, '').substring(0, 200),
            link: p.link || p.slug || '',
            date_gmt: p.date_gmt || ''
          })).filter(p => p.id && p.title && (p.link || p.slug));
        }
      } catch (pagesError) {
        logger.warn('[Optimize Content] Could not fetch pages for RAG context:', pagesError);
      }
    }
    
    if ((!publishedResult.posts || publishedResult.posts.length === 0) && pagesMetadata.length === 0) {
      logger.warn('[Optimize Content] No WordPress posts or pages found via API');
      return { wordPressPosts: [], wordPressRAGContext: '' };
    }

    // Convert to metadata format
    const allPostsMetadata = (publishedResult.posts ?? []).map((p) => ({
      id: p.id,
      slug: p.slug || '',
      title: p.title || '',
      excerpt: (p.excerpt || '').replace(/<[^>]+>/g, '').substring(0, 200),
      link: p.link || p.slug || '',
      date_gmt: p.date_gmt || ''
    })).filter(p => p.id && p.title && (p.link || p.slug));
    
    // Combine posts and pages metadata
    const allContentMetadata = [...allPostsMetadata, ...pagesMetadata];

    // Use AI to filter posts/pages by primary + secondary keywords
    updateOptimizationProgress(setOptimizationProgress, siteId, "load", 0.56, `Filtering ${allContentMetadata.length} items (${allPostsMetadata.length} posts${isPage ? `, ${pagesMetadata.length} pages` : ''}) by keywords: ${primaryKeyword}${secondaryKeywords.length > 0 ? ` + ${secondaryKeywords.length} secondary` : ''}...`);
    
    const combinedKeywords = [primaryKeyword, ...secondaryKeywords].filter(kw => kw && kw.trim().length > 0).join(', ');
    const blogTitle = `Content about ${primaryKeyword}`;

    const selectionResult = await selectRelevantPostsForBlog(
      combinedKeywords,
      blogTitle,
      allContentMetadata,
      {
        apiKey: openRouterApiKey,
        model: researchModel,
        maxPosts: 20, // Get up to 20 relevant items
        temperature: 0.7
        // DO NOT pass siteId - we want to use postsMetadata directly, not cache
      }
    );

    // Convert selected posts to wordPressPosts format
    wordPressPosts = selectionResult.selectedPosts.map(sp => {
      const originalPost = allPostsMetadata.find(p => p.id === sp.id);
      return {
        id: sp.id,
        slug: sp.slug,
        title: sp.title,
        excerpt: originalPost?.excerpt || '',
        link: sp.link,
        date_gmt: originalPost?.date_gmt || ''
      };
    });

    if (!getMuteOptimizationToasts()) notify.success(notifyAiSelectedXRelevantItemsForKeyword(wordPressPosts.length), { duration: 2000 });

  } catch (error) {
    logger.error('[Optimize Content] Error fetching WordPress posts via API:', error);
    if (!getMuteOptimizationToasts()) notify.warning(NOTIFY_WORDPRESS_LINKS_UNAVAILABLE_CONTINUING_W, { duration: 4000 });
  }

  // Fetch full content for selected posts
  let wordPressRAGContext = '';
  if (wordPressPosts.length > 0) {
    try {
      updateOptimizationProgress(setOptimizationProgress, siteId, "load", 0.58, `Loading content from ${wordPressPosts.length} selected items...`);
      if (!getMuteOptimizationToasts()) notify.info(notifyFetchingFullContentFromXSelectedIt(wordPressPosts.length), { duration: 2000 });

      const ragContent: string[] = [];

      for (let i = 0; i < wordPressPosts.length; i++) {
        const post = wordPressPosts[i];
        try {
          updateOptimizationProgress(setOptimizationProgress, siteId, "load", (58 + Math.floor((i / wordPressPosts.length) * 2)) / 100, `Fetching ${i + 1}/${wordPressPosts.length}: ${post.title.substring(0, 40)}...`);

          // Query WordPress API to discover post type - NO GUESSING
          // The API will try all post types systematically
          // Check if this is a page by looking it up in pagesMetadata
          const isPageItem = pagesMetadata.some(p => p.id === post.id);
          const contentResult = await getWordPressPostContent(
            site.siteUrl, 
            site.username, 
            site.appPassword, 
            undefined, 
            undefined, 
            [{ id: post.id, subtype: isPageItem ? 'page' : 'post' }] // Use page subtype if it's a page
          );

          if (contentResult && contentResult.posts && contentResult.posts.length > 0) {
            const wpPost = contentResult.posts[0];
            if (wpPost.content) {
              const markdownContent = htmlToMarkdown(wpPost.content);
              const excerpt = wpPost.excerpt ? htmlToMarkdown(wpPost.excerpt) : '';
              const MAX_CONTENT_CHARS = 1200; // essential stats only - avoid token overflow
              const contentSnippet = markdownContent.substring(0, MAX_CONTENT_CHARS) + (markdownContent.length > MAX_CONTENT_CHARS ? '...' : '');
              ragContent.push(`--- ${post.title} (${post.link}) ---\n${excerpt ? `**Excerpt:** ${excerpt.substring(0, 200)}\n\n` : ''}**Content:**\n${contentSnippet}\n`);
            }
          }
        } catch (postError) {
          logger.warn(`[Optimize Content] Could not fetch content for post ${post.id}:`, postError);
        }
      }

      if (ragContent.length > 0) {
        const joined = ragContent.join('\n\n');
        const MAX_RAG_TOTAL_CHARS = 18_000; // essential stats only - keep under token limit
        wordPressRAGContext = joined.length > MAX_RAG_TOTAL_CHARS ? joined.slice(0, MAX_RAG_TOTAL_CHARS) + '\n\n[Truncated for token limit.]' : joined;
        if (!getMuteOptimizationToasts()) notify.success(notifyLoadedContentFromXWordpressItemsFo(ragContent.length), { duration: 3000 });
      }
    } catch (ragError) {
      logger.warn('[Optimize Content] Error building WordPress RAG context:', ragError);
    }
  }

  return { wordPressPosts, wordPressRAGContext };
}
