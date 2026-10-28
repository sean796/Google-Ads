import type { WordPressSite } from "@/components/integrations/types";
import {
  fetchWordPressSitesMirror,
  getStoredSites,
  saveSites,
} from "@/components/integrations/storage";
import { findConnectedWordPressSite } from "@/lib/agent-runs/resolve-agent-run-site";
import { IN_THE_SHADE_GOOGLE_ADS_CUSTOMER_ID } from "@/lib/neo-digital-google-ads-customer-ids";
import { wordPressSiteHostKey } from "@/lib/wordpress-site-host-key";

export { IN_THE_SHADE_GOOGLE_ADS_CUSTOMER_ID };

export function normalizeGoogleAdsCustomerId(raw: string): string {
  return raw.replace(/\D+/g, "");
}

function pickGoogleAdsCustomerIdFromSite(site: WordPressSite | null | undefined): string {
  return normalizeGoogleAdsCustomerId(site?.googleAdsCustomerId?.trim() ?? "");
}

function mirrorRowForSite(site: WordPressSite, serverSites: WordPressSite[]): WordPressSite | undefined {
  const byId = serverSites.find((s) => s.id === site.id);
  if (byId) return byId;
  const host = wordPressSiteHostKey(site.siteUrl);
  if (host) {
    const byHost = serverSites.find((s) => wordPressSiteHostKey(s.siteUrl) === host);
    if (byHost) return byHost;
  }
  const nameKey = (site.name ?? "").trim().toLowerCase();
  if (!nameKey) return undefined;
  return serverSites.find((s) => (s.name ?? "").trim().toLowerCase() === nameKey);
}

/** Site field, stored copy, connected site (same resolution order as GA4 reporting). */
export function resolveGoogleAdsCustomerIdForReporting(site: WordPressSite): string {
  const direct = pickGoogleAdsCustomerIdFromSite(site);
  if (direct.length === 10) return direct;
  const stored = getStoredSites().find((s) => s.id === site.id);
  const fromStored = pickGoogleAdsCustomerIdFromSite(stored);
  if (fromStored.length === 10) return fromStored;
  const connected = site.id ? findConnectedWordPressSite(site.id) : null;
  return pickGoogleAdsCustomerIdFromSite(connected);
}

/** Local fields first; then server property mirror (Integrations sites.json). */
export async function resolveGoogleAdsCustomerIdForReportingAsync(site: WordPressSite): Promise<string> {
  const sync = resolveGoogleAdsCustomerIdForReporting(site);
  if (sync.length === 10) return sync;
  const serverSites = await fetchWordPressSitesMirror();
  if (serverSites.length === 0) return sync;
  const row = mirrorRowForSite(site, serverSites);
  const fromMirror = pickGoogleAdsCustomerIdFromSite(row);
  if (fromMirror.length !== 10) return sync;
  const local = getStoredSites();
  let idx = local.findIndex((s) => s.id === site.id);
  if (idx < 0) {
    const nameKey = (site.name ?? "").trim().toLowerCase();
    if (nameKey) {
      idx = local.findIndex((s) => (s.name ?? "").trim().toLowerCase() === nameKey);
    }
  }
  if (idx >= 0 && pickGoogleAdsCustomerIdFromSite(local[idx]!).length !== 10) {
    const next = [...local];
    next[idx] = { ...next[idx]!, googleAdsCustomerId: fromMirror };
    saveSites(next);
  }
  return fromMirror;
}

export function formatGoogleAdsCustomerId(raw: string): string {
  const id = normalizeGoogleAdsCustomerId(raw);
  if (id.length !== 10) return id;
  return `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`;
}

export function googleAdsAccountUrl(customerId: string, loginCustomerId?: string): string | null {
  const id = normalizeGoogleAdsCustomerId(customerId);
  if (id.length !== 10) return null;
  const url = new URL("https://ads.google.com/aw/campaigns");
  url.searchParams.set("__c", id);
  const login = loginCustomerId ? normalizeGoogleAdsCustomerId(loginCustomerId) : "";
  if (login.length === 10) url.searchParams.set("__u", login);
  return url.toString();
}

export function googleAdsCampaignUrl(
  customerId: string,
  campaignId: string,
  loginCustomerId?: string,
): string | null {
  const id = normalizeGoogleAdsCustomerId(customerId);
  const campId = (campaignId ?? "").trim();
  if (id.length !== 10 || !campId) return null;
  const url = new URL("https://ads.google.com/aw/campaigns");
  url.searchParams.set("__c", id);
  url.searchParams.set("campaignId", campId);
  const login = loginCustomerId ? normalizeGoogleAdsCustomerId(loginCustomerId) : "";
  if (login.length === 10) url.searchParams.set("__u", login);
  return url.toString();
}

export function microsToSpend(costMicros: number): number {
  return costMicros / 1_000_000;
}

export function adsCpa(costMicros: number, conversions: number): number | null {
  if (conversions <= 0) return null;
  return microsToSpend(costMicros) / conversions;
}

export function adsPctDelta(primary: number, compare: number): number | null {
  if (compare === 0) return null;
  return ((primary - compare) / compare) * 100;
}
