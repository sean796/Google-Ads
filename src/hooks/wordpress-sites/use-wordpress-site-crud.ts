import { useCallback, type Dispatch, type SetStateAction } from "react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_ENTER_A_SITE_NAME, NOTIFY_SITE_CONNECTION_DELETED, notifyDeletedXSiteS } from "@/lib/notify-messages";
import { recordDeletedSite, saveSites } from "@/components/integrations/storage";
import { type WordPressSite } from "@/components/integrations/types";
import { readSiteServiceCity, readSiteServiceState, readSiteServiceCountry, buildSiteLocationsPatch } from "@/lib/wordpress-api/site-service-area";
import { persistGbpLocationIdInput } from "@/lib/gbp-post/normalize-gbp-location-id";
import { isEditorialContentPackageTier } from "@/lib/editorial-content-package";
import { isOptimizationPackageTier } from "@/lib/wordpress-optimization-package";
import { normalizeProfileTags } from "@/lib/wordpress-property-profile-tags";
import {
  canWarmEntitySite,
  clearEntitySiteWarmCache,
  invalidateEntitySiteWarmCacheIfCredentialsChanged,
  warmEntitySiteCache,
} from "@/lib/local-analysis/entity-site-warm-cache";
import { normalizeClientLogoBoxTheme } from "@/lib/organic-dashboard/organic-client-report-property-branding";

