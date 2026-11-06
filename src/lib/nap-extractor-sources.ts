import { logger } from "@/lib/logger";
import type { WordPressSite, NAPInfo } from '@/components/integrations/types';
import { parseSitemap, getWordPressPostContent, getSitePageInventory } from './wordpress-api';
import { htmlToMarkdown } from './wordpress-converter';

export interface NAPExtractionResult {
  success: boolean;
  napInfo?: NAPInfo;
  error?: string;
}

export interface NAPExtractionProgress {
  step: string;
  progress: number;
  message?: string;
}

/** Max URLs sampled from sitemaps for NAP AI (token/cost control). */
const NAP_SITEMAP_URL_CAP = 22;

function isNapRelevantChildSitemap(sitemapUrl: string): boolean {
  const u = sitemapUrl.toLowerCase();
  return (
    u.includes('location') ||
    u.includes('locations') ||
    u.includes('service-area') ||
    u.includes('service_area') ||
    u.includes('service-areas')
  );
}

/**
 * Checks if a page exists by slug using WordPress API
 */
async function checkPageExists(
  site: WordPressSite,
  slug: string
): Promise<{ id: number; slug: string; title: string; link: string } | null> {
  try {
    const result = await getWordPressPostContent(
      site.siteUrl,
      site.username,
      site.appPassword,
      undefined,
      [slug],
      undefined,
      { restEndpointHints: ['pages'] },
    );
    const page = result.posts?.[0];
    if (page) {
      return {
        id: page.id,
        slug: page.slug,
        title: page.title || '',
        link: page.link || `${site.siteUrl.replace(/\/$/, '')}/${page.slug}`,
      };
    }

    return null;
  } catch (error) {
    return null;
  }
}

function pushUniqueUrls(
  bucket: string[],
  seen: Set<string>,
  urls: string[],
  cap: number
): void {
  for (const u of urls) {
    if (bucket.length >= cap) return;
    if (!u || seen.has(u)) continue;
    seen.add(u);
    bucket.push(u);
  }
}

/**
 * URLs from NAP-relevant sitemaps (location, service-area, entity sitemap) for page content fetch.
 */
export async function findLocationSitemap(
  site: WordPressSite,
  onProgress?: (message: string) => void
): Promise<string[]> {
  const allUrls: string[] = [];
  const seen = new Set<string>();

  if (site.entitySitemapUrl?.trim()) {
    try {
      onProgress?.('🔍 Parsing entity / service-area sitemap for NAP...');
      const entityParse = await parseSitemap(
        site.siteUrl,
        site.entitySitemapUrl.trim(),
        site.username,
        site.appPassword
      );
      if (entityParse.urls?.length) {
        pushUniqueUrls(allUrls, seen, entityParse.urls, NAP_SITEMAP_URL_CAP);
      }
    } catch (error) {
      logger.warn('[NAP Extractor] Error parsing entitySitemapUrl:', site.entitySitemapUrl, error);
    }
  }

  if (allUrls.length >= NAP_SITEMAP_URL_CAP) {
    return allUrls.slice(0, NAP_SITEMAP_URL_CAP);
  }

  if (!site.sitemaps?.mainSitemapUrl) {
    if (allUrls.length === 0) {
      logger.warn(
        '[NAP Extractor] No sitemap URLs for NAP: missing sitemaps.mainSitemapUrl and no usable entitySitemapUrl.'
      );
    }
    return allUrls.slice(0, NAP_SITEMAP_URL_CAP);
  }

  try {
    onProgress?.('🔍 Checking child sitemaps (location / service-area)...');

    const parseResult = await parseSitemap(
      site.siteUrl,
      site.sitemaps.mainSitemapUrl,
      site.username,
      site.appPassword
    );

    if (parseResult.childSitemaps?.length) {
      const napSitemaps = parseResult.childSitemaps.filter(isNapRelevantChildSitemap);

      for (const sitemapUrl of napSitemaps) {
        if (allUrls.length >= NAP_SITEMAP_URL_CAP) break;
        try {
          const childParse = await parseSitemap(
            site.siteUrl,
            sitemapUrl,
            site.username,
            site.appPassword
          );
          if (childParse.urls?.length) {
            pushUniqueUrls(allUrls, seen, childParse.urls, NAP_SITEMAP_URL_CAP);
          }
        } catch (error) {
          logger.warn(`[NAP Extractor] Error parsing child sitemap ${sitemapUrl}:`, error);
        }
      }
    }
  } catch (error) {
    logger.warn('[NAP Extractor] Error checking main sitemap index:', error);
  }

  return allUrls.slice(0, NAP_SITEMAP_URL_CAP);
}

const CONTACT_PAGE_SLUGS = [
  'home',
  'front-page',
  'contact',
  'contact-us',
  'contact_us',
  'locations',
  'location',
  'about',
  'about-us',
  'find-us',
  'store-locator',
  'get-in-touch',
] as const;

