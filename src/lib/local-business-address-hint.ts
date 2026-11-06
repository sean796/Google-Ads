import type { WordPressSite } from "@/components/integrations/types";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";

export type LocalBusinessAddressHint = {
  lat?: string;
  lng?: string;
  label?: string;
};

export async function importSchemaHintsFromLiveSite(
  site: WordPressSite,
): Promise<LocalBusinessAddressHint | null> {
  const url = getPublicSiteUrl(site) || site.siteUrl;
  if (!url?.trim()) return null;
  try {
    const res = await fetch(`${BACKEND_API_BASE}/api/seo/local-business-address`, {
      method: "POST",
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ url: url.trim() }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { label?: string | null; lat?: number; lng?: number };
    return {
      label: data.label || undefined,
      lat: data.lat != null ? String(data.lat) : undefined,
      lng: data.lng != null ? String(data.lng) : undefined,
    };
  } catch {
    return null;
  }
}
