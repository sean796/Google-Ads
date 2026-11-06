import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  NOTIFY_ALL_VISIBLE_SITE_NAMES_ALREADY_MATCHED_G,
  NOTIFY_NO_SITES_TO_EXPORT,
  NOTIFY_SIGN_IN_TO_SAVE_SETTINGS_TO_THE_CLOUD,
  notifyExportedXSiteSToCsv,
} from "@/lib/notify-messages";
import { loadApiKey } from "@/lib/api";
import { notify } from "@/lib/app-notifications";
import type { useAuth } from "@/contexts/AuthContext";
import type { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { saveWordPressProperties } from "@/lib/manager-wordpress-properties-api";
import { extractNAPAndLinkGraph } from "@/lib/knowledge-graph-auto-trigger";
import { buildWordPressSitesCsvForDownload } from "@/lib/export-wordpress-sites-csv";
import { bulkApplyGmbSuggestedDisplayNames } from "@/lib/wordpress-site-display-name-from-dfs-gmb";
import type { WordPressSite } from "./types";
import { sortWordPressSitesByName } from "./storage";

type WordPressSitesApi = ReturnType<typeof useWordPressSites>;

export function useWordPressFeatureActions({
  user,
  sites,
  filteredSites,
  credentialedSiteCount,
  quarterStatsAllLoaded,
  quarterStatsFingerprint,
  handlePatchSite,
}: {
  user: ReturnType<typeof useAuth>["user"];
  sites: WordPressSite[];
  filteredSites: WordPressSite[];
  credentialedSiteCount: number;
  quarterStatsAllLoaded: boolean;
  quarterStatsFingerprint: string;
  handlePatchSite: WordPressSitesApi["handlePatchSite"];
}) {
  // NAP + Link graph extraction state
  const [isExtractingNAPAndGraph, setIsExtractingNAPAndGraph] = useState<Record<string, boolean>>({});
  const sitesRef = useRef(sites);
  sitesRef.current = sites;
  const saveInFlightRef = useRef(false);
  const sitesListFingerprintRef = useRef<string | null>(null);

  const performSaveProperties = useCallback(
    async (options?: { silent?: boolean }): Promise<boolean> => {
      const silent = Boolean(options?.silent);
      if (saveInFlightRef.current) {
        return false;
      }
      if (!user) {
        if (!silent) notify.error(NOTIFY_SIGN_IN_TO_SAVE_SETTINGS_TO_THE_CLOUD);
        return false;
      }
      saveInFlightRef.current = true;
      try {
        const sortedSites = sortWordPressSitesByName(sitesRef.current);
        const r = await saveWordPressProperties(sortedSites);
        if (!r.ok) {
          notify.error(r.error || "Property save failed");
          return false;
        }
        if (!silent) {
          const n = r.count ?? sortedSites.length;
          notify.success(
            r.updatedAt
              ? `Saved ${n} propert${n === 1 ? "y" : "ies"} to workspace (${new Date(r.updatedAt).toLocaleString()})`
              : `Saved ${n} propert${n === 1 ? "y" : "ies"} to workspace`,
          );
        }
        return true;
      } finally {
        saveInFlightRef.current = false;
      }
    },
    [user],
  );

  const sitesListFingerprint = useMemo(
    () => sites.map((s) => s.id).sort().join("|"),
    [sites],
  );

  useEffect(() => {
    if (!user) return;
    if (sitesListFingerprintRef.current === null) {
      sitesListFingerprintRef.current = sitesListFingerprint;
      return;
    }
    if (sitesListFingerprintRef.current === sitesListFingerprint) return;
    sitesListFingerprintRef.current = sitesListFingerprint;

    const t = window.setTimeout(() => {
      void performSaveProperties({ silent: true });
    }, 500);
    return () => window.clearTimeout(t);
  }, [sitesListFingerprint, user, performSaveProperties]);

  useEffect(() => {
    if (!user) return;
    if (credentialedSiteCount === 0) return;
    if (!quarterStatsAllLoaded) return;

    const t = window.setTimeout(() => {
      void performSaveProperties({ silent: true });
    }, 2500);
    return () => window.clearTimeout(t);
  }, [
    quarterStatsFingerprint,
    quarterStatsAllLoaded,
    credentialedSiteCount,
    user,
    performSaveProperties,
  ]);

  const handleExportAllSitesCsv = useCallback(() => {
    if (!sites.length) {
      notify.error(NOTIFY_NO_SITES_TO_EXPORT);
      return;
    }
    const csv = buildWordPressSitesCsvForDownload(sites);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `neo-pulse-wordpress-sites-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    notify.success(notifyExportedXSiteSToCsv(sites.length));
  }, [sites]);

  const handleExtractNAPAndLinkGraph = useCallback(async (site: WordPressSite) => {
    setIsExtractingNAPAndGraph(prev => ({ ...prev, [site.id]: true }));
    try {
      await extractNAPAndLinkGraph(site);
    } catch (error) {
      console.error('[NAP & Link Graph] Error:', error);
    } finally {
      setIsExtractingNAPAndGraph(prev => { const updated = { ...prev }; delete updated[site.id]; return updated; });
    }
  }, []);

  const [isBulkGmbNamesBusy, setIsBulkGmbNamesBusy] = useState(false);

  const handleBulkApplyGmbDisplayNames = useCallback(async () => {
    if (filteredSites.length === 0) return;
    setIsBulkGmbNamesBusy(true);
    try {
      const stats = await bulkApplyGmbSuggestedDisplayNames(filteredSites, (id, name) => {
        handlePatchSite(id, { name });
      }, { openRouterApiKey: loadApiKey()?.trim() || undefined });
      if (stats.updated > 0) {
        notify.success(
          stats.updated === 1
            ? "Updated 1 site name from Google Business Profile."
            : `Updated ${stats.updated} site names from Google Business Profile.`,
        );
      }
      if (stats.failed > 0) {
        notify.error(
          stats.firstError
            ? `${stats.failed} site(s) could not resolve a name. ${stats.firstError}`
            : `${stats.failed} site(s) could not resolve a name.`,
        );
      }
      if (stats.updated === 0 && stats.failed === 0 && stats.unchanged > 0) {
        notify.info(NOTIFY_ALL_VISIBLE_SITE_NAMES_ALREADY_MATCHED_G);
      }
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Bulk name update failed.");
    } finally {
      setIsBulkGmbNamesBusy(false);
    }
  }, [filteredSites, handlePatchSite]);
  return {
    isExtractingNAPAndGraph,
    handleExportAllSitesCsv,
    handleExtractNAPAndLinkGraph,
    isBulkGmbNamesBusy,
    handleBulkApplyGmbDisplayNames,
  };
}
