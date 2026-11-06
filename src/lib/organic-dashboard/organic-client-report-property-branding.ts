import type { WordPressSite } from "@/components/integrations/types";
import { resolveOrganicClientReportClientLogoUrl } from "@/lib/integrations/client-site-logo";
import type { OrganicClientReportDeckPayload } from "@/lib/organic-dashboard/organic-client-report-deck-session";

export function normalizeClientLogoBoxTheme(raw: unknown): "black" | "white" {
  return raw === "white" ? "white" : "black";
}

// Wave 0: the public client report page no longer calls the gated
// manager-wordpress-properties/load endpoint. The server merges property
// branding (logo box theme and logo URL) into the deck payload returned by
// organic-dashboard/client-report/load. This module keeps only the pure
// merge helper used by internal, logged-in flows and tests.

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
