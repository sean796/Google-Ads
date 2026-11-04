import type { WordPressSite } from "@/components/integrations/types";
import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { resolveOrganicClientReportClientLogoUrl } from "@/lib/integrations/client-site-logo";
import type { OrganicClientReportDeckPayload } from "@/lib/organic-dashboard/organic-client-report-deck-session";

export function normalizeClientLogoBoxTheme(raw: unknown): "black" | "white" {
  return raw === "white" ? "white" : "black";
}

let propertiesLoadCache: WordPressSite[] | null = null;
let propertiesLoadPromise: Promise<WordPressSite[]> | null = null;

async function loadWordPressPropertiesSites(): Promise<WordPressSite[]> {
  if (propertiesLoadCache) return propertiesLoadCache;
  if (propertiesLoadPromise) return propertiesLoadPromise;
  propertiesLoadPromise = (async () => {
    const res = await fetch(`${backendApiUrl("/manager-wordpress-properties/load")}?_=${Date.now()}`, {
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { sites?: WordPressSite[] };
    const sites = Array.isArray(data.sites) ? data.sites : [];
    propertiesLoadCache = sites;
    return sites;
  })();
  return propertiesLoadPromise;
}

export function resetOrganicClientReportPropertyBrandingCache(): void {
  propertiesLoadCache = null;
  propertiesLoadPromise = null;
}

export async function fetchWordPressSiteForReportBranding(
  siteId: string,
): Promise<Pick<WordPressSite, "id" | "clientLogoBoxTheme" | "clientLogoUrl"> | null> {
  const id = siteId.trim();
  if (!id) return null;
  const sites = await loadWordPressPropertiesSites();
  const site = sites.find((row) => row.id === id);
  if (!site) return null;
  return {
    id: site.id,
    clientLogoBoxTheme: site.clientLogoBoxTheme,
    clientLogoUrl: site.clientLogoUrl,
  };
}

/** Hub property settings win over stale deck snapshots (logo box color + logo URL). */
export function mergePropertyBrandingIntoClientReportDeck(
  payload: OrganicClientReportDeckPayload,
  site: Pick<WordPressSite, "clientLogoBoxTheme" | "clientLogoUrl">,
  appOrigin?: string,
): OrganicClientReportDeckPayload {
  const theme = normalizeClientLogoBoxTheme(site.clientLogoBoxTheme ?? payload.clientLogoBoxTheme);
  const clientLogoUrl = resolveOrganicClientReportClientLogoUrl(
    payload.siteId,
    site.clientLogoUrl ?? payload.clientLogoUrl ?? null,
    appOrigin,
  );
  return {
    ...payload,
    clientLogoBoxTheme: theme,
    ...(clientLogoUrl ? { clientLogoUrl } : {}),
  };
}

export async function mergeHubPropertyBrandingIntoClientReportDeck(
  payload: OrganicClientReportDeckPayload,
  appOrigin?: string,
): Promise<OrganicClientReportDeckPayload> {
  const site = await fetchWordPressSiteForReportBranding(payload.siteId);
  if (!site) return payload;
  return mergePropertyBrandingIntoClientReportDeck(payload, site, appOrigin);
}
