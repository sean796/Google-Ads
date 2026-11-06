import type { WordPressSite } from "@/components/integrations/types";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { readSiteServiceCountry } from "@/lib/wordpress-api/site-service-area";

/** Regional Semrush database for domain overview (matches server `database_from_site_url`). */
export function resolveSemrushDatabaseForSite(site: WordPressSite): string {
  const profileCountry = readSiteServiceCountry(site).trim().toLowerCase();
  if (profileCountry === "canada" || profileCountry === "ca") {
    return "ca";
  }
  if (profileCountry === "united states" || profileCountry === "usa" || profileCountry === "us") {
    return "us";
  }

  const raw = getPublicSiteUrl(site).trim() || site.siteUrl.trim();
  if (!raw) return "us";
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const host = new URL(withProto).hostname.replace(/^www\./i, "").toLowerCase();
    if (host.endsWith(".ca")) return "ca";
    if (host.endsWith(".co.uk")) return "uk";
    if (host.endsWith(".com.au")) return "au";
    if (host.endsWith(".de")) return "de";
    if (host.endsWith(".fr")) return "fr";
    return "us";
  } catch {
    return "us";
  }
}
