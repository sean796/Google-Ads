import { notify } from "@/lib/app-notifications";
import { NOTIFY_NO_URLS_COULD_BE_ADDED_TO_KNOWLEDGE_BASE, NOTIFY_OPENROUTER_API_KEY_NOT_FOUND_CONTENT_WIL, notifySuccessfullyAddedXUrlxFromXToKnow } from "@/lib/notify-messages";
import { loadApiKey } from "@/lib/api";
import { summarizeContentWithAI } from "@/lib/content-summarizer";
import { htmlToMarkdown } from "@/lib/wordpress-converter";
import { resolveModelForAgentCategory } from "@/lib/openrouter-agent-category-api";
import {
  parseSitemap,
  resolveWordPressUrls,
  getWordPressPostContent,
  getSitePostInventory,
  type SitePostInventoryResponse,
  type SitePostInventoryRow,
} from "@/lib/wordpress-api";
import { KB_FILES_STORAGE_KEY, type StoredFile } from "@/components/integrations/types";
import { type WordPressSite } from "@/components/integrations/types";
import { getStoredSites, saveSites } from "@/components/integrations/storage";
import { logger } from "@/lib/logger";

function slugKeyFromPathSegment(segment: string): string {
  return segment.replace(/\.(html?|php)$/i, "").toLowerCase();
}

function isStandardPostSitemapUrl(sitemapUrl: string): boolean {
  const u = sitemapUrl.toLowerCase();
  return (
    u.includes("post-sitemap") ||
    u.includes("post_sitemap") ||
    u.includes("posts-sitemap") ||
    u.includes("posts_sitemap")
  );
}

