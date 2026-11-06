/**
 * NAP (Name, Address, Phone) Extractor
 * Finds contact pages and location sitemaps via WordPress API, then uses AI to extract locations
 */

import type { WordPressSite, NAPInfo, Location } from '@/components/integrations/types';
import { parseSitemap, getWordPressPostContent, getSitePageInventory } from './wordpress-api';
import { streamChatCompletion } from './api';
import { htmlToMarkdown } from './wordpress-converter';
import { getResearchModel } from './optimization-settings-storage';

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
async function findLocationSitemap(
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
        console.log(
          `[NAP Extractor] From entitySitemapUrl: ${Math.min(entityParse.urls.length, allUrls.length)} URL(s) (capped at ${NAP_SITEMAP_URL_CAP})`
        );
      }
    } catch (error) {
      console.warn('[NAP Extractor] Error parsing entitySitemapUrl:', site.entitySitemapUrl, error);
    }
  }

  if (allUrls.length >= NAP_SITEMAP_URL_CAP) {
    return allUrls.slice(0, NAP_SITEMAP_URL_CAP);
  }

  if (!site.sitemaps?.mainSitemapUrl) {
    if (allUrls.length === 0) {
      console.warn(
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
      console.log(
        `[NAP Extractor] NAP-relevant child sitemaps: ${napSitemaps.length} of ${parseResult.childSitemaps.length}`
      );

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
          console.warn(`[NAP Extractor] Error parsing child sitemap ${sitemapUrl}:`, error);
        }
      }
    }
  } catch (error) {
    console.warn('[NAP Extractor] Error checking main sitemap index:', error);
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
async function findContactPage(
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

  console.log(
    `[NAP Extractor] Contact-related pages found: ${foundPages.length}`,
    foundPages.map((p) => p.slug).join(', ') || '(none)'
  );

  return foundPages;
}

/**
 * Fetches page content from WordPress REST API by page ID
 */
async function fetchPageContentById(
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
    console.error(`[NAP Extractor] Error fetching page ${pageId}:`, error);
    return null;
  }
}

/**
 * Fetches page content from URL (for location sitemap URLs)
 */
async function fetchPageContentFromUrl(
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
    console.error(`[NAP Extractor] Error fetching page ${url}:`, error);
    return null;
  }
}

/**
 * Uses AI to intelligently extract locations from scraped content (token optimized)
 */
