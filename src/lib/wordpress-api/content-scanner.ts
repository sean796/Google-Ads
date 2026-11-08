/**
 * WordPress Content Scanner
 * Scan all posts, pages, and custom post types to extract company-specific data
 */

import { BACKEND_API_BASE } from './connection';
import { logger } from "@/lib/logger";
import { getWordPressPostContent } from './posts';
import { getPostFieldsForPost } from './post-fields-discovery';
import type { WordPressSite } from '@/components/integrations/types';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export interface ScannedPost {
  id: number;
  postType: string;
  postTypeEndpoint: string;
  title: string;
  content: string;
  excerpt: string;
  link: string;
  slug: string;
  status: string;
  acfFields: Record<string, unknown>;
  metaFields: Record<string, unknown>;
  taxonomies: Record<string, string[]>;
}

export interface ScanOptions {
  postTypes?: string[];
  maxPostsPerType?: number;
  includeDrafts?: boolean;
  onProgress?: (message: string, progress: number) => void;
}

export interface ScanResult {
  success: boolean;
  posts: ScannedPost[];
  totalPosts: number;
  postTypes: string[];
  error?: string;
}

/**
 * Get all registered post types from WordPress REST API
 */
export async function getAllPostTypes(site: WordPressSite): Promise<string[]> {
  const url = `${BACKEND_API_BASE}/api/wordpress/get-post-types`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl: site.siteUrl,
        username: site.username,
        appPassword: site.appPassword,
      }),
    });

    if (!response.ok) {
            // If endpoint doesn't exist, return default post types
      return ['post', 'page'];
    }

    const data = await response.json();
        
    // Filter out WordPress core post types that often don't have REST API endpoints
    const filteredTypes = (data.postTypes || ['post', 'page']).filter((type: string) => 
      !type.startsWith('wp_') || type === 'wp_block' // Allow wp_block but filter others
    );
    
    return filteredTypes.length > 0 ? filteredTypes : ['post', 'page'];
  } catch (error) {
        // Fallback to default post types
    return ['post', 'page'];
  }
}

/**
 * Get all posts for a specific post type (paginated)
 */
async function getAllPosts(
  site: WordPressSite,
  postType: string,
  postTypeEndpoint: string,
  maxPosts: number = 1000,
  includeDrafts: boolean = false,
  onProgress?: (message: string, progress: number) => void
): Promise<Array<{
  id: number;
  postType: string;
  postTypeEndpoint: string;
  title: string;
  link: string;
  slug: string;
  status: string;
}>> {
  const url = `${BACKEND_API_BASE}/api/wordpress/get-posts-list`;
  const allPosts: Array<{
    id: number;
    postType: string;
    postTypeEndpoint: string;
    title: string;
    link: string;
    slug: string;
    status: string;
  }> = [];
  
  let page = 1;
  const perPage = 100;
  let hasMore = true;

  while (hasMore && allPosts.length < maxPosts) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          siteUrl: site.siteUrl,
          username: site.username,
          appPassword: site.appPassword,
          postType,
          postTypeEndpoint,
          perPage,
          page,
          status: includeDrafts ? undefined : 'publish',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
                throw new Error(errorText);
      }

      const data = await response.json();
            
      // Handle backend returning error in JSON body (404 case)
      if (data.error) {
                // Post type doesn't exist or isn't accessible - skip it gracefully
        logger.warn(`Post type ${postType} not available: ${data.error}`);
        return [];
      }
      
      const posts = data.posts || [];

      if (posts.length === 0) {
        hasMore = false;
        break;
      }

      allPosts.push(...posts.map((post: {
        id: number;
        title?: string | { rendered?: string };
        link?: string;
        slug?: string;
        status?: string;
      }) => ({
        id: post.id,
        postType,
        postTypeEndpoint,
        title: typeof post.title === 'string' ? post.title : post.title?.rendered || '',
        link: post.link || '',
        slug: post.slug || '',
        status: post.status || 'publish',
      })));

      onProgress?.(`Fetched ${allPosts.length} ${postType} posts...`, (allPosts.length / maxPosts) * 100);

      if (posts.length < perPage) {
        hasMore = false;
      } else {
        page++;
      }
    } catch (error) {
            logger.error(`Error fetching ${postType} posts (page ${page}):`, error);
      hasMore = false;
    }
  }

  return allPosts.slice(0, maxPosts);
}

