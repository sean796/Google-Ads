import type { WordPressSite } from "@/components/integrations/types";
import { fetchWordPressSitesMirror } from "@/components/integrations/storage";
import { resolveOrganicDashboardSite } from "@/lib/organic-dashboard/resolve-organic-dashboard-site";

/** Local list first, then hub property mirror (needed on fresh sessions). */
export async function resolveSiteForClientReport(
  sites: WordPressSite[],
  siteId: string,
): Promise<WordPressSite | undefined> {
  const fromLocal = resolveOrganicDashboardSite(sites, siteId, null);
  if (fromLocal) return fromLocal;
  if (!siteId.trim()) return undefined;
  const mirror = await fetchWordPressSitesMirror();
  return mirror.find((s) => s.id === siteId && s.enabled !== false);
}
