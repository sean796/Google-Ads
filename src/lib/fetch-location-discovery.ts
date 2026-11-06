/**
 * Server discovers JSON-LD addresses + location-style subpage links across homepage and common paths (/locations/, etc.).
 */

import { BACKEND_API_BASE } from '@/lib/wordpress-api/connection';
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export interface LocationDiscoveryAddress {
  label: string;
  name: string | null;
}

export interface LocationDiscoveryPagePath {
  path: string;
  href: string;
}

export interface LocationDiscoveryResult {
  addresses: LocationDiscoveryAddress[];
  pagePaths: LocationDiscoveryPagePath[];
  pagesFetched: string[];
  primarySuggestion: string | null;
  /** JSON-LD areaServed / serviceArea labels when no PostalAddress street line */
  areaLabels: string[];
  /** Best label for “service area” radius when there is no street */
  primaryAreaLabel: string | null;
}

export interface FetchLocationDiscoveryOptions {
  /**
   * Optional same-origin sitemap URL (e.g. a locations sitemap listing `/locations/…` pages).
   * Merges `<loc>` entries that match location-style paths only - not service-area CPT URLs. Prefer hub JSON-LD when unset.
   */
  entitySitemapUrl?: string | null;
}

/** Per page after POST /api/seo/enrich-location-page-addresses */
export interface EnrichedLocationPagePath {
  path: string;
  href: string;
  /** Non-null when JSON-LD or research model found a street address */
  address: string | null;
}

export interface EnrichLocationPageAddressesOptions {
  apiKey: string;
  model: string;
}

/**
 * Fetches each location page on the server and resolves a physical address (JSON-LD first, then research model).
 */
export async function fetchEnrichLocationPageAddresses(
  siteUrl: string,
  pages: LocationDiscoveryPagePath[],
  options: EnrichLocationPageAddressesOptions
): Promise<EnrichedLocationPagePath[]> {
  const trimmed = siteUrl?.trim();
  if (!trimmed || !pages.length || !options.apiKey?.trim()) {
    return [];
  }
  const url = `${BACKEND_API_BASE}/api/seo/enrich-location-page-addresses`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({
        'Content-Type': 'application/json',
        'x-openrouter-api-key': options.apiKey.trim(),
      }),
      body: JSON.stringify({
        siteUrl: trimmed,
        pages: pages.map((p) => ({ path: p.path, href: p.href })),
        model: options.model,
      }),
    });
    if (!res.ok) {
      return [];
    }
    const data = (await res.json()) as { results?: EnrichedLocationPagePath[] };
    const results = Array.isArray(data.results) ? data.results : [];
    return results.map((r) => ({
      path: typeof r.path === 'string' ? r.path : '',
      href: typeof r.href === 'string' ? r.href : '',
      address: typeof r.address === 'string' && r.address.trim() ? r.address.trim() : null,
    }));
  } catch {
    return [];
  }
}

export async function fetchLocationDiscovery(
  siteUrl: string,
  options?: FetchLocationDiscoveryOptions
): Promise<LocationDiscoveryResult> {
  const trimmed = siteUrl?.trim();
  if (!trimmed) {
    return {
      addresses: [],
      pagePaths: [],
      pagesFetched: [],
      primarySuggestion: null,
      areaLabels: [],
      primaryAreaLabel: null,
    };
  }
  const entitySitemapUrl = options?.entitySitemapUrl?.trim();
  const url = `${BACKEND_API_BASE}/api/seo/discover-locations`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        siteUrl: trimmed,
        ...(entitySitemapUrl ? { entitySitemapUrl } : {}),
      }),
    });
    if (!res.ok) {
      return {
        addresses: [],
        pagePaths: [],
        pagesFetched: [],
        primarySuggestion: null,
        areaLabels: [],
        primaryAreaLabel: null,
      };
    }
    const data = (await res.json()) as LocationDiscoveryResult;
    return {
      addresses: Array.isArray(data.addresses) ? data.addresses : [],
      pagePaths: Array.isArray(data.pagePaths) ? data.pagePaths : [],
      pagesFetched: Array.isArray(data.pagesFetched) ? data.pagesFetched : [],
      primarySuggestion: typeof data.primarySuggestion === 'string' ? data.primarySuggestion : null,
      areaLabels: Array.isArray(data.areaLabels) ? data.areaLabels : [],
      primaryAreaLabel: typeof data.primaryAreaLabel === 'string' ? data.primaryAreaLabel : null,
    };
  } catch {
    return {
      addresses: [],
      pagePaths: [],
      pagesFetched: [],
      primarySuggestion: null,
      areaLabels: [],
      primaryAreaLabel: null,
    };
  }
}
