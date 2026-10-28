import { useEffect, useSyncExternalStore } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import {
  ensureEntitySiteWarmCache,
  resolveEntitySiteWarmBundleSync,
  subscribeEntitySiteWarmInflight,
} from "@/lib/local-analysis/entity-site-warm-cache";
import {
  getOverviewSiteWarmDetailsSnapshot,
  type OverviewSiteWarmDetailsSnapshot,
} from "@/lib/overview/overview-site-warm-details-snapshot";

export type OverviewSiteWarmDetailsState = OverviewSiteWarmDetailsSnapshot;

export function useOverviewSiteWarmDetails(
  site: WordPressSite | null | undefined,
): OverviewSiteWarmDetailsState {
  const snapshot = useSyncExternalStore(
    subscribeEntitySiteWarmInflight,
    () => getOverviewSiteWarmDetailsSnapshot(site),
    () => getOverviewSiteWarmDetailsSnapshot(site),
  );

  useEffect(() => {
    if (!site?.siteUrl?.trim() || !site.id) return;
    const existing = resolveEntitySiteWarmBundleSync(site);
    if (existing && existing.counts.inventoryTotal > 0) {
      return;
    }
    void ensureEntitySiteWarmCache(site);
  }, [site?.id, site?.siteUrl]);

  return snapshot;
}