export function useWordPressSiteCrud({ sites, setSites, runAutoSetupForNewSite }: {
  sites: WordPressSite[];
  setSites: Dispatch<SetStateAction<WordPressSite[]>>;
  runAutoSetupForNewSite: (site: WordPressSite) => Promise<void>;
}) {
  const handleAddSite = useCallback(() => {
    return {
      name: "",
      siteUrl: "",
      productionSiteUrl: "",
      username: "",
      appPassword: "",
      ga4PropertyId: "",
      googleAdsCustomerId: "",
      gbpLocationId: "",
      semrushSiteAuditProjectId: "",
      semrushPositionTrackingProjectId: "",
      semrushPositionTrackingCampaignId: "",
      editorialCountsPeriodStartYmd: "",
      benchmarkCustomTag: "",
      primaryLocalKeyword: "",
      profileTags: [] as string[],
      slackEnabledForProperty: true,
      slackChannelId: "",
      slackChannelName: "",
      slackIncomingWebhookUrl: "",
      slackMentionSnippet: "",
      postBankEnabled: true,
    };
  }, []);

  const handleEditSite = useCallback((site: WordPressSite) => {
    return {
      name: site.name,
      siteUrl: site.siteUrl,
      productionSiteUrl: site.productionSiteUrl ?? "",
      username: site.username,
      appPassword: site.appPassword,
      ga4PropertyId: site.ga4PropertyId ?? "",
      googleAdsCustomerId: site.googleAdsCustomerId ?? "",
      gbpLocationId: site.gbpLocationId ?? "",
      semrushSiteAuditProjectId: site.semrushSiteAuditProjectId ?? "",
      semrushPositionTrackingProjectId: site.semrushPositionTrackingProjectId ?? "",
      semrushPositionTrackingCampaignId: site.semrushPositionTrackingCampaignId ?? "",
      editorialCountsPeriodStartYmd: site.editorialCountsPeriodStartYmd ?? "",
      optimizationPackage:
        site.optimizationPackage?.trim() && isOptimizationPackageTier(site.optimizationPackage.trim())
          ? site.optimizationPackage.trim()
          : "",
      editorialContentPackage:
        site.editorialContentPackage?.trim() &&
        isEditorialContentPackageTier(site.editorialContentPackage.trim())
          ? site.editorialContentPackage.trim()
          : "",
      editorialPublishTimeLocal: site.editorialPublishTimeLocal?.trim() ?? "",
      benchmarkCustomTag: site.benchmarkCustomTag?.trim() ?? "",
      primaryLocalKeyword: site.primaryLocalKeyword?.trim() ?? "",
      clientLogoUrl: site.clientLogoUrl?.trim() ?? "",
      profileTags: site.profileTags ?? [],
      serviceCity: readSiteServiceCity(site),
      serviceState: readSiteServiceState(site),
      serviceCountry: readSiteServiceCountry(site),
      slackEnabledForProperty: site.slackEnabledForProperty !== false,
      slackChannelId: site.slackChannelId ?? "",
      slackChannelName: site.slackChannelName ?? "",
      slackIncomingWebhookUrl: site.slackIncomingWebhookUrl ?? "",
      slackMentionSnippet: site.slackMentionSnippet ?? "",
    };
  }, []);

  const handleDeleteSite = useCallback((id: string) => {
    const targetSite = sites.find((s) => s.id === id);
    if (targetSite) {
      recordDeletedSite(targetSite);
    }
    const updated = sites.filter((s) => s.id !== id);
    setSites(updated);
    saveSites(updated);
    clearEntitySiteWarmCache(id);
    notify.success(NOTIFY_SITE_CONNECTION_DELETED);
  }, [sites, setSites]);

  const handleDeleteSitesBulk = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    for (const site of sites) {
      if (idSet.has(site.id)) {
        recordDeletedSite(site);
      }
    }
    const updated = sites.filter((s) => !idSet.has(s.id));
    setSites(updated);
    saveSites(updated);
    for (const id of ids) {
      clearEntitySiteWarmCache(id);
    }
    notify.success(notifyDeletedXSiteS(ids.length));
  }, [sites, setSites]);

  const handleToggleEnabled = useCallback((site: WordPressSite) => {
    const isCurrentlyEnabled = site.enabled !== false;
    const newEnabledState = !isCurrentlyEnabled;
    
    // If enabling this site, disable all others
    // If disabling this site, just disable this one
    const updated = sites.map(s => {
      if (s.id === site.id) {
        return { ...s, enabled: newEnabledState };
      } else if (newEnabledState) {
        // If we're enabling the current site, disable all others
        return { ...s, enabled: false };
      }
      return s;
    });
    
    setSites(updated);
    saveSites(updated);
  }, [sites, setSites]);

  /** Enable exactly one property (manager header site picker). */

  const handleConnectSite = useCallback((site: WordPressSite) => {
    const updated = sites.map((s) => ({
      ...s,
      enabled: s.id === site.id,
    }));
    setSites(updated);
    saveSites(updated);
    warmEntitySiteCache(site);
  }, [sites, setSites]);

  const handleSaveSite = useCallback((
    formName: string,
    formSiteUrl: string,
    formUsername: string,
    formAppPassword: string,
    editingSite: WordPressSite | null,
    formProductionSiteUrl?: string,
    formGa4PropertyId?: string,
    formGbpLocationId?: string,
    formSemrushSiteAuditProjectId?: string,
    formSemrushPositionTrackingProjectId?: string,
    formSemrushPositionTrackingCampaignId?: string,
    formEditorialCountsPeriodStartYmd?: string,
    formOptimizationPackage?: string,
    formEditorialContentPackage?: string,
    formEditorialPublishTimeLocal?: string,
    formBenchmarkCustomTag?: string,
    formPrimaryLocalKeyword?: string,
    formClientLogoUrl?: string,
    formProfileTags?: string[],
    formServiceCity?: string,
    formServiceState?: string,
    formServiceCountry?: string,
    formGoogleAdsCustomerId?: string,
    formClientLogoBoxTheme?: "black" | "white",
  ): WordPressSite | false => {
    if (!formName.trim()) {
      notify.error(NOTIFY_ENTER_A_SITE_NAME);
      return false;
    }

    const siteUrl = formSiteUrl.trim() || formProductionSiteUrl?.trim() || "";
    const username = formUsername.trim() || editingSite?.username || "";
    const appPassword = formAppPassword.trim() || editingSite?.appPassword || "";

    const base = editingSite ? { ...editingSite } : {};
    const rawOptPkg = (formOptimizationPackage ?? "").trim();
    const optimizationPackage: "basic" | "pro" | "plus" | undefined =
      rawOptPkg && isOptimizationPackageTier(rawOptPkg) ? rawOptPkg : undefined;
    const rawEditorialPkg = (formEditorialContentPackage ?? "").trim();
    const editorialContentPackage: "standard" | "lite" | undefined =
      rawEditorialPkg && isEditorialContentPackageTier(rawEditorialPkg) ? rawEditorialPkg : undefined;
    const editorialPublishTimeLocal = (formEditorialPublishTimeLocal ?? "").trim() || undefined;
    const siteData: WordPressSite = {
      ...base,
      id: editingSite?.id || `wp-${Date.now()}`,
      name: formName.trim(),
      siteUrl,
      productionSiteUrl: formProductionSiteUrl?.trim() || undefined,
      username,
      appPassword,
      connectedAt: editingSite?.connectedAt || Date.now(),
      lastTested: editingSite?.lastTested,
      connectionStatus: editingSite?.connectionStatus,
      enabled: editingSite?.enabled !== undefined ? editingSite.enabled : true,
      sitemaps: editingSite?.sitemaps,
      ga4PropertyId: formGa4PropertyId?.trim() || undefined,
      googleAdsCustomerId: (formGoogleAdsCustomerId ?? "").replace(/\D/g, "") || undefined,
      gbpLocationId: (() => {
        const persisted = persistGbpLocationIdInput(formGbpLocationId);
        return persisted || undefined;
      })(),
      semrushSiteAuditProjectId: formSemrushSiteAuditProjectId?.trim() || undefined,
      semrushPositionTrackingProjectId: formSemrushPositionTrackingProjectId?.trim() || undefined,
      semrushPositionTrackingCampaignId: formSemrushPositionTrackingCampaignId?.trim() || undefined,
      editorialCountsPeriodStartYmd: formEditorialCountsPeriodStartYmd?.trim() || undefined,
      optimizationPackage,
      editorialContentPackage,
      editorialPublishTimeLocal,
      benchmarkCustomTag: formBenchmarkCustomTag?.trim() || undefined,
      primaryLocalKeyword: formPrimaryLocalKeyword?.trim() || undefined,
      clientLogoUrl: (() => {
        const url = (formClientLogoUrl ?? editingSite?.clientLogoUrl ?? "").trim();
        return url || undefined;
      })(),
      clientLogoSource: (() => {
        const url = (formClientLogoUrl ?? editingSite?.clientLogoUrl ?? "").trim();
        if (!url) return undefined;
        if (url === editingSite?.clientLogoUrl?.trim()) return editingSite?.clientLogoSource;
        return "manual" as const;
      })(),
      clientLogoFetchedAt: (() => {
        const url = (formClientLogoUrl ?? editingSite?.clientLogoUrl ?? "").trim();
        if (!url) return undefined;
        if (url === editingSite?.clientLogoUrl?.trim()) return editingSite?.clientLogoFetchedAt;
        return Date.now();
      })(),
      clientLogoBoxTheme: normalizeClientLogoBoxTheme(
        formClientLogoBoxTheme ?? editingSite?.clientLogoBoxTheme,
      ),
      profileTags: normalizeProfileTags(formProfileTags ?? editingSite?.profileTags),
      postBankEnabled: true,
    };
    if (siteData.profileTags.length === 0) {
      delete siteData.profileTags;
    }
    const servicePatch = buildSiteLocationsPatch(
      siteData,
      formServiceCity ?? readSiteServiceCity(editingSite),
      formServiceState ?? readSiteServiceState(editingSite),
      formServiceCountry ?? readSiteServiceCountry(editingSite),
    );
    Object.assign(siteData, servicePatch);

    invalidateEntitySiteWarmCacheIfCredentialsChanged(siteData);

    setSites((prev) => {
      const updated = editingSite
        ? prev.map((s) => (s.id === editingSite.id ? siteData : s))
        : [...prev, siteData];
      saveSites(updated);
      return updated;
    });
    notify.success(editingSite ? "Site updated" : "Site added");

    if (!editingSite && siteUrl && username && appPassword) {
      runAutoSetupForNewSite(siteData);
    } else if (canWarmEntitySite(siteData)) {
      warmEntitySiteCache(siteData);
    }
    return siteData;
  }, [runAutoSetupForNewSite, setSites]);

  const handleSaveSitesBulk = useCallback((
    clients: Array<{
      name: string;
      siteUrl: string;
      username: string;
      appPassword: string;
      googleAdsCustomerId?: string;
      primaryLocalKeyword?: string;
    }>
  ) => {
    if (clients.length === 0) return;
    const baseId = Date.now();
    const newSites: WordPressSite[] = clients.map((c, i) => {
      const ads = (c.googleAdsCustomerId ?? "").replace(/\D/g, "");
      return {
        id: `wp-${baseId}-${i}`,
        name: c.name.trim(),
        siteUrl: c.siteUrl.trim(),
        username: c.username.trim(),
        appPassword: c.appPassword.trim(),
        googleAdsCustomerId: ads || undefined,
        primaryLocalKeyword: (c.primaryLocalKeyword ?? "").trim() || undefined,
        connectedAt: Date.now(),
        enabled: true,
        postBankEnabled: true,
      };
    });
    const updated = [...sites, ...newSites];
    setSites(updated);
    saveSites(updated);
    Promise.all(newSites.map((site) => runAutoSetupForNewSite(site)));
  }, [sites, runAutoSetupForNewSite, setSites]);

  const handlePatchSite = useCallback((siteId: string, patch: Partial<WordPressSite>) => {
    setSites((prev) => {
      const updated = prev.map((s) => (s.id === siteId ? { ...s, ...patch } : s));
      saveSites(updated);
      return updated;
    });
  }, [setSites]);

  return {
    handleAddSite,
    handleEditSite,
    handleDeleteSite,
    handleDeleteSitesBulk,
    handleToggleEnabled,
    handleConnectSite,
    handleSaveSite,
    handleSaveSitesBulk,
    handlePatchSite,
  };
}
