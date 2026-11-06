/**
 * WordPress Page Analyzer
 * Analyzes existing WordPress pages to extract patterns for title, URL, meta, and content style
 */

import { parseSitemap } from './wordpress-api';
import type { WordPressSite } from '@/components/integrations/types';
import { loadApiKey } from './api';
import { openRouterWebAppHeaders } from "@/lib/openrouter-attribution";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";

export interface WPPageAnalysis {
  titlePattern?: string; // Extracted title template pattern
  urlFormula?: string; // URL structure formula (e.g., "/service-area/[location-slug]")
  metaDescriptionPattern?: string; // Meta description pattern
  contentStyle: {
    averageLength: number;
    h2Patterns: string[]; // Common H2 section patterns
    structure: string; // Content structure description
  };
  examples: Array<{
    title: string;
    url: string;
    metaDescription?: string;
    contentLength: number;
  }>;
  // For service areas only
  entityPatterns?: {
    locationExtractionPattern?: string;
    commonLocations?: string[];
  };
}

/**
 * Analyzes WordPress pages from a sitemap to extract patterns
 * OPTIMIZED: Only fetches metadata (title, excerpt, URL) - no full content for faster analysis
 */
export async function analyzeWordPressPages(
  site: WordPressSite,
  sitemapUrl: string,
  postType: 'post' | 'service-area',
  sampleSize: number = 20,
  onProgress?: (message: string, progress?: number) => void
): Promise<WPPageAnalysis> {
  console.log(`[WP Page Analyzer] Analyzing ${postType} pages from ${sitemapUrl}...`);
  onProgress?.('📋 Parsing sitemap XML...', 5);

  // Parse sitemap to get URLs
  const parseResult = await parseSitemap(
    site.siteUrl,
    sitemapUrl,
    site.username || '',
    site.appPassword || ''
  );

  if (!parseResult.urls || parseResult.urls.length === 0) {
    throw new Error(`No URLs found in sitemap: ${sitemapUrl}`);
  }

  // Sample URLs (take first N or random sample)
  const sampleUrls = parseResult.urls.slice(0, Math.min(sampleSize, parseResult.urls.length));
  console.log(`[WP Page Analyzer] Analyzing ${sampleUrls.length} sample URLs`);
  onProgress?.(`🔍 Found ${sampleUrls.length} URLs to analyze`, 10);

  // Extract slugs from URLs
  const slugs: string[] = [];
  for (let i = 0; i < sampleUrls.length; i++) {
    const url = sampleUrls[i];
    try {
      const urlObj = new URL(url);
      const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
      
      if (postType === 'service-area') {
        // For service areas, extract location slug (after service-area segment)
        const serviceAreaIndex = pathSegments.findIndex(seg => 
          seg.toLowerCase().includes('service-area') || seg.toLowerCase().includes('service_area')
        );
        if (serviceAreaIndex >= 0 && serviceAreaIndex < pathSegments.length - 1) {
          slugs.push(pathSegments.slice(serviceAreaIndex + 1).join('/'));
        } else if (pathSegments.length > 0) {
          slugs.push(pathSegments[pathSegments.length - 1]);
        }
      } else {
        // For posts, extract last segment
        if (pathSegments.length > 0) {
          slugs.push(pathSegments[pathSegments.length - 1]);
        }
      }
      onProgress?.(`⚡ Extracted slug ${i + 1}/${sampleUrls.length}: ${pathSegments[pathSegments.length - 1] || 'homepage'}`, 10 + (i / sampleUrls.length) * 10);
    } catch (error) {
      console.warn(`[WP Page Analyzer] Invalid URL: ${url}`, error);
    }
  }

  // OPTIMIZED: Try to use cache first, then fallback to API
  onProgress?.(`📡 Fetching metadata for ${slugs.length} posts (metadata only - fast!)...`, 25);
  
  let posts: Array<{ title: string; link: string; excerpt: string }> = [];
  
  // Try to use cache if available
  try {
    const { getSiteCache, filterSiteCache } = await import('./wordpress-site-cache');
    const cache = getSiteCache(site.id);
    
    if (cache && cache.posts.length > 0) {
      console.log(`[WP Page Analyzer] Using cache with ${cache.posts.length} posts`);
      onProgress?.(`📡 Using cached posts (${cache.posts.length} available)...`, 25);
      
      // Filter cache by post type if specified
      let cachePosts = cache.posts;
      if (postType === 'service-area') {
        cachePosts = filterSiteCache(site.id, p => p.postType === 'service-area' || p.link.toLowerCase().includes('service-area') || p.link.toLowerCase().includes('service_area'));
      } else {
        cachePosts = filterSiteCache(site.id, p => p.postType === 'post' || !p.postType);
      }
      
      // Match cached posts to our sample URLs
      const matchedPosts: Array<{ title: string; link: string; excerpt: string }> = [];
      const processedSlugs = new Set<string>();
      
      for (const sampleUrl of sampleUrls) {
        try {
          const urlObj = new URL(sampleUrl);
          const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
          const targetSlug = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : '';
          
          // Find matching post in cache
          const matchedPost = cachePosts.find(p => {
            try {
              const postUrlObj = new URL(p.link);
              const postPathSegments = postUrlObj.pathname.split('/').filter(s => s.length > 0);
              const postSlug = postPathSegments.length > 0 ? postPathSegments[postPathSegments.length - 1] : '';
              return postSlug === targetSlug || p.link.toLowerCase() === sampleUrl.toLowerCase();
            } catch {
              return false;
            }
          });
          
          if (matchedPost && !processedSlugs.has(targetSlug)) {
            matchedPosts.push({
              title: matchedPost.title,
              link: matchedPost.link,
              excerpt: matchedPost.excerpt || ''
            });
            processedSlugs.add(targetSlug);
            onProgress?.(`✅ Matched ${matchedPosts.length}/${sampleUrls.length}: "${matchedPost.title.substring(0, 40)}..."`, 30 + (matchedPosts.length / sampleUrls.length) * 20);
          }
        } catch (error) {
          console.warn(`[WP Page Analyzer] Error matching URL ${sampleUrl}:`, error);
        }
      }
      
      // If we got matches, use them; otherwise use first N posts from cache
      if (matchedPosts.length > 0) {
        posts = matchedPosts;
      } else {
        posts = cachePosts.slice(0, sampleSize).map(p => ({
          title: p.title,
          link: p.link,
          excerpt: p.excerpt || ''
        }));
      }
      
      console.log(`[WP Page Analyzer] Using ${posts.length} posts from cache for metadata analysis`);
    } else {
      throw new Error('Cache not available, falling back to API');
    }
  } catch (cacheError) {
    console.log(`[WP Page Analyzer] Cache not available or error: ${cacheError}, falling back to API`);
    
    // Fallback to API
    const { getPublishedPosts } = await import('./wordpress-api');
    const publishedResult = await getPublishedPosts(
      site.siteUrl,
      site.username || '',
      site.appPassword || '',
      sampleSize * 2, // Fetch more than needed to match
      0
    );

    if (!publishedResult.posts || publishedResult.posts.length === 0) {
      throw new Error(`No posts found for ${postType} pages`);
    }

    // Match published posts to our slugs by URL
    const matchedPosts: Array<{ title: string; link: string; excerpt: string }> = [];
    const processedSlugs = new Set<string>();
    
    for (let i = 0; i < publishedResult.posts.length && matchedPosts.length < sampleUrls.length; i++) {
      const post = publishedResult.posts[i];
      const postUrl = new URL(post.link);
      const postSlug = postUrl.pathname.split('/').filter(s => s.length > 0).pop() || '';
      
      // Match by slug
      if (slugs.some(slug => slug === postSlug) && !processedSlugs.has(postSlug)) {
        matchedPosts.push({
          title: post.title,
          link: post.link,
          excerpt: post.excerpt || ''
        });
        processedSlugs.add(postSlug);
        onProgress?.(`✅ Matched ${matchedPosts.length}/${sampleUrls.length}: "${post.title.substring(0, 40)}..."`, 30 + (matchedPosts.length / sampleUrls.length) * 20);
      }
    }

    // If we didn't get enough matches, use what we have (it's metadata analysis, partial is OK)
    posts = matchedPosts.length > 0 ? matchedPosts : publishedResult.posts.slice(0, sampleSize).map(p => ({
      title: p.title,
      link: p.link,
      excerpt: p.excerpt || ''
    }));
  }

  console.log(`[WP Page Analyzer] Using ${posts.length} posts for metadata analysis (metadata only - no content fetched)`);
  onProgress?.(`📊 Analyzing ${posts.length} post metadata patterns...`, 55);

  // Analyze patterns (metadata only - no content analysis)
  const titles: string[] = [];
  const urls: string[] = [];
  const metaDescriptions: string[] = [];
  const locations: string[] = [];

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    titles.push(post.title);
    urls.push(post.link);

    // Extract meta description from excerpt (already metadata)
    if (post.excerpt) {
      const excerptText = post.excerpt.replace(/<[^>]+>/g, '').trim();
      if (excerptText && excerptText.length < 200) {
        metaDescriptions.push(excerptText);
      }
    }

    // For service areas, try to extract location from title
    if (postType === 'service-area') {
      const locationMatch = extractLocationFromTitle(post.title);
      if (locationMatch) {
        locations.push(locationMatch);
      }
    }
    
    onProgress?.(`🔬 Analyzing post ${i + 1}/${posts.length}: "${post.title.substring(0, 35)}..."`, 55 + (i / posts.length) * 15);
  }
  
  // Since we're not fetching content, set defaults for content style
  const contentLengths: number[] = [];
  const h2Patterns: string[] = [];

  // Extract URL formula
  let urlFormula: string | undefined;
  if (postType === 'service-area' && urls.length > 0) {
    const firstUrl = new URL(urls[0]);
    const pathSegments = firstUrl.pathname.split('/').filter(s => s.length > 0);
    const serviceAreaIndex = pathSegments.findIndex(seg => 
      seg.toLowerCase().includes('service-area') || seg.toLowerCase().includes('service_area')
    );
    if (serviceAreaIndex >= 0) {
      urlFormula = `/${pathSegments.slice(0, serviceAreaIndex + 1).join('/')}/[location-slug]`;
    }
  }

  // Use AI to analyze title patterns (if API key available)
  const openRouterApiKey = loadApiKey();
  let titlePattern: string | undefined;
  let metaDescriptionPattern: string | undefined;

  if (openRouterApiKey && titles.length > 0) {
    try {
      titlePattern = await analyzeTitlePattern(titles, postType, openRouterApiKey);
      if (metaDescriptions.length > 0) {
        metaDescriptionPattern = await analyzeMetaDescriptionPattern(metaDescriptions, openRouterApiKey);
      }
    } catch (error) {
      console.warn('[WP Page Analyzer] AI analysis failed, using fallback patterns', error);
    }
  }

  // Calculate averages (using defaults since we didn't fetch content)
  const averageLength = contentLengths.length > 0 
    ? contentLengths.reduce((sum, len) => sum + len, 0) / contentLengths.length 
    : 2000; // Default estimate

  // Get common H2 patterns (empty since we didn't fetch content)
  const commonH2Patterns: string[] = [];

  // Build examples (metadata only)
  const examples = posts.slice(0, 5).map(post => {
    // Handle excerpt that might be string or object with rendered property
    let excerptText = '';
    const excerptRaw: unknown = post.excerpt;
    if (typeof excerptRaw === 'string') {
      excerptText = excerptRaw;
    } else if (typeof excerptRaw === 'object' && excerptRaw && 'rendered' in excerptRaw) {
      excerptText = typeof (excerptRaw as { rendered?: unknown }).rendered === 'string' ? (excerptRaw as { rendered: string }).rendered : '';
    } else {
      excerptText = '';
    }
    return {
      title: post.title,
      url: post.link,
      metaDescription: excerptText ? excerptText.replace(/<[^>]+>/g, '').trim().substring(0, 160) : undefined,
      contentLength: averageLength // Use default since we didn't fetch content
    };
  });

  const analysis: WPPageAnalysis = {
    titlePattern,
    urlFormula,
    metaDescriptionPattern,
    contentStyle: {
      averageLength: Math.round(averageLength),
      h2Patterns: commonH2Patterns,
      structure: `Average ${Math.round(averageLength)} characters with ${commonH2Patterns.length} common H2 sections`
    },
    examples
  };

  // Add entity patterns for service areas
  if (postType === 'service-area' && locations.length > 0) {
    analysis.entityPatterns = {
      commonLocations: [...new Set(locations)].slice(0, 10)
    };
  }

  onProgress?.(`✅ Analysis complete! Found title pattern: ${titlePattern || 'none'}`, 95);
  console.log('[WP Page Analyzer] Analysis complete (metadata-only):', analysis);
  return analysis;
}