export async function scrapeChildSitemap(
  site: WordPressSite,
  childSitemapUrl: string,
  onProgress?: (message: string) => void
): Promise<void> {
  if (!site.sitemaps) {
    throw new Error("Please detect sitemaps first before scraping");
  }

  onProgress?.(`Starting to scrape sitemap: ${childSitemapUrl}...`);
  
  // Parse the specific child sitemap
  const parseResult = await parseSitemap(
    site.siteUrl,
    childSitemapUrl,
    site.username,
    site.appPassword
  );

  if (!parseResult.urls || parseResult.urls.length === 0) {
    throw new Error(`No URLs found in sitemap: ${childSitemapUrl}`);
  }

  onProgress?.(`Found ${parseResult.urls.length} URLs. Adding all URLs to knowledge base...`);
  
  const allUrls = parseResult.urls;
  
  if (allUrls.length === 0) {
    throw new Error("No URLs found in sitemap");
  }

  // FETCH CONTENT FROM EACH URL, SUMMARIZE WITH AI, AND ADD TO KNOWLEDGE BASE
  onProgress?.(`Fetching and summarizing content from ${allUrls.length} URLs...`);
  
  // Load OpenRouter API key for AI summarization
  const openRouterApiKey = loadApiKey();
  const useAISummarization = !!openRouterApiKey && openRouterApiKey.trim().length > 0;
  
  if (!useAISummarization) {
    notify.warning(NOTIFY_OPENROUTER_API_KEY_NOT_FOUND_CONTENT_WIL);
  }
  
  // Get existing files from knowledge base
  const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]';
  const existingFiles = JSON.parse(storedFilesString) as StoredFile[];
  
  const newFiles: StoredFile[] = [];
  const baseTimestamp = Date.now();

  // Process each URL - fetch content, summarize, and create markdown file
  const delayBetweenRequests = 200; // ms - rate limiting to avoid 429 errors

  let bulkPostInventory: SitePostInventoryResponse | null = null;
  let bulkBySlug: Map<string, SitePostInventoryRow> | null = null;
  if (site.username && site.appPassword && isStandardPostSitemapUrl(childSitemapUrl)) {
    try {
      onProgress?.("Loading published posts in bulk from WordPress (one REST collection chain)...");
      const inv = await getSitePostInventory(site.siteUrl, site.username, site.appPassword, {
        includeContent: true,
      });
      if (!inv.error && inv.posts?.length) {
        bulkPostInventory = inv;
        bulkBySlug = new Map<string, SitePostInventoryRow>();
        for (const row of inv.posts) {
          const key =
            (row.slug && row.slug.trim().toLowerCase()) ||
            (() => {
              try {
                const segs = new URL(row.url).pathname.split("/").filter((s) => s.length > 0);
                const last = segs[segs.length - 1] || "";
                return slugKeyFromPathSegment(last);
              } catch {
                return "";
              }
            })();
          if (key) {
            bulkBySlug.set(key, row);
          }
        }
        onProgress?.(`Matched REST library: ${inv.posts.length} posts for sitemap URLs`);
      }
    } catch (e) {
      logger.warn("[WordPress] Bulk post inventory failed; falling back to per-URL REST", e);
    }
  }

  for (let i = 0; i < allUrls.length; i++) {
    const url = allUrls[i];
    const timestamp = baseTimestamp + (i * 1000) + Math.floor(Math.random() * 999);
    
    try {
      // Parse URL once
      const urlObj = new URL(url);
      
      // Handle homepage - still fetch and save
      const isHomepage = urlObj.pathname === '/' || urlObj.pathname === '' || urlObj.pathname === '/index.html' || urlObj.pathname === '/index.php';
      
      // Extract filename from URL
      let filename = `wordpress-url-${timestamp}.md`;
      let pageTitle = url;
      const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
      if (pathSegments.length > 0) {
        const slug = pathSegments[pathSegments.length - 1].replace(/[^a-z0-9-]/gi, '-');
        filename = `wordpress-url-${slug}-${timestamp}.md`;
      }
      
      // Extract slug from URL and fetch directly from WordPress REST API
      onProgress?.(`Fetching content from ${i + 1}/${allUrls.length}: ${url.substring(0, 50)}...`);
      
      let pageContent = '';
      let title = url;
      
      // WORDPRESS REST API ONLY - Extract slug, try posts/pages/custom post types
      const slug = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : null;

      if (slug && !isHomepage && bulkBySlug) {
        const invRow = bulkBySlug.get(slugKeyFromPathSegment(slug));
        const hasHtml =
          invRow &&
          (String(invRow.fields.content ?? "").trim() !== "" ||
            String(invRow.fields.excerpt ?? "").trim() !== "");
        if (hasHtml && invRow) {
          if (invRow.fields.title) {
            title = invRow.fields.title;
            pageTitle = title;
          }
          const contentHtml = invRow.fields.content ?? "";
          const excerptHtml = invRow.fields.excerpt ?? "";
          const contentText = htmlToMarkdown(contentHtml).trim();
          const excerptText = htmlToMarkdown(excerptHtml).trim();
          pageContent = excerptText ? `${excerptText}\n\n${contentText}` : contentText;
        }
      }
      
      if (slug && !isHomepage && !pageContent) {
        // Hub slug lookup: the server resolves posts, pages, and custom post types.
        try {
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
          }
          const restHints = pathSegments.length > 1
            ? Array.from(new Set([pathSegments[0], pathSegments[0].replace(/-/g, '_')]))
            : undefined;
          const result = await getWordPressPostContent(
            site.siteUrl,
            site.username,
            site.appPassword,
            undefined,
            [slug],
            undefined,
            { restEndpointHints: restHints },
          );
          const found = result.posts?.[0];
          if (found) {
            if (found.title) {
              title = found.title;
              pageTitle = title;
            }
            const contentText = htmlToMarkdown(found.content || '').trim();
            const excerptText = htmlToMarkdown(found.excerpt || '').trim();
            pageContent = excerptText ? excerptText + '\n\n' + contentText : contentText;
          }
        } catch (error) {
          logger.warn(`[WordPress] Hub content lookup failed for slug ${slug}: ${error}`);
        }
      }
      
      // ALWAYS use fetched content or URL - NO FALLBACKS, JUST SAVE WHAT WE HAVE
      if (!pageContent) {
        pageContent = url;
      }
      
      // ALWAYS SUMMARIZE WITH AI IF API KEY AVAILABLE - NO MINIMUM LENGTH CHECK
      let summarizedContent = pageContent;
      if (useAISummarization) {
        try {
          onProgress?.(`AI summarizing content from ${i + 1}/${allUrls.length}...`);
          
          const summaryResult = await summarizeContentWithAI(pageContent, {
            apiKey: openRouterApiKey,
            model: resolveModelForAgentCategory("research"),
            temperature: 0.7,
            maxTokens: 4000,
            topP: 0.9,
            onProgress: (message) => {
            },
          });
          
          summarizedContent = summaryResult.summarizedContent;
        } catch (error) {
          logger.error(`[WordPress] AI summarization failed for ${url}:`, error);
          // Continue with original content if summarization fails - STILL SAVE IT
        }
      }
      
      // Create markdown content with URL, title, and summarized content
      const markdownContent = `# ${pageTitle}\n\n**URL:** ${url}\n\n**Source:** Scraped from ${childSitemapUrl}\n\n## Content\n\n${summarizedContent}\n\n`;
      
      const newFile: StoredFile = {
        name: filename,
        size: markdownContent.length,
        content: markdownContent,
        starred: false,
        timestamp: timestamp,
      };
      
      newFiles.push(newFile);
      
    } catch (error) {
      logger.error(`[WordPress] Error processing URL ${url}:`, error);
      // ALWAYS SAVE - NO REJECTIONS - Create file with URL even if everything fails
      const errorFilename = `wordpress-url-${timestamp}.md`;
      const errorContent = `# ${url}\n\n**URL:** ${url}\n\n**Source:** Scraped from ${childSitemapUrl}\n\n**Note:** Content could not be fully processed: ${error instanceof Error ? error.message : 'Unknown error'}\n\n`;
      
      newFiles.push({
        name: errorFilename,
        size: errorContent.length,
        content: errorContent,
        starred: false,
        timestamp: timestamp,
      });
    }
    
    // Rate limiting - delay between URLs (except for the last one)
    if (i < allUrls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
    }
    
    // Update progress every 10 URLs
    if ((i + 1) % 10 === 0 || i === allUrls.length - 1) {
      onProgress?.(`Processed ${i + 1}/${allUrls.length} URLs...`);
    }
  }
  

  // Add all new files to localStorage at once
  if (newFiles.length > 0) {
    // Check for duplicate names within newFiles AND against existingFiles, make them unique
    const seenNames = new Set<string>();
    const uniqueNewFiles = newFiles.map((file, index) => {
      let finalName = file.name;
      
      // Check if this name was already used in this batch OR exists in existing files
      if (seenNames.has(finalName) || existingFiles.find(f => f.name === finalName)) {
        // Make the name unique by appending index and a unique suffix
        const nameParts = finalName.split('.');
        const extension = nameParts.pop() || 'md';
        const baseName = nameParts.join('.');
        // Use index and a random number to ensure uniqueness
        const uniqueSuffix = `${index}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        finalName = `${baseName}-${uniqueSuffix}.${extension}`;
      }
      
      // Mark this name as seen
      seenNames.add(finalName);
      
      // Return file with unique name
      return {
        ...file,
        name: finalName
      };
    });
    
    const allFiles = [...existingFiles, ...uniqueNewFiles];
    
    // Save all files
    localStorage.setItem(KB_FILES_STORAGE_KEY, JSON.stringify(allFiles));
    
    // Dispatch custom event to notify all components of the update
    window.dispatchEvent(new CustomEvent('kb-files-updated', { 
      detail: { files: allFiles } 
    }));
  }

  
  // Fetch and store post metadata for calendar view (prefer bulk inventory — no resolve-urls + get-post-content storm)
  onProgress?.(`Fetching post metadata for calendar view...`);
  try {
    const now = new Date();

    const persistMetadata = (
      postsMetadata: Array<{
        id: number;
        slug: string;
        title: string;
        date_gmt: string;
        status: string;
        link: string;
      }>,
    ) => {
      const futureCount = postsMetadata.filter((post) => {
        if (post.status === "future") return true;
        if (!post.date_gmt) return false;
        try {
          const postDate = new Date(post.date_gmt);
          return postDate > now;
        } catch {
          return false;
        }
      }).length;

      const sites = getStoredSites();
      const updatedSites = sites.map((s) => {
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
      saveSites(updatedSites);
    };

    if (bulkPostInventory?.posts?.length) {
      const postsMetadata = bulkPostInventory.posts
        .filter((p) => typeof p.id === "number" && p.id > 0)
        .map((post) => {
          let status = "publish";
          if (post.date_gmt) {
            try {
              const postDate = new Date(post.date_gmt);
              if (postDate > now) {
                status = "future";
              }
            } catch {
              /* keep publish */
            }
          }
          const slug =
            post.slug ||
            (() => {
              try {
                const segs = new URL(post.url).pathname.split("/").filter((x) => x.length > 0);
                return segs[segs.length - 1] || "";
              } catch {
                return "";
              }
            })();
          return {
            id: post.id as number,
            slug,
            title: post.fields.title,
            date_gmt: post.date_gmt || "",
            status,
            link: post.url,
          };
        });
      persistMetadata(postsMetadata);
    } else if (site.username && site.appPassword) {
      const resolveResult = await resolveWordPressUrls(
        site.siteUrl,
        site.username,
        site.appPassword,
        allUrls,
      );

      if (resolveResult.resolved && resolveResult.resolved.length > 0) {
        const resolvedObjects = resolveResult.resolved.map((r) => ({
          id: r.id,
          subtype: r.subtype,
        }));
        const postContentResult = await getWordPressPostContent(
          site.siteUrl,
          site.username,
          site.appPassword,
          undefined,
          undefined,
          resolvedObjects,
        );

        if (postContentResult.posts && postContentResult.posts.length > 0) {
          const postsMetadata = postContentResult.posts.map((post) => {
            let status = post.status || "publish";
            if (!post.status && post.date_gmt) {
              try {
                const postDate = new Date(post.date_gmt);
                if (postDate > now) {
                  status = "future";
                }
              } catch {
                /* keep */
              }
            }

            return {
              id: post.id,
              slug: post.slug,
              title: post.title,
              date_gmt: post.date_gmt || "",
              status,
              link: post.link,
            };
          });

          persistMetadata(postsMetadata);
        }
      }
    }
  } catch (error) {
    logger.error(`[WordPress] Error fetching post metadata:`, error);
    // Don't fail the entire scraping process if metadata fetch fails
  }
  
  if (newFiles.length > 0) {
    notify.success(notifySuccessfullyAddedXUrlxFromXToKnow(newFiles.length, newFiles.length !== 1 ? 's' : '', childSitemapUrl));
  } else {
    notify.error(NOTIFY_NO_URLS_COULD_BE_ADDED_TO_KNOWLEDGE_BASE);
  }
}