async function extractLocationsWithAI(
  scrapedPages: Array<{ title: string; content: string; url: string }>,
  apiKey: string,
  onProgress?: (message: string) => void,
  siteId?: string
): Promise<NAPInfo | null> {
  onProgress?.('🤖 AI analyzing pages to find all locations...');
  
  // Token optimization: Limit content per page and total content
  const maxContentPerPage = 2000; // Reduced from 3000
  const maxTotalContent = 15000; // Reduced from 30000
  
  // Combine all page content with limits
  let totalLength = 0;
  const combinedContent = scrapedPages.map((page, index) => {
    const pageContent = page.content.substring(0, maxContentPerPage);
    const pageText = `=== Page ${index + 1}: ${page.title} (${page.url}) ===\n${pageContent}`;
    
    if (totalLength + pageText.length > maxTotalContent) {
      return null; // Skip if we'd exceed limit
    }
    
    totalLength += pageText.length;
    return pageText;
  }).filter(Boolean).join('\n\n---\n\n');

  const systemPrompt = `You are a LOCAL CONTENT SPECIALIST and expert at extracting complete business location information (NAPE: Name, Address, Phone, Email) from website content. Your job is to find FULL, COMPLETE contact details for each location.

CRITICAL REQUIREMENTS - ACT LIKE A LOCAL CONTENT SPECIALIST:
1. Extract ALL locations found across pages - be thorough and comprehensive
2. For EACH location, extract COMPLETE details:
   - Full business name (location-specific if different, e.g., "Business Name - City Location")
   - Complete street address (street number, street name, suite/unit if present)
   - City name (full city name, not abbreviated)
   - State (2-letter abbreviation: FL, CA, TX, etc.)
   - ZIP code (5-digit or 9-digit format)
   - Phone number (location-specific if available, otherwise general)
   - Email address (location-specific if available, otherwise use general business email)
3. EMAIL FALLBACK RULE: If a location doesn't have a specific email, use the general business email from the contact page or footer
4. Be thorough - look in:
   - Contact pages
   - Location pages
   - Footer sections
   - Header/contact bars
   - Service area pages
   - About pages
   - Any structured data (JSON-LD, microdata)
5. Mark primary/main location as isDefault: true
6. Deduplicate - same address = one location
7. DO NOT use "Not specified" or placeholder text - use empty strings "" or omit fields if data is truly not available
8. Return ONLY valid JSON

Format:
{
  "name": "Business name",
  "address": "Primary address",
  "phone": "Primary phone",
  "email": "Primary email",
  "locations": [
    {
      "name": "Location name",
      "address": "Street address",
      "city": "City",
      "state": "ST",
      "zip": "12345",
      "phone": "Phone",
      "email": "Email address",
      "isDefault": true/false
    }
  ]
}`;

  const userPrompt = `As a LOCAL CONTENT SPECIALIST, analyze this website content and extract ALL business locations with COMPLETE NAPE (Name, Address, Phone, Email) information.

Be thorough and extract:
- Full business names for each location (include location identifier if present)
- Complete street addresses (not just city/state)
- Full city names
- State abbreviations
- ZIP codes
- Phone numbers (location-specific preferred)
- Email addresses (location-specific if available, otherwise use general business email)

Content to analyze:
${combinedContent}

Extract every location mentioned. For locations without specific emails, use the general business email found in contact sections or footer. Return complete JSON with all location details.`;

  try {
    let aiResponse = '';
    await streamChatCompletion({
      apiKey,
        model: getResearchModel(siteId),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      maxTokens: 3000, // Reduced from 4000
      topP: 0.9,
      onContentChunk: (chunk) => {
        aiResponse += chunk;
      },
    });

    if (!aiResponse || aiResponse.trim().length === 0) {
      return null;
    }

    // Extract JSON from response
    let jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      jsonMatch = aiResponse.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        jsonMatch = [jsonMatch[0], jsonMatch[1]];
      }
    }

    if (jsonMatch) {
      const jsonText = jsonMatch[1] || jsonMatch[0];
      interface RawNapLocation {
        name?: string;
        address?: string;
        streetAddress?: string;
        city?: string;
        addressLocality?: string;
        state?: string;
        addressRegion?: string;
        zip?: string;
        postalCode?: string;
        zipCode?: string;
        phone?: string;
        telephone?: string;
        email?: string;
        emailAddress?: string;
        isDefault?: boolean;
      }
      const parsed = JSON.parse(jsonText) as {
        name?: string;
        address?: string;
        phone?: string;
        email?: string;
        locations?: RawNapLocation[];
      };

      // Clean up "Not specified" values
      const cleanValue = (val: string | undefined): string | undefined => {
        if (!val || val === 'Not specified' || val === 'not specified' || val.trim() === '') {
          return undefined;
        }
        return val.trim();
      };
      
      const napInfo: NAPInfo = {
        name: cleanValue(parsed.name),
        address: cleanValue(parsed.address),
        phone: cleanValue(parsed.phone),
        email: cleanValue(parsed.email),
      };

      // Process locations
      if (parsed.locations && Array.isArray(parsed.locations) && parsed.locations.length > 0) {
        const locations: Location[] = parsed.locations.map((loc, index: number) => {
          // Clean up "Not specified" values
          const cleanValue = (val: string | undefined): string => {
            if (!val || val === 'Not specified' || val === 'not specified' || val.trim() === '') {
              return '';
            }
            return val.trim();
          };
          
          // Email fallback: use location-specific email, then general business email
          const locationEmail = cleanValue(loc.email || loc.emailAddress);
          const generalEmail = cleanValue(napInfo.email);
          const finalEmail = locationEmail || generalEmail || undefined;
          
          // Phone fallback: use location-specific phone, then general business phone
          const locationPhone = cleanValue(loc.phone || loc.telephone);
          const generalPhone = cleanValue(napInfo.phone);
          const finalPhone = locationPhone || generalPhone || '';
          
          // Name: prefer location-specific name, fallback to business name with location identifier
          let locationName = cleanValue(loc.name);
          if (!locationName && napInfo.name) {
            // Try to create location-specific name from city
            const city = cleanValue(loc.city || loc.addressLocality);
            if (city) {
              locationName = `${napInfo.name} - ${city}`;
            } else {
              locationName = napInfo.name;
            }
          }
          if (!locationName) {
            locationName = `Location ${index + 1}`;
          }
          
          return {
            id: `loc-${Date.now()}-${index}`,
            name: locationName,
            address: cleanValue(loc.address || loc.streetAddress),
            city: cleanValue(loc.city || loc.addressLocality),
            state: cleanValue(loc.state || loc.addressRegion),
            zip: cleanValue(loc.zip || loc.postalCode || loc.zipCode),
            phone: finalPhone,
            email: finalEmail,
            isDefault: loc.isDefault !== undefined ? loc.isDefault : index === 0,
          };
        });
        
        napInfo.locations = locations;
      } else if (napInfo.name || napInfo.address || napInfo.phone) {
        // Create single location from top-level fields
        // Parse address more carefully
        const fullAddress = napInfo.address || '';
        const addressParts = fullAddress.split(',').map(s => s.trim());
        
        // Try to extract street address (everything before city/state/zip)
        let streetAddress = '';
        let city = '';
        let state = '';
        let zip = '';
        
        if (addressParts.length >= 2) {
          // Last part is usually state/zip
          const lastPart = addressParts[addressParts.length - 1];
          const stateZipMatch = lastPart.match(/([A-Z]{2})\s*(\d{5}(?:-\d{4})?)/);
          if (stateZipMatch) {
            state = stateZipMatch[1];
            zip = stateZipMatch[2];
            // Second to last is usually city
            if (addressParts.length >= 3) {
              city = addressParts[addressParts.length - 2];
              streetAddress = addressParts.slice(0, -2).join(', ');
            } else {
              city = '';
              streetAddress = addressParts[0];
            }
          } else {
            // No state/zip pattern, assume last is city
            city = addressParts[addressParts.length - 1];
            streetAddress = addressParts.slice(0, -1).join(', ');
          }
        } else if (addressParts.length === 1) {
          streetAddress = addressParts[0];
        }
        
        napInfo.locations = [{
          id: `loc-${Date.now()}`,
          name: napInfo.name || 'Location',
          address: streetAddress || fullAddress,
          city: city || '',
          state: state || '',
          zip: zip || '',
          phone: napInfo.phone || '',
          email: napInfo.email || undefined,
          isDefault: true,
        }];
      }

      // Ensure at least one location is marked as default
      if (napInfo.locations && napInfo.locations.length > 0) {
        const hasDefault = napInfo.locations.some(loc => loc.isDefault);
        if (!hasDefault) {
          napInfo.locations[0].isDefault = true;
        }
      }

      return napInfo;
    }

    return null;
  } catch (error) {
    console.error('[NAP Extractor] AI extraction error:', error);
    return null;
  }
}

/**
 * Main function to extract NAP information
 */
export async function extractNAPFromSite(
  site: WordPressSite,
  apiKey: string,
  onProgress?: (progress: NAPExtractionProgress) => void
): Promise<NAPExtractionResult> {
  console.log('[NAP Extractor] Starting NAP extraction for:', site.name || site.siteUrl);

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
      console.warn('[NAP Extractor] No sources for extraction:', {
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

    console.log('[NAP Extractor] Extraction completed:', napInfo);

    return {
      success: true,
      napInfo,
    };
  } catch (error) {
    console.error('[NAP Extractor] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during NAP extraction',
    };
  }
}