function scorePageForContactIntent(slug: string, title: string): number {
  const s = `${slug} ${title}`.toLowerCase();
  let score = 0;
  if (/\bcontact\b/.test(s)) score += 4;
  if (/\blocation(s)?\b/.test(s)) score += 3;
  if (/\babout\b/.test(s)) score += 2;
  if (/\bfind\b/.test(s) || /\bstore\b/.test(s)) score += 1;
  return score;
}

async function searchPublishedPages(
  site: WordPressSite,
  search: string,
  perPage: number
): Promise<Array<{ id: number; slug: string; title: string; link: string }>> {
  try {
    const inventory = await getSitePageInventory(site.siteUrl, site.username, site.appPassword);
    const needle = search.toLowerCase();
    return (inventory.posts ?? [])
      .filter((row) =>
        (row.fields?.title || '').toLowerCase().includes(needle) ||
        (row.slug || '').toLowerCase().includes(needle))
      .slice(0, perPage)
      .map((row) => ({
        id: row.id ?? 0,
        slug: row.slug || '',
        title: row.fields?.title || '',
        link: row.url || `${site.siteUrl.replace(/\/$/, '')}/${row.slug || ''}`,
      }));
  } catch {
    return [];
  }
}

/**
 * Finds contact / location / about pages via WordPress REST (slugs + search).
 */
export async function findContactPage(
  site: WordPressSite,
  onProgress?: (message: string) => void
): Promise<Array<{ id: number; slug: string; title: string; link: string }>> {
  const foundPages: Array<{ id: number; slug: string; title: string; link: string }> = [];
  const seenIds = new Set<number>();

  const add = (p: { id: number; slug: string; title: string; link: string } | null) => {
    if (!p || seenIds.has(p.id)) return;
    seenIds.add(p.id);
    foundPages.push(p);
  };

  onProgress?.('🔍 Checking for contact / location pages...');

  for (const slug of CONTACT_PAGE_SLUGS) {
    const page = await checkPageExists(site, slug);
    add(page);
  }

  const contactSearch = await searchPublishedPages(site, 'contact', 5);
  const rankedContact = [...contactSearch].sort(
    (a, b) => scorePageForContactIntent(b.slug, b.title) - scorePageForContactIntent(a.slug, a.title)
  );
  for (const p of rankedContact.slice(0, 3)) add(p);

  const locationSearch = await searchPublishedPages(site, 'location', 5);
  const rankedLoc = [...locationSearch].sort(
    (a, b) => scorePageForContactIntent(b.slug, b.title) - scorePageForContactIntent(a.slug, a.title)
  );
  for (const p of rankedLoc.slice(0, 2)) add(p);


  return foundPages;
}

/**
 * Fetches page content from WordPress REST API by page ID
 */
export async function fetchPageContentById(
  site: WordPressSite,
  pageId: number
): Promise<{ title: string; content: string; url: string } | null> {
  try {
    const result = await getWordPressPostContent(
      site.siteUrl,
      site.username,
      site.appPassword,
      [pageId],
    );
    const data = result.posts?.[0];
    if (data) {
      const contentText = htmlToMarkdown(data.content || '').trim();
      const excerptText = htmlToMarkdown(data.excerpt || '').trim();
      const fullContent = excerptText ? excerptText + '\n\n' + contentText : contentText;

      return {
        title: data.title || '',
        content: fullContent,
        url: data.link || `${site.siteUrl.replace(/\/$/, '')}/${data.slug || ''}`,
      };
    }

    return null;
  } catch (error) {
    logger.error(`[NAP Extractor] Error fetching page ${pageId}:`, error);
    return null;
  }
}

/**
 * Fetches page content from URL (for location sitemap URLs)
 */
/**
 * Fetches page content from URL (for location sitemap URLs)
 */
export async function fetchPageContentFromUrl(
  site: WordPressSite,
  url: string
): Promise<{ title: string; content: string; url: string } | null> {
  try {
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
    const slug = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : null;
    
    if (!slug) {
      return null;
    }

    const restHints = pathSegments.length > 1
      ? Array.from(new Set([pathSegments[0], pathSegments[0].replace(/-/g, '_'), 'pages', 'posts']))
      : ['pages', 'posts'];

    const result = await getWordPressPostContent(
      site.siteUrl,
      site.username,
      site.appPassword,
      undefined,
      [slug],
      undefined,
      { restEndpointHints: restHints },
    );
    const contentData = result.posts?.[0];
    if (contentData) {
      const contentText = htmlToMarkdown(contentData.content || '').trim();
      const excerptText = htmlToMarkdown(contentData.excerpt || '').trim();
      const fullContent = excerptText ? excerptText + '\n\n' + contentText : contentText;

      return {
        title: contentData.title || '',
        content: fullContent,
        url,
      };
    }

    return null;
  } catch (error) {
    logger.error(`[NAP Extractor] Error fetching page ${url}:`, error);
    return null;
  }
}
