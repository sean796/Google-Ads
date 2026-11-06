export const KEYWORD_CACHE_KEY = "keyword-research-cache";
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// Global kill switch: when true, NO DataForSEO / MCP keyword APIs will be called.
// All keyword research will use only the provided primary keyword and local heuristics.
export const DISABLE_DATAFORSEO = false;

/**
 * Clears all cached keyword data
 */
export function clearKeywordCache(): void {
  try {
    localStorage.removeItem(KEYWORD_CACHE_KEY);
  } catch (error) {
    console.error("Error clearing keyword cache:", error);
  }
}

interface CachedKeywordData {
  data: unknown;
  timestamp: number;
  keyword: string;
}

// Helper to get cached data
export function getCachedData<T>(keyword: string, cacheKey: string): T | null {
  try {
    if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
      return null;
    }
    
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;

    const cache: CachedKeywordData[] = JSON.parse(cached);
    const keywordLower = keyword.toLowerCase().trim();
    const entry = cache.find((c) => c.keyword && typeof c.keyword === 'string' && c.keyword.toLowerCase().trim() === keywordLower);

    if (!entry) return null;

    // Check if cache is expired
    if (Date.now() - entry.timestamp > CACHE_EXPIRY_MS) {
      return null;
    }

    return entry.data as T;
  } catch (e) {
    console.error("Error reading cache:", e);
    return null;
  }
}

// Helper to set cached data
export function setCachedData<T>(keyword: string, data: T, cacheKey: string): void {
  try {
    if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
      console.warn('[Keyword API] Invalid keyword for cache:', keyword);
      return;
    }
    
    const cached = localStorage.getItem(cacheKey);
    const cache: CachedKeywordData[] = cached ? JSON.parse(cached) : [];

    // Remove old entry if exists
    const keywordLower = keyword.toLowerCase().trim();
    const filtered = cache.filter((c) => !c.keyword || typeof c.keyword !== 'string' || c.keyword.toLowerCase().trim() !== keywordLower);

    // Add new entry
    filtered.push({
      keyword: keywordLower,
      data: data,
      timestamp: Date.now(),
    });

    // Keep only last 20 entries normally to prevent quota bloat
    const trimmed = filtered.slice(-20);
    try {
      localStorage.setItem(cacheKey, JSON.stringify(trimmed));
    } catch (quotaErr) {
      // Quota exceeded: prune aggressively to keep only the most recent items
      try {
        const compact = trimmed.slice(-5);
        localStorage.setItem(cacheKey, JSON.stringify(compact));
      } catch {
        try {
          // Keep only current entry if quota is still tight
          localStorage.setItem(cacheKey, JSON.stringify([filtered[filtered.length - 1]]));
        } catch {
          // If storage is completely full, remove the cache key so it does not block execution
          try {
            localStorage.removeItem(cacheKey);
          } catch {
            // Ignore
          }
        }
      }
    }
  } catch (e) {
    console.warn("[Keyword API] Cache write skipped (non-critical):", e);
  }
}
