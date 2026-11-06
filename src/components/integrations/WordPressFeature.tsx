import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { PROPERTIES_SHELL } from "./wordpress/wordpress-properties-surfaces";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { WordPressSiteList } from "./wordpress/WordPressSiteList";
import { WordPressDialogs } from "./wordpress/WordPressDialogs";
import { SitePropertyEditPanel } from "./wordpress/SitePropertyEditPanel";
import { PropertyProfilePage } from "./wordpress/PropertyProfilePage";
import { BulkImportClientsDialog } from "./wordpress/BulkImportClientsDialog";
import { useQuarterEditorialCounts } from "@/hooks/use-quarter-editorial-counts";
import { useOptimizationActivityCounts } from "@/hooks/use-optimization-activity-counts";
import type { WordPressSite } from "./types";
import {
  fetchAndPersistMissingClientLogos,
  getStoredSites,
  mergeServerGbpLocationIdsIntoLocalSites,
} from "./storage";
import { cn } from "@/lib/utils";
import { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import { useRegisterPropertiesDashboardToolbar } from "@/components/manager/dashboard/PropertiesDashboardChromeContext";
import { useWordPressFeatureForm } from "./use-wordpress-feature-form";
import { useWordPressFeatureActions } from "./use-wordpress-feature-actions";
import { WordPressFeatureToolbarActions } from "./WordPressFeatureToolbarActions";

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


  const { registerIntegrationSites } = useWordPressOptimization();

  useEffect(() => {
    registerIntegrationSites(sites);
  }, [sites, registerIntegrationSites]);

  const [bulkImportDialogOpen, setBulkImportDialogOpen] = useState(false);
  const [editorialPackageFilter, setEditorialPackageFilter] = useState<
    "all" | "standard" | "lite" | "unassigned"
  >("all");
  const [siteSearchQuery, setSiteSearchQuery] = useState<string>('');

  const {
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
  } = useWordPressFeatureForm({
    sites,
    editorialPackageFilter,
    siteSearchQuery,
    handleAddSiteInit,
    handleEditSiteInit,
    handleSaveSite,
    handleDeleteSitesBulk,
    reloadSitesFromStorage,
  });

  const {
    isExtractingNAPAndGraph,
    handleExportAllSitesCsv,
    handleExtractNAPAndLinkGraph,
    isBulkGmbNamesBusy,
    handleBulkApplyGmbDisplayNames,
  } = useWordPressFeatureActions({
    user,
    sites,
    filteredSites,
    credentialedSiteCount,
    quarterStatsAllLoaded,
    quarterStatsFingerprint,
    handlePatchSite,
  });

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

  const selectedCount = selectedSiteIds.size;
  const allSelected = tierFilteredSites.length > 0 && selectedCount === tierFilteredSites.length;
  const selectAllChecked: boolean | "indeterminate" =
    allSelected ? true : selectedCount > 0 ? "indeterminate" : false;

  const trailingToolbarActions = useMemo(
    () => (
      <WordPressFeatureToolbarActions
        editorialPackageFilter={editorialPackageFilter}
        setEditorialPackageFilter={setEditorialPackageFilter}
        editorialMonthOptions={editorialMonthOptions}
        editorialSelectedMonthKey={editorialSelectedMonthKey}
        setEditorialSelectedMonthKey={setEditorialSelectedMonthKey}
        credentialedSiteCount={credentialedSiteCount}
        isRefreshingAllQuarterCounts={isRefreshingAllQuarterCounts}
        isRefreshingAllOptimizationCounts={isRefreshingAllOptimizationCounts}
        refreshAllQuarterCounts={refreshAllQuarterCounts}
        refreshAllOptimizationCounts={refreshAllOptimizationCounts}
        handleExportAllSitesCsv={handleExportAllSitesCsv}
        sitesCount={sites.length}
        handleAddSite={handleAddSite}
        setBulkImportDialogOpen={setBulkImportDialogOpen}
      />
    ),
    [
      credentialedSiteCount,
      editorialPackageFilter,
      editorialMonthOptions,
      editorialSelectedMonthKey,
      setEditorialSelectedMonthKey,
      isRefreshingAllQuarterCounts,
      isRefreshingAllOptimizationCounts,
      refreshAllOptimizationCounts,
      refreshAllQuarterCounts,
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
