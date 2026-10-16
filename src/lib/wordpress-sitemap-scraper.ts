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
  console.log(`[WordPress] Parsed ${parseResult.urls.length} URLs from sitemap`);
  
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
  console.log(`[WordPress] Found ${existingFiles.length} existing files in knowledge base`);
  
  const newFiles: StoredFile[] = [];
  const baseTimestamp = Date.now();

  // Process each URL - fetch content, summarize, and create markdown file
  console.log(`[WordPress] Processing ${allUrls.length} URLs`);
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
      console.warn("[WordPress] Bulk post inventory failed; falling back to per-URL REST", e);
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
      console.log(`[WordPress] Fetching content from WordPress API: ${url}`);
      
      // Extract last path segment, try posts then pages, ALWAYS SAVE
      const normalizedUrl = site.siteUrl.replace(/\/$/, '');
      const authHeader = site.username && site.appPassword 
        ? `Basic ${btoa(`${site.username}:${site.appPassword}`)}`
        : null;
      
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
          console.log(`[WordPress] Used bulk inventory for slug: ${slugKeyFromPathSegment(slug)}`);
        }
      }
      
      if (slug && !isHomepage && !pageContent) {
        // Build list of post types to try: posts, pages, and custom post types from URL path
        const postTypes = ['posts', 'pages'];
        
        // Detect custom post type from URL path (e.g., /service-area/... -> service-area)
        if (pathSegments.length > 1) {
          const pathSegment = pathSegments[0]; // e.g., "service-area"
          // Try both hyphenated and underscore versions (WordPress REST uses underscores)
          postTypes.push(pathSegment.replace(/-/g, '_')); // service-area -> service_area
          // Also try exact path segment in case REST base is different
          if (pathSegment.includes('-')) {
            postTypes.push(pathSegment); // Keep service-area as-is
          }
        }
        
        // Try each post type via WordPress REST API ONLY
        for (const postType of postTypes) {
          if (pageContent) break; // Stop if we found content
          
          try {
            const apiUrl = `${normalizedUrl}/wp-json/wp/v2/${postType}?slug=${encodeURIComponent(slug)}`;
            
            // Rate limiting - delay before each API request
            if (i > 0 || postTypes.indexOf(postType) > 0) {
              await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
            }
            
            const response = await fetch(apiUrl, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...(authHeader ? { 'Authorization': authHeader } : {}),
              },
            });
            
            if (response.ok) {
              const data = await response.json();
              if (Array.isArray(data) && data.length > 0) {
                const contentData = data[0];
                
                if (contentData.title?.rendered) {
                  title = contentData.title.rendered;
                  pageTitle = title;
                }
                
                const contentHtml = contentData.content?.rendered || contentData.content || '';
                const excerptHtml = contentData.excerpt?.rendered || contentData.excerpt || '';
                const contentText = htmlToMarkdown(contentHtml).trim();
                const excerptText = htmlToMarkdown(excerptHtml).trim();
                
                pageContent = excerptText ? excerptText + '\n\n' + contentText : contentText;
                console.log(`[WordPress] Found via REST API as ${postType}: ${slug}`);
                break;
              }
            } else if (response.status === 404) {
              // Post type doesn't exist or not REST-exposed - try next
              console.log(`[WordPress] Post type ${postType} not found or not REST-exposed (404)`);
            } else if (response.status === 429) {
              // Rate limited - wait longer and retry
              console.warn(`[WordPress] Rate limited (429) for ${postType}, waiting longer...`);
              await new Promise(resolve => setTimeout(resolve, delayBetweenRequests * 3));
              // Retry once
              const retryResponse = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  ...(authHeader ? { 'Authorization': authHeader } : {}),
                },
              });
              if (retryResponse.ok) {
                const data = await retryResponse.json();
                if (Array.isArray(data) && data.length > 0) {
                  const contentData = data[0];
                  if (contentData.title?.rendered) {
                    title = contentData.title.rendered;
                    pageTitle = title;
                  }
                  const contentHtml = contentData.content?.rendered || contentData.content || '';
                  const excerptHtml = contentData.excerpt?.rendered || contentData.excerpt || '';
                  const contentText = htmlToMarkdown(contentHtml).trim();
                  const excerptText = htmlToMarkdown(excerptHtml).trim();
                  pageContent = excerptText ? excerptText + '\n\n' + contentText : contentText;
                  console.log(`[WordPress] Found via REST API as ${postType} (after retry): ${slug}`);
                  break;
                }
              }
            }
          } catch (error) {
            console.warn(`[WordPress] Error fetching ${postType} via REST API: ${error}`);
          }
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
          console.log(`[WordPress] Summarizing content (${pageContent.length} chars) with AI...`);
          
          const summaryResult = await summarizeContentWithAI(pageContent, {
            apiKey: openRouterApiKey,
            model: resolveModelForAgentCategory("research"),
            temperature: 0.7,
            maxTokens: 4000,
            topP: 0.9,
            onProgress: (message) => {
              console.log(`[WordPress] AI Progress for ${url}: ${message}`);
            },
          });
          
          summarizedContent = summaryResult.summarizedContent;
          console.log(`[WordPress] Summarized: ${summaryResult.originalLength} → ${summaryResult.summarizedLength} chars`);
        } catch (error) {
          console.error(`[WordPress] AI summarization failed for ${url}:`, error);
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
      console.log(`[WordPress] Added file for ${url}: ${filename} (${markdownContent.length} chars)`);
      
    } catch (error) {
      console.error(`[WordPress] Error processing URL ${url}:`, error);
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
      console.log(`[WordPress] Saved URL despite error: ${url}`);
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
  
  console.log(`[WordPress] Created ${newFiles.length} files from URLs`);

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
    console.log(`[WordPress] Adding ${uniqueNewFiles.length} files to knowledge base. Total files: ${allFiles.length}`);
    
    // Save all files
    localStorage.setItem(KB_FILES_STORAGE_KEY, JSON.stringify(allFiles));
    
    // Dispatch custom event to notify all components of the update
    window.dispatchEvent(new CustomEvent('kb-files-updated', { 
      detail: { files: allFiles } 
    }));
  }

  console.log(`[WordPress] Final count - Added: ${newFiles.length} URLs to knowledge base`);
  
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
      console.log(
        `[WordPress] Stored metadata for ${postsMetadata.length} posts (${futureCount} future)`,
      );
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
    console.error(`[WordPress] Error fetching post metadata:`, error);
    // Don't fail the entire scraping process if metadata fetch fails
  }
  
  if (newFiles.length > 0) {
    notify.success(notifySuccessfullyAddedXUrlxFromXToKnow(newFiles.length, newFiles.length !== 1 ? 's' : '', childSitemapUrl));
  } else {
    notify.error(NOTIFY_NO_URLS_COULD_BE_ADDED_TO_KNOWLEDGE_BASE);
  }
}