/**
 * Extract company-specific data from a post
 */
function extractCompanyData(post: ScannedPost): {
  urls: string[];
  emails: string[];
  phones: string[];
  businessNames: string[];
  colors: string[];
  addresses: string[];
} {
  const urls: string[] = [];
  const emails: string[] = [];
  const phones: string[] = [];
  const businessNames: string[] = [];
  const colors: string[] = [];
  const addresses: string[] = [];

  // Extract from title
  const titleText = post.title || '';
  
  // Extract from content
  const contentText = post.content || '';
  
  // Extract from excerpt
  const excerptText = post.excerpt || '';

  // Extract from ACF fields
  const acfText = JSON.stringify(post.acfFields || {});

  // Combine all text sources
  const allText = [titleText, contentText, excerptText, acfText].join(' ');

  // URL pattern
  const urlPattern = /https?:\/\/[^\s<>"']+/gi;
  const urlMatches = allText.match(urlPattern);
  if (urlMatches) {
    urls.push(...urlMatches);
  }

  // Email pattern
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const emailMatches = allText.match(emailPattern);
  if (emailMatches) {
    emails.push(...emailMatches);
  }

  // Phone pattern
  const phonePattern = /(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g;
  const phoneMatches = allText.match(phonePattern);
  if (phoneMatches) {
    phones.push(...phoneMatches);
  }

  // Color pattern (hex)
  const colorPattern = /#([0-9a-fA-F]{3}){1,2}\b/g;
  const colorMatches = allText.match(colorPattern);
  if (colorMatches) {
    colors.push(...colorMatches);
  }

  // Business name pattern (capitalized words with company suffixes)
  const businessNamePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Inc|LLC|Ltd|Corp|Corporation|Company|Co|Group|Solutions|Services|Digital|Tech|Technologies|Systems|Software|Design|Marketing|Media|Agency|Consulting))?)\b/g;
  const businessMatches = allText.match(businessNamePattern);
  if (businessMatches) {
    businessNames.push(...businessMatches.filter(name => name.length > 3 && name.length < 50));
  }

  // Address pattern (simplified)
  const addressPattern = /\d+\s+[A-Za-z0-9\s,]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Circle|Ct|Court|Place|Pl)\b[^,]*,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?/gi;
  const addressMatches = allText.match(addressPattern);
  if (addressMatches) {
    addresses.push(...addressMatches);
  }

  return {
    urls: [...new Set(urls)],
    emails: [...new Set(emails)],
    phones: [...new Set(phones)],
    businessNames: [...new Set(businessNames)],
    colors: [...new Set(colors)],
    addresses: [...new Set(addresses)],
  };
}

/**
 * Scan WordPress site for all posts and extract data
 */
