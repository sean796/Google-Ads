import {
  NOTIFY_ALL_VISIBLE_SITE_NAMES_ALREADY_MATCHED_G,
  NOTIFY_NO_SITES_TO_EXPORT,
  NOTIFY_SIGN_IN_TO_SAVE_SETTINGS_TO_THE_CLOUD,
  notifyExportedXSiteSToCsv,
} from "@/lib/notify-messages";
import React, { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Upload, Download, RotateCcw } from "lucide-react";
import { notify } from "@/lib/app-notifications";
import { useAuth } from "@/contexts/AuthContext";
import { PROPERTIES_SHELL } from "./wordpress/wordpress-properties-surfaces";
import {
  BULK_HEADER_SELECT_TRIGGER,
  BULK_HEADER_TOOL_BTN,
} from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatDashboardEditorialMonthShort,
  getLocalCalendarMonthAfterBeforeForMonthKey,
} from "@/lib/quarter-bounds";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { WordPressSiteList } from "./wordpress/WordPressSiteList";
import { WordPressDialogs } from "./wordpress/WordPressDialogs";
import { SitePropertyEditPanel } from "./wordpress/SitePropertyEditPanel";
import { PropertyProfilePage } from "./wordpress/PropertyProfilePage";
import type { WordPressSiteAdminSectionId } from "./wordpress/WordPressSiteAdminLayout";
import type { PropertySettingsSubSectionId } from "./wordpress/property-settings-types";
import { BulkImportClientsDialog } from "./wordpress/BulkImportClientsDialog";
import { useQuarterEditorialCounts } from "@/hooks/use-quarter-editorial-counts";
import { resolveEditorialContentPackageForSite } from "@/lib/editorial-content-package";
import { useOptimizationActivityCounts } from "@/hooks/use-optimization-activity-counts";
import { OPTIMIZATION_TILE_COUNTS_ENABLED } from "@/lib/wordpress-optimization-tile-counts";
import type { WordPressSite } from "./types";
import {
  getStoredSites,
  sortWordPressSitesByName,
  mergeServerGbpLocationIdsIntoLocalSites,
  fetchAndPersistMissingClientLogos,
} from "./storage";
import { normalizeGbpLocationIdInput } from "@/lib/gbp-post/normalize-gbp-location-id";
import { saveWordPressProperties, syncOpenRouterToWorkspace } from "@/lib/manager-wordpress-properties-api";
import { loadApiKey } from "@/lib/api";
import { extractNAPAndLinkGraph } from "@/lib/knowledge-graph-auto-trigger";
import { buildWordPressSitesCsvForDownload } from "@/lib/export-wordpress-sites-csv";
import { applyGbpPropertyWand, bulkApplyGmbSuggestedDisplayNames } from "@/lib/wordpress-site-display-name-from-dfs-gmb";
import { cn } from "@/lib/utils";
import { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import { useRegisterPropertiesDashboardToolbar } from "@/components/manager/dashboard/PropertiesDashboardChromeContext";

interface WordPressFeatureProps {
  onEntityGeneration?: (site: WordPressSite, sitemapUrl: string) => void;
  isGeneratingEntities?: Record<string, boolean>;
}

export const WordPressFeature: React.FC<WordPressFeatureProps> = ({
  onEntityGeneration,
  isGeneratingEntities = {},
}) => {
  // Site management hook
  const {
    sites,
    setSites,
    isTesting,
    isDetecting,
    isFetchingScheduled,
    isScrapingSitemap,
    isIndexingSitemap,
    isCheckingFuture,
    isLoadingCalendar,
    handleAddSite: handleAddSiteInit,
    handleEditSite: handleEditSiteInit,
    handleDeleteSite,
    handleDeleteSitesBulk,
    handleToggleEnabled,
    handleConnectSite,
    handleSaveSite,
    handleSaveSitesBulk,
    handleTestConnection,
    handleDetectSitemaps,
    handleFetchScheduledPosts,
    handleScrapeChildSitemap,
    handleIndexSitemap,
    handleCheckFuturePosts,
    handleLoadCalendarPosts,
    handleSetEntitySitemap,
    handleSetCompetitorEntitySitemap,
    handleAddCustomSitemapTagLabel,
    handleToggleChildSystemRole,
    handleToggleChildCustomTag,
    handleToggleChildSitemapDisabled,
    getScrapingKey,
    handlePatchSite,
    handleAppendManualChildSitemap,
    reloadSitesFromStorage,
  } = useWordPressSites();

  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const key = loadApiKey()?.trim();
    if (!key) return;
    void syncOpenRouterToWorkspace({ openRouterApiKey: key });
  }, [user]);

  const clientLogosBootstrappedRef = useRef(false);
  useEffect(() => {
    if (clientLogosBootstrappedRef.current) return;
    clientLogosBootstrappedRef.current = true;
    void (async () => {
      await mergeServerGbpLocationIdsIntoLocalSites();
      reloadSitesFromStorage();
      const updated = await fetchAndPersistMissingClientLogos(getStoredSites());
      if (updated) {
        reloadSitesFromStorage();
      }
    })();
  }, [reloadSitesFromStorage]);

  const {
    bySiteId: quarterStatsBySite,
    refreshAllQuarterCounts,
    isRefreshingAllQuarterCounts,
    selectedMonthKey: editorialSelectedMonthKey,
    setSelectedMonthKey: setEditorialSelectedMonthKey,
    monthOptions: editorialMonthOptions,
  } = useQuarterEditorialCounts(sites);

  const {
    bySiteId: optimizationStatsBySite,
    refreshAllOptimizationCounts,
    isRefreshingAllOptimizationCounts,
  } = useOptimizationActivityCounts(sites);

  const credentialedSites = useMemo(
    () =>
      sites.filter(
        (s) => Boolean(s.siteUrl?.trim() && s.username?.trim() && s.appPassword?.trim()),
      ),
    [sites],
  );
  const credentialedSiteCount = credentialedSites.length;

  /** Quarter editorial (sparkle) counts finished loading for every credentialed property. */
  const quarterStatsAllLoaded = useMemo(
    () =>
      credentialedSites.length > 0 &&
      credentialedSites.every((s) => {
        const q = quarterStatsBySite[s.id];
        return Boolean(q && !q.loading);
      }),
    [credentialedSites, quarterStatsBySite],
  );

  const quarterStatsFingerprint = useMemo(
    () =>
      credentialedSites
        .map((s) => {
          const q = quarterStatsBySite[s.id];
          if (!q || q.loading) return `${s.id}:L`;
          return [
            s.id,
            q.postsLive ?? "x",
            q.postsScheduled ?? "x",
            q.entityLive ?? "x",
            q.entityScheduled ?? "x",
            q.countsPeriodAfterIso ?? "",
            q.countsPeriodEndExclusiveIso ?? "",
          ].join("|");
        })
        .join(";"),
    [credentialedSites, quarterStatsBySite],
  );

  const sitesRef = useRef(sites);
  sitesRef.current = sites;
  const saveInFlightRef = useRef(false);
  const sitesListFingerprintRef = useRef<string | null>(null);

  const { registerIntegrationSites } = useWordPressOptimization();

  useEffect(() => {
    registerIntegrationSites(sites);
  }, [sites, registerIntegrationSites]);

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [bulkImportDialogOpen, setBulkImportDialogOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<WordPressSite | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formSiteUrl, setFormSiteUrl] = useState("");
  const [formProductionSiteUrl, setFormProductionSiteUrl] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formAppPassword, setFormAppPassword] = useState("");
  const [formGa4PropertyId, setFormGa4PropertyId] = useState("");
  const [formGoogleAdsCustomerId, setFormGoogleAdsCustomerId] = useState("");
  const [formGbpLocationId, setFormGbpLocationId] = useState("");
  const [formSemrushSiteAuditProjectId, setFormSemrushSiteAuditProjectId] = useState("");
  const [formSemrushPositionTrackingProjectId, setFormSemrushPositionTrackingProjectId] = useState("");
  const [formSemrushPositionTrackingCampaignId, setFormSemrushPositionTrackingCampaignId] = useState("");
  const [formEditorialCountsPeriodStartYmd, setFormEditorialCountsPeriodStartYmd] = useState("");
  const [formOptimizationPackage, setFormOptimizationPackage] = useState("basic");
  const [formEditorialContentPackage, setFormEditorialContentPackage] = useState("");
  const [formEditorialPublishTimeLocal, setFormEditorialPublishTimeLocal] = useState("");
  const [editorialPackageFilter, setEditorialPackageFilter] = useState<
    "all" | "standard" | "lite" | "unassigned"
  >("all");
  const [formBenchmarkCustomTag, setFormBenchmarkCustomTag] = useState("");
  const [formPrimaryLocalKeyword, setFormPrimaryLocalKeyword] = useState("");
  const [formClientLogoUrl, setFormClientLogoUrl] = useState("");
  const [formClientLogoBoxTheme, setFormClientLogoBoxTheme] = useState<"black" | "white">("black");
  const [formProfileTags, setFormProfileTags] = useState<string[]>([]);
  const [formServiceCity, setFormServiceCity] = useState("");
  const [formServiceState, setFormServiceState] = useState("");
  const [formServiceCountry, setFormServiceCountry] = useState("");

  // NAP + Link graph extraction state
  const [isExtractingNAPAndGraph, setIsExtractingNAPAndGraph] = useState<Record<string, boolean>>({});
  
  /**
   * Full property profile page (replaces the list while a property is open).
   */
  const [profileSiteId, setProfileSiteId] = useState<string | null>(null);
  const [profileSectionId, setProfileSectionId] =
    useState<WordPressSiteAdminSectionId>("overview");
  const [settingsSubSectionId, setSettingsSubSectionId] =
    useState<PropertySettingsSubSectionId>("profile");
  
  // Site search filter state
  const [siteSearchQuery, setSiteSearchQuery] = useState<string>('');
  // Bulk delete selection
  const [selectedSiteIds, setSelectedSiteIds] = useState<Set<string>>(new Set());

  // Filter sites based on search query (must be before handleSelectAll which depends on it)
  const filteredSites = useMemo(() => {
    if (!siteSearchQuery.trim()) return sites;
    const query = siteSearchQuery.toLowerCase();
    return sites.filter(site => site.name.toLowerCase().includes(query));
  }, [sites, siteSearchQuery]);

  const tierFilteredSites = useMemo(() => {
    if (editorialPackageFilter === "all") return filteredSites;
    return filteredSites.filter((site) => {
      const pkg = resolveEditorialContentPackageForSite(site);
      if (editorialPackageFilter === "unassigned") return !pkg;
      return pkg === editorialPackageFilter;
    });
  }, [filteredSites, editorialPackageFilter]);
  
  const handleSelectAll = useCallback((selected: boolean) => {
    if (selected) {
      setSelectedSiteIds(new Set(tierFilteredSites.map((s) => s.id)));
    } else {
      setSelectedSiteIds(new Set());
    }
  }, [tierFilteredSites]);

  const handleDeleteSelected = useCallback(() => {
    handleDeleteSitesBulk(Array.from(selectedSiteIds));
    setSelectedSiteIds(new Set());
  }, [handleDeleteSitesBulk, selectedSiteIds]);

  const handleSiteSelectedChange = useCallback((siteId: string, selected: boolean) => {
    setSelectedSiteIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(siteId);
      else next.delete(siteId);
      return next;
    });
  }, []);

  const populateFormFromSite = useCallback(
    (site: WordPressSite) => {
      const formData = handleEditSiteInit(site);
      setEditingSite(site);
      setFormName(formData.name);
      setFormSiteUrl(formData.siteUrl);
      setFormProductionSiteUrl(formData.productionSiteUrl ?? "");
      setFormUsername(formData.username);
      setFormAppPassword(formData.appPassword);
      setFormGa4PropertyId(formData.ga4PropertyId ?? "");
      setFormGoogleAdsCustomerId(formData.googleAdsCustomerId ?? "");
      setFormGbpLocationId(formData.gbpLocationId ?? "");
      setFormSemrushSiteAuditProjectId(formData.semrushSiteAuditProjectId ?? "");
      setFormSemrushPositionTrackingProjectId(formData.semrushPositionTrackingProjectId ?? "");
      setFormSemrushPositionTrackingCampaignId(formData.semrushPositionTrackingCampaignId ?? "");
      setFormEditorialCountsPeriodStartYmd(formData.editorialCountsPeriodStartYmd ?? "");
      setFormOptimizationPackage(formData.optimizationPackage ?? "");
      setFormEditorialContentPackage(formData.editorialContentPackage ?? "");
      setFormEditorialPublishTimeLocal(formData.editorialPublishTimeLocal ?? "");
      setFormBenchmarkCustomTag(formData.benchmarkCustomTag ?? "");
      setFormPrimaryLocalKeyword(formData.primaryLocalKeyword ?? "");
      setFormClientLogoUrl(formData.clientLogoUrl ?? "");
      setFormClientLogoBoxTheme(site.clientLogoBoxTheme ?? "black");
      setFormProfileTags(formData.profileTags ?? []);
      setFormServiceCity(formData.serviceCity ?? "");
      setFormServiceState(formData.serviceState ?? "");
      setFormServiceCountry(formData.serviceCountry ?? "");
    },
    [handleEditSiteInit],
  );

  const openProfile = useCallback(
    (siteId: string, sectionId?: WordPressSiteAdminSectionId) => {
      const site = sites.find((s) => s.id === siteId);
      if (!site) return;
      setProfileSiteId(siteId);
      setProfileSectionId(sectionId ?? "overview");
      setSettingsSubSectionId("profile");
      void (async () => {
        await mergeServerGbpLocationIdsIntoLocalSites();
        reloadSitesFromStorage();
        let fresh = getStoredSites().find((s) => s.id === siteId) ?? site;
        if (!fresh.clientLogoUrl?.trim()) {
          await fetchAndPersistMissingClientLogos([fresh]);
          reloadSitesFromStorage();
          fresh = getStoredSites().find((s) => s.id === siteId) ?? fresh;
        }
        populateFormFromSite(fresh);
      })();
    },
    [sites, reloadSitesFromStorage, populateFormFromSite],
  );

  const closeProfile = useCallback(() => {
    setProfileSiteId(null);
  }, []);

  /** Close profile modal when the site was removed (e.g. deleted). */
  useEffect(() => {
    if (!profileSiteId) return;
    const site = sites.find((s) => s.id === profileSiteId);
    if (!site) {
      setProfileSiteId(null);
    }
  }, [sites, profileSiteId]);

  const lastProfileSyncedRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!profileSiteId) {
      lastProfileSyncedRef.current = null;
      return;
    }
    const site = sites.find((s) => s.id === profileSiteId);
    if (!site) return;
    const syncKey = `${profileSiteId}:${site.gbpLocationId ?? ""}:${site.ga4PropertyId ?? ""}:${site.googleAdsCustomerId ?? ""}:${site.clientLogoUrl ?? ""}:${site.clientLogoFetchedAt ?? ""}`;
    if (lastProfileSyncedRef.current === syncKey) return;
    lastProfileSyncedRef.current = syncKey;
    populateFormFromSite(site);
  }, [profileSiteId, sites, populateFormFromSite]);

  /** Keep GBP field in sync when the site row gains an id (save or server hydrate) without clobbering in-progress edits. */
  useEffect(() => {
    if (!profileSiteId) return;
    const gbp = sites.find((s) => s.id === profileSiteId)?.gbpLocationId?.trim();
    if (!gbp) return;
    setFormGbpLocationId((prev) => (prev.trim() ? prev : gbp));
  }, [profileSiteId, sites]);

  const profileSite = profileSiteId
    ? sites.find((s) => s.id === profileSiteId) ?? null
    : null;

  const handleAddSite = useCallback(() => {
    const formData = handleAddSiteInit();
    setEditingSite(null);
    setFormName(formData.name);
    setFormSiteUrl(formData.siteUrl);
    setFormProductionSiteUrl(formData.productionSiteUrl ?? "");
    setFormUsername(formData.username);
    setFormAppPassword(formData.appPassword);
      setFormGa4PropertyId(formData.ga4PropertyId ?? "");
      setFormGoogleAdsCustomerId(formData.googleAdsCustomerId ?? "");
      setFormGbpLocationId(formData.gbpLocationId ?? "");
      setFormSemrushSiteAuditProjectId(formData.semrushSiteAuditProjectId ?? "");
      setFormSemrushPositionTrackingProjectId(formData.semrushPositionTrackingProjectId ?? "");
      setFormSemrushPositionTrackingCampaignId(formData.semrushPositionTrackingCampaignId ?? "");
      setFormEditorialCountsPeriodStartYmd(formData.editorialCountsPeriodStartYmd ?? "");
      setFormOptimizationPackage(formData.optimizationPackage ?? "");
      setFormEditorialContentPackage(formData.editorialContentPackage ?? "");
      setFormEditorialPublishTimeLocal(formData.editorialPublishTimeLocal ?? "");
      setFormBenchmarkCustomTag(formData.benchmarkCustomTag ?? "");
      setFormPrimaryLocalKeyword(formData.primaryLocalKeyword ?? "");
      setFormClientLogoUrl(formData.clientLogoUrl ?? "");
      setFormClientLogoBoxTheme("black");
      setFormProfileTags(formData.profileTags ?? []);
      setFormServiceCity("");
    setFormServiceState("");
    setFormServiceCountry("");
    setIsDialogOpen(true);
  }, [handleAddSiteInit]);

  const handleEditSite = useCallback(
    (site: WordPressSite) => {
      populateFormFromSite(site);
      setIsDialogOpen(true);
    },
    [populateFormFromSite],
  );

  const handleSaveSiteClick = useCallback(() => {
    const activeEdit =
      editingSite ??
      (profileSiteId ? sites.find((s) => s.id === profileSiteId) ?? null : null);
    const liveEdit = activeEdit
      ? sites.find((s) => s.id === activeEdit.id) ?? activeEdit
      : null;
    const gbpForSave =
      formGbpLocationId.trim() ||
      liveEdit?.gbpLocationId?.trim() ||
      normalizeGbpLocationIdInput(formGbpLocationId).trim();
    const ga4ForSave =
      formGa4PropertyId.trim() || liveEdit?.ga4PropertyId?.trim() || "";
    const adsForSave =
      formGoogleAdsCustomerId.trim() || liveEdit?.googleAdsCustomerId?.trim() || "";
    const saved = handleSaveSite(
      formName,
      formSiteUrl,
      formUsername,
      formAppPassword,
      liveEdit,
      formProductionSiteUrl,
      ga4ForSave,
      gbpForSave,
      formSemrushSiteAuditProjectId,
      formSemrushPositionTrackingProjectId,
      formSemrushPositionTrackingCampaignId,
      formEditorialCountsPeriodStartYmd,
      formOptimizationPackage,
      formEditorialContentPackage,
      formEditorialPublishTimeLocal,
      formBenchmarkCustomTag,
      formPrimaryLocalKeyword,
      formClientLogoUrl,
      formProfileTags,
      formServiceCity,
      formServiceState,
      formServiceCountry,
      adsForSave,
      formClientLogoBoxTheme,
    );
    if (saved) {
      setIsDialogOpen(false);
      setProfileSiteId(saved.id);
      setEditingSite(saved);
      const gbp = saved.gbpLocationId?.trim() ?? gbpForSave;
      setFormGbpLocationId(gbp);
      if (saved.ga4PropertyId?.trim()) {
        setFormGa4PropertyId(saved.ga4PropertyId.trim());
      }
      if (saved.googleAdsCustomerId?.trim()) {
        setFormGoogleAdsCustomerId(saved.googleAdsCustomerId.trim());
      }
      lastProfileSyncedRef.current = `${saved.id}:${gbp}:${saved.ga4PropertyId ?? ""}:${saved.googleAdsCustomerId ?? ""}`;
      if (!activeEdit) {
        void (async () => {
          const r = await applyGbpPropertyWand(saved, {
            openRouterApiKey: loadApiKey()?.trim() || undefined,
          });
          if (!r.ok) notify.error(r.error);
        })();
      }
    }
  }, [
    formName,
    formSiteUrl,
    formProductionSiteUrl,
    formUsername,
    formAppPassword,
    formGa4PropertyId,
    formGoogleAdsCustomerId,
    formGbpLocationId,
    formSemrushSiteAuditProjectId,
    formSemrushPositionTrackingProjectId,
    formSemrushPositionTrackingCampaignId,
      formEditorialCountsPeriodStartYmd,
      formOptimizationPackage,
      formEditorialContentPackage,
      formEditorialPublishTimeLocal,
      formBenchmarkCustomTag,
      formPrimaryLocalKeyword,
      formClientLogoUrl,
      formClientLogoBoxTheme,
    formProfileTags,
    formServiceCity,
    formServiceState,
    formServiceCountry,
    editingSite,
    profileSiteId,
    sites,
    handleSaveSite,
  ]);

  const profileSettingsPanel = profileSite ? (
    <SitePropertyEditPanel
      site={profileSite}
      editingSite={editingSite}
      layout="modalFlat"
      settingsSubSectionId={settingsSubSectionId}
      hideSave
      formName={formName}
      formSiteUrl={formSiteUrl}
      formProductionSiteUrl={formProductionSiteUrl}
      formUsername={formUsername}
      formAppPassword={formAppPassword}
      formGa4PropertyId={formGa4PropertyId}
      formGoogleAdsCustomerId={formGoogleAdsCustomerId}
      formGbpLocationId={formGbpLocationId}
      formSemrushSiteAuditProjectId={formSemrushSiteAuditProjectId}
      formSemrushPositionTrackingProjectId={formSemrushPositionTrackingProjectId}
      formSemrushPositionTrackingCampaignId={formSemrushPositionTrackingCampaignId}
      formEditorialCountsPeriodStartYmd={formEditorialCountsPeriodStartYmd}
      formOptimizationPackage={formOptimizationPackage}
      formEditorialContentPackage={formEditorialContentPackage}
      formEditorialPublishTimeLocal={formEditorialPublishTimeLocal}
      formBenchmarkCustomTag={formBenchmarkCustomTag}
      formPrimaryLocalKeyword={formPrimaryLocalKeyword}
      formClientLogoUrl={formClientLogoUrl}
      formClientLogoBoxTheme={formClientLogoBoxTheme}
      formProfileTags={formProfileTags}
      formServiceCity={formServiceCity}
      formServiceState={formServiceState}
      formServiceCountry={formServiceCountry}
      onFormNameChange={setFormName}
      onFormSiteUrlChange={setFormSiteUrl}
      onFormProductionSiteUrlChange={setFormProductionSiteUrl}
      onFormUsernameChange={setFormUsername}
      onFormAppPasswordChange={setFormAppPassword}
      onFormGa4PropertyIdChange={setFormGa4PropertyId}
      onFormGoogleAdsCustomerIdChange={setFormGoogleAdsCustomerId}
      onFormGbpLocationIdChange={setFormGbpLocationId}
      onFormSemrushSiteAuditProjectIdChange={setFormSemrushSiteAuditProjectId}
      onFormSemrushPositionTrackingProjectIdChange={setFormSemrushPositionTrackingProjectId}
      onFormSemrushPositionTrackingCampaignIdChange={setFormSemrushPositionTrackingCampaignId}
      onFormEditorialCountsPeriodStartYmdChange={setFormEditorialCountsPeriodStartYmd}
      onFormOptimizationPackageChange={setFormOptimizationPackage}
      onFormEditorialContentPackageChange={setFormEditorialContentPackage}
      onFormEditorialPublishTimeLocalChange={setFormEditorialPublishTimeLocal}
      onFormBenchmarkCustomTagChange={setFormBenchmarkCustomTag}
      onFormPrimaryLocalKeywordChange={setFormPrimaryLocalKeyword}
      onFormClientLogoUrlChange={setFormClientLogoUrl}
      onFormClientLogoBoxThemeChange={setFormClientLogoBoxTheme}
      onFormProfileTagsChange={setFormProfileTags}
      onFormServiceCityChange={setFormServiceCity}
      onFormServiceStateChange={setFormServiceState}
      onFormServiceCountryChange={setFormServiceCountry}
      serviceAreaSite={profileSite}
      onPatchSite={handlePatchSite}
      patchSiteId={profileSite.id}
      semrushActionsDisabled={profileSite.enabled === false}
      onSave={handleSaveSiteClick}
    />
  ) : null;

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

  const selectedCount = selectedSiteIds.size;
  const allSelected = tierFilteredSites.length > 0 && selectedCount === tierFilteredSites.length;
  const selectAllChecked: boolean | "indeterminate" =
    allSelected ? true : selectedCount > 0 ? "indeterminate" : false;

  const trailingToolbarActions = useMemo(
    () => (
      <>
        <Select
          value={editorialPackageFilter}
          onValueChange={(v) =>
            setEditorialPackageFilter(v as "all" | "standard" | "lite" | "unassigned")
          }
        >
          <SelectTrigger
            className={cn(BULK_HEADER_SELECT_TRIGGER, "min-w-[5.5rem]")}
            aria-label="Editorial package filter"
            title="Filter properties by editorial package tier"
          >
            <SelectValue placeholder="Editorial tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="lite">Lite</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
          </SelectContent>
        </Select>
        {editorialMonthOptions.length > 0 && editorialSelectedMonthKey ? (
          <Select value={editorialSelectedMonthKey} onValueChange={setEditorialSelectedMonthKey}>
            <SelectTrigger
              className={cn(BULK_HEADER_SELECT_TRIGGER, "min-w-[4.25rem] tabular-nums")}
              aria-label="Editorial counts month for all properties"
              title="Month for editorial counts on all properties"
            >
              <SelectValue placeholder="Month">
                {formatDashboardEditorialMonthShort(editorialSelectedMonthKey)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {editorialMonthOptions.map((opt) => (
                <SelectItem
                  key={opt.key}
                  value={opt.key}
                  title={getLocalCalendarMonthAfterBeforeForMonthKey(opt.key).label}
                >
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={
            credentialedSiteCount === 0 ||
            isRefreshingAllQuarterCounts ||
            (OPTIMIZATION_TILE_COUNTS_ENABLED && isRefreshingAllOptimizationCounts)
          }
          onClick={() =>
            void (OPTIMIZATION_TILE_COUNTS_ENABLED
              ? Promise.all([refreshAllQuarterCounts(), refreshAllOptimizationCounts()])
              : refreshAllQuarterCounts())
          }
          className={cn(BULK_HEADER_TOOL_BTN, "gap-1.5")}
          title={
            OPTIMIZATION_TILE_COUNTS_ENABLED
              ? "Refresh editorial and optimization counts for all properties"
              : "Refresh editorial counts for all properties"
          }
          aria-label={
            OPTIMIZATION_TILE_COUNTS_ENABLED
              ? "Refresh editorial and optimization counts for all properties"
              : "Refresh editorial counts for all properties"
          }
          aria-busy={
            isRefreshingAllQuarterCounts ||
            (OPTIMIZATION_TILE_COUNTS_ENABLED && isRefreshingAllOptimizationCounts)
          }
        >
          <RotateCcw
            className={`h-4 w-4 shrink-0 ${
              isRefreshingAllQuarterCounts ||
              (OPTIMIZATION_TILE_COUNTS_ENABLED && isRefreshingAllOptimizationCounts)
                ? "animate-spin"
                : ""
            }`}
            aria-hidden
          />
          <span>Counts</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleExportAllSitesCsv}
          disabled={sites.length === 0}
          className={cn(BULK_HEADER_TOOL_BTN, "gap-1.5")}
          title="Download all properties as a CSV spreadsheet (includes credentials - store securely)"
          aria-label="Export all properties"
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden />
          all
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setBulkImportDialogOpen(true)}
          className={cn(BULK_HEADER_TOOL_BTN, "gap-1.5")}
          title="Bulk import properties from CSV"
          aria-label="Bulk import all properties"
        >
          <Upload className="h-4 w-4 shrink-0" aria-hidden />
          all
        </Button>
        <Button
          onClick={handleAddSite}
          className="h-8 min-h-8 shrink-0 gap-1 px-2.5 text-base bg-primary text-primary-foreground hover:bg-primary/90"
          title="Add Site"
          aria-label="Add Site"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Add Site
        </Button>
      </>
    ),
    [
      credentialedSiteCount,
      editorialPackageFilter,
      editorialMonthOptions,
      editorialSelectedMonthKey,
      setEditorialSelectedMonthKey,
      isRefreshingAllQuarterCounts,
      isRefreshingAllOptimizationCounts,
      handleExportAllSitesCsv,
      sites.length,
      handleAddSite,
    ],
  );

  const propertiesToolbarState = useMemo(
    () => ({
      sitesCount: sites.length,
      siteSearchQuery,
      onSearchChange: setSiteSearchQuery,
      selectAllChecked,
      onSelectAll: sites.length > 0 ? handleSelectAll : undefined,
      selectedCount,
      onDeleteSelected: selectedCount > 0 ? handleDeleteSelected : undefined,
      showGbpBulk: Boolean(handlePatchSite),
      isBulkGmbNamesBusy,
      onBulkApplyGmbDisplayNames: handleBulkApplyGmbDisplayNames,
      trailingActions: trailingToolbarActions,
    }),
    [
      sites.length,
      siteSearchQuery,
      selectAllChecked,
      handleSelectAll,
      selectedCount,
      handleDeleteSelected,
      handlePatchSite,
      isBulkGmbNamesBusy,
      handleBulkApplyGmbDisplayNames,
      trailingToolbarActions,
    ],
  );

  useRegisterPropertiesDashboardToolbar(propertiesToolbarState);

  return (
    <div className={cn(PROPERTIES_SHELL, "flex min-h-0 flex-1 flex-col")}>
      {profileSite ? (
        <PropertyProfilePage
          site={profileSite}
          onBack={closeProfile}
          activeSectionId={profileSectionId}
          onActiveSectionChange={setProfileSectionId}
          settingsSubSectionId={settingsSubSectionId}
          onSettingsSubSectionChange={setSettingsSubSectionId}
          siteSettingsPanel={profileSettingsPanel}
          isTesting={isTesting === profileSite.id}
          isDetecting={isDetecting === profileSite.id}
          isFetchingScheduled={isFetchingScheduled === profileSite.id}
          isScrapingSitemap={isScrapingSitemap}
          isGeneratingEntities={isGeneratingEntities}
          isIndexingSitemap={isIndexingSitemap}
          isLoadingCalendar={isLoadingCalendar}
          isExtractingNAPAndGraph={Boolean(isExtractingNAPAndGraph[profileSite.id])}
          onTest={() => handleTestConnection(profileSite)}
          onDetect={() => handleDetectSitemaps(profileSite)}
          onScrapeChildSitemap={(url) => handleScrapeChildSitemap(profileSite, url)}
          onEntityGeneration={
            onEntityGeneration ? (sitemapUrl) => onEntityGeneration(profileSite, sitemapUrl) : undefined
          }
          onSetEntitySitemap={(sitemapUrl) => handleSetEntitySitemap(profileSite, sitemapUrl)}
          onSetCompetitorEntitySitemap={(sitemapUrl) => handleSetCompetitorEntitySitemap(profileSite, sitemapUrl)}
          onToggleChildSitemapDisabled={(childSitemapUrl) => handleToggleChildSitemapDisabled(profileSite, childSitemapUrl)}
          onAppendManualChildSitemap={(url) => handleAppendManualChildSitemap(profileSite, url)}
          onAddCustomSitemapTagLabel={(label) => handleAddCustomSitemapTagLabel(profileSite, label)}
          onToggleChildSystemRole={(childUrl, role) => handleToggleChildSystemRole(profileSite, childUrl, role)}
          onToggleChildCustomTag={(childUrl, label) => handleToggleChildCustomTag(profileSite, childUrl, label)}
          onIndexSitemap={(url) => handleIndexSitemap(profileSite, url)}
          onLoadCalendarPosts={(sitemapUrl) => handleLoadCalendarPosts(profileSite, sitemapUrl)}
          onExtractNAPAndGraph={() => void handleExtractNAPAndLinkGraph(profileSite)}
          getScrapingKey={getScrapingKey}
          onPatchSite={handlePatchSite}
          onSaveProperty={handleSaveSiteClick}
        />
      ) : (
      <div className="flex min-h-0 flex-1 flex-col">
      <WordPressSiteList
        sites={sites}
        filteredSites={tierFilteredSites}
        editorialPackageFilter={editorialPackageFilter}
        siteSearchQuery={siteSearchQuery}
        onSearchChange={setSiteSearchQuery}
        onOpenProfile={(site) => openProfile(site.id)}
        isTesting={isTesting}
        isDetecting={isDetecting}
        isFetchingScheduled={isFetchingScheduled}
        isScrapingSitemap={isScrapingSitemap}
        isIndexingSitemap={isIndexingSitemap}
        isGeneratingEntities={isGeneratingEntities}
        isExtractingNAPAndGraph={isExtractingNAPAndGraph}
        isLoadingCalendar={isLoadingCalendar}
        onTest={handleTestConnection}
        onToggleEnabled={handleToggleEnabled}
        onConnectSite={handleConnectSite}
        onDetect={handleDetectSitemaps}
        onEdit={handleEditSite}
        onDelete={handleDeleteSite}
        onScrapeChildSitemap={handleScrapeChildSitemap}
        onIndexSitemap={handleIndexSitemap}
        onEntityGeneration={onEntityGeneration}
        onSetEntitySitemap={handleSetEntitySitemap}
        onSetCompetitorEntitySitemap={handleSetCompetitorEntitySitemap}
        onToggleChildSitemapDisabled={handleToggleChildSitemapDisabled}
        onAppendManualChildSitemap={handleAppendManualChildSitemap}
        onLoadCalendarPosts={handleLoadCalendarPosts}
        onExtractNAPAndGraph={handleExtractNAPAndLinkGraph}
        getScrapingKey={getScrapingKey}
        selectedSiteIds={selectedSiteIds}
        onSelectAll={handleSelectAll}
        onSiteSelectedChange={handleSiteSelectedChange}
        onDeleteSelected={handleDeleteSelected}
        onPatchSite={handlePatchSite}
        quarterStatsBySite={quarterStatsBySite}
        optimizationStatsBySite={optimizationStatsBySite}
        editorialSelectedMonthKey={editorialSelectedMonthKey}
        editorialMonthOptions={editorialMonthOptions}
        onEditorialMonthChange={setEditorialSelectedMonthKey}
        propertyRowDisplay="compact"
      />
      </div>
      )}

      {/* Bulk Import Clients Dialog */}
      <BulkImportClientsDialog
        open={bulkImportDialogOpen}
        onOpenChange={setBulkImportDialogOpen}
        onAddBulk={async (clients) => {
          handleSaveSitesBulk(clients);
        }}
      />

      <WordPressDialogs
        isDialogOpen={isDialogOpen}
        onDialogOpenChange={setIsDialogOpen}
        editingSite={editingSite}
        formName={formName}
        formSiteUrl={formSiteUrl}
        formProductionSiteUrl={formProductionSiteUrl}
        formUsername={formUsername}
        formAppPassword={formAppPassword}
        formGa4PropertyId={formGa4PropertyId}
        formGoogleAdsCustomerId={formGoogleAdsCustomerId}
        formGbpLocationId={formGbpLocationId}
        formSemrushSiteAuditProjectId={formSemrushSiteAuditProjectId}
        formSemrushPositionTrackingProjectId={formSemrushPositionTrackingProjectId}
        formSemrushPositionTrackingCampaignId={formSemrushPositionTrackingCampaignId}
        formEditorialCountsPeriodStartYmd={formEditorialCountsPeriodStartYmd}
        formOptimizationPackage={formOptimizationPackage}
        formEditorialContentPackage={formEditorialContentPackage}
        formEditorialPublishTimeLocal={formEditorialPublishTimeLocal}
        formBenchmarkCustomTag={formBenchmarkCustomTag}
        formPrimaryLocalKeyword={formPrimaryLocalKeyword}
        formClientLogoUrl={formClientLogoUrl}
        formClientLogoBoxTheme={formClientLogoBoxTheme}
        formProfileTags={formProfileTags}
        formServiceCity={formServiceCity}
        formServiceState={formServiceState}
        formServiceCountry={formServiceCountry}
        onFormNameChange={setFormName}
        onFormSiteUrlChange={setFormSiteUrl}
        onFormProductionSiteUrlChange={setFormProductionSiteUrl}
        onFormUsernameChange={setFormUsername}
        onFormAppPasswordChange={setFormAppPassword}
        onFormGa4PropertyIdChange={setFormGa4PropertyId}
        onFormGoogleAdsCustomerIdChange={setFormGoogleAdsCustomerId}
        onFormGbpLocationIdChange={setFormGbpLocationId}
        onFormSemrushSiteAuditProjectIdChange={setFormSemrushSiteAuditProjectId}
        onFormSemrushPositionTrackingProjectIdChange={setFormSemrushPositionTrackingProjectId}
        onFormSemrushPositionTrackingCampaignIdChange={setFormSemrushPositionTrackingCampaignId}
        onFormEditorialCountsPeriodStartYmdChange={setFormEditorialCountsPeriodStartYmd}
        onFormOptimizationPackageChange={setFormOptimizationPackage}
        onFormEditorialContentPackageChange={setFormEditorialContentPackage}
        onFormEditorialPublishTimeLocalChange={setFormEditorialPublishTimeLocal}
        onFormBenchmarkCustomTagChange={setFormBenchmarkCustomTag}
        onFormPrimaryLocalKeywordChange={setFormPrimaryLocalKeyword}
        onFormClientLogoUrlChange={setFormClientLogoUrl}
        onFormClientLogoBoxThemeChange={setFormClientLogoBoxTheme}
        onFormProfileTagsChange={setFormProfileTags}
        onFormServiceCityChange={setFormServiceCity}
        onFormServiceStateChange={setFormServiceState}
        onFormServiceCountryChange={setFormServiceCountry}
        onSaveSite={handleSaveSiteClick}
        onPatchSite={handlePatchSite}
      />
    </div>
  );
};