/**
 * Extracts location from service area title (simple pattern matching)
 */
function extractLocationFromTitle(title: string): string | null {
  // Common patterns: "Service Near City, State", "Service in City, State"
  const patterns = [
    /Near\s+([^,]+,\s*[A-Z]{2})/i,
    /in\s+([^,]+,\s*[A-Z]{2})/i,
    /([^,]+,\s*[A-Z]{2})$/,
    /Near\s+([^,]+)/i,
    /in\s+([^,]+)/i
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Uses AI to analyze title patterns and extract a template
 */
async function analyzeTitlePattern(
  titles: string[],
  postType: 'post' | 'service-area',
  apiKey: string
): Promise<string> {
  const systemPrompt = `You are an expert SEO analyst. Analyze the provided titles and extract a common pattern or template.

${postType === 'service-area' 
  ? 'For service area pages, identify patterns like "[Service] Near [Location]" or "[Service] in [Location]"' 
  : 'For blog posts, identify common title structures, keywords, or formatting patterns.'}

Return ONLY the pattern/template in plain text. Use placeholders like [Location] or [Keyword] where values vary.

Example output: "[Service] Near [Location]" or "How to [Keyword]: Complete Guide"`;

  const userPrompt = `Analyze these ${postType} titles and extract the common pattern:

${titles.slice(0, 10).map((t, i) => `${i + 1}. ${t}`).join('\n')}

What is the common pattern or template?`;

  try {
    const { getResearchModel } = await import("./optimization-settings-storage");
    const researchModel = getResearchModel();
    const response = await postOpenRouterAppChatFetch( {
      method: "POST",
      headers: openRouterWebAppHeaders(apiKey),
      body: JSON.stringify({
        model: researchModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI analysis failed: ${response.status}`);
    }

    const data = await response.json();
    const pattern = data.choices?.[0]?.message?.content?.trim() || '';
    return pattern.replace(/["']/g, '').trim();
  } catch (error) {
    console.error('[WP Page Analyzer] Error analyzing title pattern:', error);
    return '';
  }
}

/**
 * Uses AI to analyze meta description patterns
 */
async function analyzeMetaDescriptionPattern(
  metaDescriptions: string[],
  apiKey: string
): Promise<string> {
  const systemPrompt = `You are an expert SEO analyst. Analyze the provided meta descriptions and extract a common pattern or template.

Return ONLY the pattern/template in plain text. Use placeholders like [Location] or [Keyword] where values vary.

Example output: "Professional [Service] in [Location]. [Description]"`;

  const userPrompt = `Analyze these meta descriptions and extract the common pattern:

${metaDescriptions.slice(0, 10).map((m, i) => `${i + 1}. ${m}`).join('\n')}

What is the common pattern or template?`;

  try {
    const { getResearchModel } = await import("./optimization-settings-storage");
    const researchModel = getResearchModel();
    const response = await postOpenRouterAppChatFetch( {
      method: "POST",
      headers: openRouterWebAppHeaders(apiKey),
      body: JSON.stringify({
        model: researchModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI analysis failed: ${response.status}`);
    }

    const data = await response.json();
    const pattern = data.choices?.[0]?.message?.content?.trim() || '';
    return pattern.replace(/["']/g, '').trim();
  } catch (error) {
    console.error('[WP Page Analyzer] Error analyzing meta description pattern:', error);
    return '';
  }
}

