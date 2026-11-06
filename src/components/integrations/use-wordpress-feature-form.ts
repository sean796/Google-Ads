import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { loadApiKey } from "@/lib/api";
import { notify } from "@/lib/app-notifications";
import { resolveEditorialContentPackageForSite } from "@/lib/editorial-content-package";
import { normalizeGbpLocationIdInput } from "@/lib/gbp-post/normalize-gbp-location-id";
import { applyGbpPropertyWand } from "@/lib/wordpress-site-display-name-from-dfs-gmb";
import type { useWordPressSites } from "@/hooks/use-wordpress-sites";
import type { WordPressSiteAdminSectionId } from "./wordpress/WordPressSiteAdminLayout";
import type { PropertySettingsSubSectionId } from "./wordpress/property-settings-types";
import type { WordPressSite } from "./types";
import {
  fetchAndPersistMissingClientLogos,
  getStoredSites,
  mergeServerGbpLocationIdsIntoLocalSites,
} from "./storage";

type WordPressSitesApi = ReturnType<typeof useWordPressSites>;

export function useWordPressFeatureForm({
  sites,
  editorialPackageFilter,
  siteSearchQuery,
  handleAddSiteInit,
  handleEditSiteInit,
  handleSaveSite,
  handleDeleteSitesBulk,
  reloadSitesFromStorage,
}: {
  sites: WordPressSite[];
  editorialPackageFilter: "all" | "standard" | "lite" | "unassigned";
  siteSearchQuery: string;
  handleAddSiteInit: WordPressSitesApi["handleAddSite"];
  handleEditSiteInit: WordPressSitesApi["handleEditSite"];
  handleSaveSite: WordPressSitesApi["handleSaveSite"];
  handleDeleteSitesBulk: WordPressSitesApi["handleDeleteSitesBulk"];
  reloadSitesFromStorage: WordPressSitesApi["reloadSitesFromStorage"];
}) {
  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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
  const [formBenchmarkCustomTag, setFormBenchmarkCustomTag] = useState("");
  const [formPrimaryLocalKeyword, setFormPrimaryLocalKeyword] = useState("");
  const [formClientLogoUrl, setFormClientLogoUrl] = useState("");
  const [formClientLogoBoxTheme, setFormClientLogoBoxTheme] = useState<"black" | "white">("black");
  const [formProfileTags, setFormProfileTags] = useState<string[]>([]);
  const [formServiceCity, setFormServiceCity] = useState("");
  const [formServiceState, setFormServiceState] = useState("");
  const [formServiceCountry, setFormServiceCountry] = useState("");

  /**
   * Full property profile page (replaces the list while a property is open).
   */
  const [profileSiteId, setProfileSiteId] = useState<string | null>(null);
  const [profileSectionId, setProfileSectionId] =
    useState<WordPressSiteAdminSectionId>("overview");
  const [settingsSubSectionId, setSettingsSubSectionId] =
    useState<PropertySettingsSubSectionId>("profile");
  
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
      setFormOptimizationPackage("");
      setFormEditorialContentPackage("");
      setFormEditorialPublishTimeLocal("");
      setFormBenchmarkCustomTag(formData.benchmarkCustomTag ?? "");
      setFormPrimaryLocalKeyword(formData.primaryLocalKeyword ?? "");
      setFormClientLogoUrl("");
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
          if (r.ok === false) notify.error(r.error);
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
  return {
    isDialogOpen, setIsDialogOpen, editingSite,
    formName, formSiteUrl, formProductionSiteUrl, formUsername, formAppPassword,
    formGa4PropertyId, formGoogleAdsCustomerId, formGbpLocationId, formSemrushSiteAuditProjectId, formSemrushPositionTrackingProjectId,
    formSemrushPositionTrackingCampaignId, formEditorialCountsPeriodStartYmd, formOptimizationPackage, formEditorialContentPackage, formEditorialPublishTimeLocal,
    formBenchmarkCustomTag, formPrimaryLocalKeyword, formClientLogoUrl, formClientLogoBoxTheme,
    formProfileTags, formServiceCity, formServiceState, formServiceCountry,
    setFormName, setFormSiteUrl, setFormProductionSiteUrl, setFormUsername, setFormAppPassword,
    setFormGa4PropertyId, setFormGoogleAdsCustomerId, setFormGbpLocationId, setFormSemrushSiteAuditProjectId, setFormSemrushPositionTrackingProjectId,
    setFormSemrushPositionTrackingCampaignId, setFormEditorialCountsPeriodStartYmd, setFormOptimizationPackage, setFormEditorialContentPackage, setFormEditorialPublishTimeLocal,
    setFormBenchmarkCustomTag, setFormPrimaryLocalKeyword, setFormClientLogoUrl, setFormClientLogoBoxTheme,
    setFormProfileTags, setFormServiceCity, setFormServiceState, setFormServiceCountry,
    profileSite, profileSiteId, profileSectionId,
    setProfileSectionId, settingsSubSectionId, setSettingsSubSectionId,
    selectedSiteIds, filteredSites, tierFilteredSites, handleSelectAll, handleDeleteSelected,
    handleSiteSelectedChange, openProfile, closeProfile, handleAddSite, handleEditSite, handleSaveSiteClick,
  };
}
