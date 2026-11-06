import { useEffect, useRef } from "react";
import { usePulseAssistContext } from "@/contexts/pulse-assist-context";
import { warmEntitySiteCache } from "@/lib/local-analysis/entity-site-warm-cache";
import {
  buildOverviewInventorySnapshotFromRows,
  fetchOverviewInventoryForSource,
} from "@/lib/overview/overview-parallel-inventory-fetch";
import { warmSiteInventory } from "@/lib/pulse-assist/api";
import { setBulkInventorySessionSnapshot } from "@/lib/wordpress-bulk-inventory-session-cache";

export function MobileAssistInventoryWarm(): null {
  const { activeSite } = usePulseAssistContext();
  const serverWarmedSiteIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!activeSite) return;
    warmEntitySiteCache(activeSite);
    if (serverWarmedSiteIds.current.has(activeSite.id)) return;
    serverWarmedSiteIds.current.add(activeSite.id);
    void warmSiteInventory(activeSite).catch(() => {
      serverWarmedSiteIds.current.delete(activeSite.id);
    });
    void fetchOverviewInventoryForSource(activeSite, "posts", { includeScheduled: true })
      .then((result) => {
        if (result.rows.length === 0) return;
        const snapshot = buildOverviewInventorySnapshotFromRows(result.rows, activeSite.siteUrl);
        setBulkInventorySessionSnapshot(activeSite.id, "posts", snapshot);
      })
      .catch(() => {});
  }, [activeSite]);

  return null;
}
