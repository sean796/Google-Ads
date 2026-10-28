import type { WordPressSite } from "@/components/integrations/types";
import { seedBulkInventorySessionFromSiteWarmCache } from "@/lib/bulk/seed-bulk-session-from-site-warm-cache";
import {
  resolveEntitySiteWarmBundleSync,
  seedOverviewSessionCachesFromWarm,
} from "@/lib/local-analysis/entity-site-warm-cache";

/** Sync warm + bulk session before studio paint (no network). */
export function prefetchOverviewStudioSiteCache(site: WordPressSite): void {
  resolveEntitySiteWarmBundleSync(site);
  seedBulkInventorySessionFromSiteWarmCache(site);
  seedOverviewSessionCachesFromWarm(site);
}
