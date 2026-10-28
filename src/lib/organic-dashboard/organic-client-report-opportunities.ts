import type { OrganicDeckOpportunity } from "@/lib/organic-dashboard/organic-reporting-highlights";

/** Paid-search opportunity cards belong under Google Ads, not Highlights. */
export function isGoogleAdsClientReportOpportunity(item: OrganicDeckOpportunity): boolean {
  for (const row of item.comparisonRows) {
    const metric = row.metric.trim();
    if (/\(google ads\)/i.test(metric)) {
      return true;
    }
  }
  return false;
}

export function partitionClientReportOpportunities(items: OrganicDeckOpportunity[]): {
  seoOpportunities: OrganicDeckOpportunity[];
  googleAdsOpportunities: OrganicDeckOpportunity[];
} {
  const seoOpportunities: OrganicDeckOpportunity[] = [];
  const googleAdsOpportunities: OrganicDeckOpportunity[] = [];
  for (const item of items) {
    if (isGoogleAdsClientReportOpportunity(item)) {
      googleAdsOpportunities.push(item);
    } else {
      seoOpportunities.push(item);
    }
  }
  return { seoOpportunities, googleAdsOpportunities };
}
