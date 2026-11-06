import { useCallback, useState } from "react";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export interface OverviewScrapeResult {
  title: string;
  metaDescription: string;
  pageHeading?: string;
}

interface UseOverviewScrapeResult {
  loading: boolean;
  error: string | null;
  scrapeMetaForUrl: (url: string) => Promise<OverviewScrapeResult | null>;
}

/**
 * Hook that talks to the backend /api/overview/fetch-page-meta route
 * to extract <title> and meta description for a given URL.
 */
export function useOverviewScrape(): UseOverviewScrapeResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrapeMetaForUrl = useCallback(async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return null;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BACKEND_API_BASE}/api/overview/fetch-page-meta`, {
        method: "POST",
        headers: neoPulseApiHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ url: trimmed }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Failed to scrape meta for URL. HTTP ${response.status}${
            text ? ` – ${text.substring(0, 200)}` : ""
          }`,
        );
      }

      const json = (await response.json()) as {
        title?: string;
        metaDescription?: string;
        pageHeading?: string;
      };

      return {
        title: json.title || "",
        metaDescription: json.metaDescription || "",
        pageHeading: json.pageHeading || "",
      };
    } catch (err) {
      const message = (err instanceof Error ? err.message : "") || "Failed to scrape meta for URL.";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    scrapeMetaForUrl,
  };
}

