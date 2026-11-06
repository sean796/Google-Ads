/**
 * NAP (Name, Address, Phone) Extractor
 * Finds contact pages and location sitemaps via WordPress API, then uses AI to extract locations
 */

import { logger } from "@/lib/logger";
import type { WordPressSite } from '@/components/integrations/types';
import {
  fetchPageContentById,
  fetchPageContentFromUrl,
  findContactPage,
  findLocationSitemap,
} from './nap-extractor-sources';
import type { NAPExtractionProgress, NAPExtractionResult } from './nap-extractor-sources';
import { extractLocationsWithAI } from './nap-extractor-ai';

export type { NAPExtractionProgress, NAPExtractionResult } from './nap-extractor-sources';

/**
 * Main function to extract NAP information
 */
export async function extractNAPFromSite(
  site: WordPressSite,
  apiKey: string,
  onProgress?: (progress: NAPExtractionProgress) => void
): Promise<NAPExtractionResult> {

  try {
    onProgress?.({ step: 'finding_sources', progress: 0, message: 'Finding contact page and location sitemap...' });

    // Step 1: Find contact page (check if exists first)
    const contactPages = await findContactPage(site, (message) => {
      onProgress?.({ step: 'finding_sources', progress: 10, message });
    });

    // Step 2: Find location sitemap if it exists
    const locationUrls = await findLocationSitemap(site, (message) => {
      onProgress?.({ step: 'finding_sources', progress: 20, message });
    });

    if (contactPages.length === 0 && locationUrls.length === 0) {
      logger.warn('[NAP Extractor] No sources for extraction:', {
        hasMainSitemapUrl: Boolean(site.sitemaps?.mainSitemapUrl),
        hasEntitySitemapUrl: Boolean(site.entitySitemapUrl?.trim()),
        hint: 'Run Detect sitemaps in NEO Pulse, or ensure a published Contact page exists.',
      });
      return {
        success: false,
        error:
          'No contact/location pages or NAP-relevant sitemap URLs found. Use Detect sitemaps (for service-area / location sitemaps) or publish a Contact page.',
      };
    }

    onProgress?.({ step: 'scraping_pages', progress: 30, message: `Found ${contactPages.length} contact page(s) and ${locationUrls.length} location URL(s). Fetching content...` });

    // Step 3: Fetch content from contact pages
    const scrapedPages: Array<{ title: string; content: string; url: string }> = [];
    
    for (let i = 0; i < contactPages.length; i++) {
      const page = contactPages[i];
      const progress = 30 + Math.floor((i / (contactPages.length + locationUrls.length)) * 50);
      
      onProgress?.({ 
        step: 'scraping_pages', 
        progress, 
        message: `Fetching contact page ${i + 1}/${contactPages.length}: ${page.title}...` 
      });
      
      const pageContent = await fetchPageContentById(site, page.id);
      if (pageContent && pageContent.content) {
        scrapedPages.push(pageContent);
      }
    }

    // Step 4: Fetch content from location sitemap URLs
    for (let i = 0; i < locationUrls.length; i++) {
      const url = locationUrls[i];
      const progress = 30 + Math.floor(((contactPages.length + i) / (contactPages.length + locationUrls.length)) * 50);
      
      onProgress?.({ 
        step: 'scraping_pages', 
        progress, 
        message: `Fetching location page ${i + 1}/${locationUrls.length}...` 
      });
      
      const pageContent = await fetchPageContentFromUrl(site, url);
      if (pageContent && pageContent.content) {
        scrapedPages.push(pageContent);
      }
    }

    if (scrapedPages.length === 0) {
      return {
        success: false,
        error: 'Could not fetch content from any pages. Please check site connection.',
      };
    }

    onProgress?.({ step: 'ai_analysis', progress: 80, message: `Analyzing ${scrapedPages.length} page(s) with AI to extract locations...` });

    // Step 5: Use AI to extract locations (token optimized)
    const napInfo = await extractLocationsWithAI(scrapedPages, apiKey, (message) => {
      onProgress?.({ step: 'ai_analysis', progress: 85, message });
    }, site.id);

    if (!napInfo || !napInfo.locations || napInfo.locations.length === 0) {
      return {
        success: false,
        error: 'AI could not extract location information from pages.',
      };
    }

    onProgress?.({ step: 'complete', progress: 100, message: `Successfully extracted ${napInfo.locations.length} location(s)` });


    return {
      success: true,
      napInfo,
    };
  } catch (error) {
    logger.error('[NAP Extractor] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during NAP extraction',
    };
  }
}
