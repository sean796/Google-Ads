import type { WordPressSite } from "@/components/integrations/types";
import type { PpcGscPageContext } from "@/lib/ppc/google-ads-types";
import {
  normalizePpcGoogleResearchSignals,
  type PpcGoogleResearchSignals,
} from "@/lib/ppc/ppc-google-research-signals";
import { resolvePpcSiteLanguageCode, resolvePpcSiteLocationName } from "@/lib/ppc/resolve-ppc-site-location";
import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { normalizeGoogleAdsCustomerId } from "@/lib/ads-reporting/ads-reporting-metrics";

function aggregateGscQueries(gscPages: PpcGscPageContext[]): Array<{ text: string; clicks: number; impressions: number }> {
  const byQuery = new Map<string, { text: string; clicks: number; impressions: number }>();
  for (const page of gscPages) {
    for (const q of page.queries) {
      const text = q.query.trim();
      if (!text) continue;
      const key = text.toLowerCase();
      const prev = byQuery.get(key);
      if (prev) {
        prev.clicks += q.clicks;
        prev.impressions += q.impressions;
      } else {
        byQuery.set(key, { text, clicks: q.clicks, impressions: q.impressions });
      }
    }
  }
  return [...byQuery.values()].sort((a, b) => b.impressions - a.impressions).slice(0, 30);
}

export async function loadPpcGoogleResearchSignals(options: {
  site: WordPressSite;
  focusKeyword: string;
  landingPageUrls: string[];
  gscPages: PpcGscPageContext[];
  signal?: AbortSignal;
}): Promise<PpcGoogleResearchSignals> {
  const focusKeyword = options.focusKeyword.trim();
  if (!focusKeyword) {
    throw new Error("Focus keyword is required for PPC research signals.");
  }

  const customerId = normalizeGoogleAdsCustomerId(options.site.googleAdsCustomerId ?? "");
  const gscQueries = aggregateGscQueries(options.gscPages);

  const res = await fetch(backendApiUrl("/google-ads/fetch-ppc-research-signals"), {
    method: "POST",
    credentials: "include",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      customerId: customerId || undefined,
      focusKeyword,
      landingPageUrls: options.landingPageUrls,
      locationName: resolvePpcSiteLocationName(options.site),
      languageCode: resolvePpcSiteLanguageCode(options.site),
      gscQueries,
    }),
    signal: options.signal,
  });

  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    signals?: unknown;
    error?: string;
  };

  if (!res.ok || data.success !== true || !data.signals) {
    const message =
      typeof data.error === "string" && data.error.trim()
        ? data.error.trim()
        : "Failed to load PPC research signals.";
    throw new Error(message);
  }

  return normalizePpcGoogleResearchSignals(data.signals);
}