export async function scanWordPressSite(
  site: WordPressSite,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const {
    postTypes: requestedPostTypes,
    maxPostsPerType = 1000,
    includeDrafts = false,
    onProgress,
  } = options;

  try {
    onProgress?.('Discovering post types...', 0);
    
    // Get all post types
    const allPostTypes = await getAllPostTypes(site);
    const postTypesToScan = requestedPostTypes || allPostTypes;
    
    onProgress?.(`Found ${postTypesToScan.length} post types`, 5);

    const scannedPosts: ScannedPost[] = [];
    let totalScanned = 0;

    // Scan each post type
    for (let i = 0; i < postTypesToScan.length; i++) {
      const postType = postTypesToScan[i];
      const postTypeEndpoint = postType === 'post' ? 'posts' : postType === 'page' ? 'pages' : postType;
      
      onProgress?.(`Scanning ${postType}...`, (i / postTypesToScan.length) * 30 + 10);

      // Get all posts for this type
      const posts = await getAllPosts(
        site,
        postType,
        postTypeEndpoint,
        maxPostsPerType,
        includeDrafts,
        (msg, progress) => {
          onProgress?.(msg, (i / postTypesToScan.length) * 30 + 10 + (progress * 0.2));
        }
      );

      onProgress?.(`Found ${posts.length} ${postType} posts. Extracting data...`, (i / postTypesToScan.length) * 50 + 30);

      // For each post, get full content and ACF fields
      for (let j = 0; j < posts.length; j++) {
        const post = posts[j];
        const progress = ((i * maxPostsPerType + j) / (postTypesToScan.length * maxPostsPerType)) * 50 + 30;
        
        try {
          // Get full post content
          const contentResult = await getWordPressPostContent(
            site.siteUrl,
            site.username,
            site.appPassword,
            undefined,
            undefined,
            [{ id: post.id, subtype: post.postTypeEndpoint }]
          );

          const postContent = contentResult.posts?.[0];
          if (!postContent) continue;

          // Get ACF fields
          let acfFields: Record<string, unknown> = {};
          try {
            const acfResult = await getPostFieldsForPost(
              site,
              post.id,
              post.postType,
              post.postTypeEndpoint
            );
                        if (acfResult.success) {
              acfFields = acfResult.fields || {};
            }
          } catch (acfError) {
                        // ACF fields might not be available, continue without them
            logger.warn(`Could not fetch ACF fields for post ${post.id}:`, acfError);
          }

          // Extract meta fields (if available in postContent)
          const metaFields: Record<string, unknown> = {};
          const fullMeta = (postContent.fullData as { meta?: Record<string, unknown> } | undefined)?.meta;
          if (fullMeta) {
            Object.assign(metaFields, fullMeta);
          }

          // Extract taxonomies (if available)
          const taxonomies: Record<string, string[]> = {};
          if (postContent.categories) {
            taxonomies.categories = postContent.categories.map((c) => String(c));
          }
          if (postContent.tags) {
            taxonomies.tags = postContent.tags.map((t) => String(t));
          }

          scannedPosts.push({
            id: post.id,
            postType: post.postType,
            postTypeEndpoint: post.postTypeEndpoint,
            title: postContent.title || post.title,
            content: postContent.content || '',
            excerpt: postContent.excerpt || '',
            link: post.link,
            slug: post.slug,
            status: post.status,
            acfFields,
            metaFields,
            taxonomies,
          });

          totalScanned++;
          
          if (j % 10 === 0) {
            onProgress?.(`Processed ${totalScanned} posts...`, progress);
          }
        } catch (error) {
          logger.error(`Error processing post ${post.id}:`, error);
          // Continue with next post
        }
      }
    }

    onProgress?.('Scan complete!', 100);

    return {
      success: true,
      posts: scannedPosts,
      totalPosts: scannedPosts.length,
      postTypes: postTypesToScan,
    };
  } catch (error) {
    return {
      success: false,
      posts: [],
      totalPosts: 0,
      postTypes: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Extract company data from scanned posts
 */
export function extractCompanyDataFromPosts(posts: ScannedPost[]): {
  urls: Map<string, number>;
  emails: Map<string, number>;
  phones: Map<string, number>;
  businessNames: Map<string, number>;
  colors: Map<string, number>;
  addresses: Map<string, number>;
} {
  const urls = new Map<string, number>();
  const emails = new Map<string, number>();
  const phones = new Map<string, number>();
  const businessNames = new Map<string, number>();
  const colors = new Map<string, number>();
  const addresses = new Map<string, number>();

  for (const post of posts) {
    const data = extractCompanyData(post);
    
    for (const url of data.urls) {
      urls.set(url, (urls.get(url) || 0) + 1);
    }
    for (const email of data.emails) {
      emails.set(email, (emails.get(email) || 0) + 1);
    }
    for (const phone of data.phones) {
      phones.set(phone, (phones.get(phone) || 0) + 1);
    }
    for (const name of data.businessNames) {
      businessNames.set(name, (businessNames.get(name) || 0) + 1);
    }
    for (const color of data.colors) {
      colors.set(color, (colors.get(color) || 0) + 1);
    }
    for (const address of data.addresses) {
      addresses.set(address, (addresses.get(address) || 0) + 1);
    }
  }

  return { urls, emails, phones, businessNames, colors, addresses };
}
