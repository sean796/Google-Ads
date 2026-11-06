import React, { useCallback, useState } from "react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_CLIPBOARD_UNAVAILABLE, NOTIFY_SAVE_THE_PROPERTY_FIRST_SO_IT_HAS_A_STAB_2, NOTIFY_SET_SITE_URL_WORDPRESS_REST_FIRST_THEN_T, NOTIFY_SITE_ID_COPIED, notifyMatchedSemrushProjectXXX } from "@/lib/notify-messages";
import { matchSemrushProjectForSite } from "@/lib/wordpress-api/semrush";
import { buildSiteLocationsPatch } from "@/lib/wordpress-api/site-service-area";
import { nextStateForCountry } from "@/lib/keyword-location-utils";
import { helpClass, strongHelpClass, type SitePropertyFormFieldsProps, type SitePropertySectionsProps } from "./site-property-form-chrome";
import { SitePropertyModalFlatSections } from "./SitePropertyModalFlatSections";
import { SitePropertyAccordionSections } from "./SitePropertyAccordionSections";

export const SitePropertyFormFields: React.FC<SitePropertyFormFieldsProps> = ({
  chrome = "dark",
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
  formClientLogoBoxTheme = "black",
  formProfileTags,
  formServiceCity,
  formServiceState,
  formServiceCountry,
  onFormNameChange,
  onFormSiteUrlChange,
  onFormProductionSiteUrlChange,
  onFormUsernameChange,
  onFormAppPasswordChange,
  onFormGa4PropertyIdChange,
  onFormGoogleAdsCustomerIdChange,
  onFormGbpLocationIdChange,
  onFormSemrushSiteAuditProjectIdChange,
  onFormSemrushPositionTrackingProjectIdChange,
  onFormSemrushPositionTrackingCampaignIdChange,
  onFormEditorialCountsPeriodStartYmdChange,
  onFormOptimizationPackageChange,
  onFormEditorialContentPackageChange,
  onFormEditorialPublishTimeLocalChange,
  onFormBenchmarkCustomTagChange,
  onFormPrimaryLocalKeywordChange,
  onFormClientLogoUrlChange,
  onFormClientLogoBoxThemeChange,
  onFormProfileTagsChange,
  onFormServiceCityChange,
  onFormServiceStateChange,
  onFormServiceCountryChange,
  serviceAreaSite,
  onPatchSite,
  patchSiteId,
  semrushActionsDisabled = false,
  className = "",
  layout = "accordion",
  settingsSubSectionId = "profile",
}) => {
  const hc = helpClass(chrome);
  const sh = strongHelpClass(chrome);
  const [semrushMatching, setSemrushMatching] = useState(false);

  const handleMatchSemrushProject = useCallback(async () => {
    const url = formSiteUrl.trim();
    if (!url) {
      notify.error(NOTIFY_SET_SITE_URL_WORDPRESS_REST_FIRST_THEN_T);
      return;
    }
    setSemrushMatching(true);
    try {
      const res = await matchSemrushProjectForSite(url);
      if (res.ok === true) {
        onFormSemrushSiteAuditProjectIdChange(res.projectId);
        if (onPatchSite && patchSiteId) {
          onPatchSite(patchSiteId, { semrushSiteAuditProjectId: res.projectId });
        }
        const label = res.matchedHost || res.projectName || res.projectId;
        const hint = res.ambiguous
          ? " Several projects matched this hostname; chose one (preferring Site Audit when possible)."
          : "";
        notify.success(notifyMatchedSemrushProjectXXX(res.projectId, label, hint));
      } else {
        notify.error(res.error);
        if (res.candidates?.length) {
           
          console.info("[Semrush] project candidates (no hostname match):", res.candidates);
        }
      }
    } finally {
      setSemrushMatching(false);
    }
  }, [formSiteUrl, onFormSemrushSiteAuditProjectIdChange, onPatchSite, patchSiteId]);

  const handlePushSemrushId = useCallback(() => {
    if (!onPatchSite || !patchSiteId) return;
    const v = formSemrushSiteAuditProjectId.trim();
    onPatchSite(patchSiteId, { semrushSiteAuditProjectId: v || undefined });
    notify.success(v ? "Project ID saved." : "Project ID cleared.");
  }, [formSemrushSiteAuditProjectId, onPatchSite, patchSiteId]);

  const semrushBusy = semrushMatching || semrushActionsDisabled;
  const canPatchSemrush = Boolean(onPatchSite && patchSiteId);

  const handleCopySiteId = useCallback(async () => {
    if (!patchSiteId) {
      notify.error(NOTIFY_SAVE_THE_PROPERTY_FIRST_SO_IT_HAS_A_STAB_2);
      return;
    }
    try {
      await navigator.clipboard.writeText(patchSiteId);
      notify.success(NOTIFY_SITE_ID_COPIED);
    } catch {
      notify.error(NOTIFY_CLIPBOARD_UNAVAILABLE);
    }
  }, [patchSiteId]);

  const persistServiceArea = useCallback(
    (city = formServiceCity, state = formServiceState, country = formServiceCountry) => {
      if (!onPatchSite || !patchSiteId || !serviceAreaSite) return;
      onPatchSite(patchSiteId, buildSiteLocationsPatch(serviceAreaSite, city, state, country));
    },
    [formServiceCity, formServiceState, formServiceCountry, onPatchSite, patchSiteId, serviceAreaSite],
  );

  const applyServiceCountry = useCallback(
    (country: string) => {
      const nextState = nextStateForCountry(formServiceState, country);
      onFormServiceCountryChange(country);
      if (nextState !== formServiceState) onFormServiceStateChange(nextState);
      persistServiceArea(formServiceCity, nextState, country);
    },
    [
      formServiceCity,
      formServiceState,
      onFormServiceCountryChange,
      onFormServiceStateChange,
      persistServiceArea,
    ],
  );

  const applyServiceState = useCallback(
    (state: string) => {
      onFormServiceStateChange(state);
      persistServiceArea(formServiceCity, state, formServiceCountry);
    },
    [formServiceCity, formServiceCountry, onFormServiceStateChange, persistServiceArea],
  );

  const sectionsProps: SitePropertySectionsProps = {
    chrome, formName, formSiteUrl, formProductionSiteUrl, formUsername, formAppPassword, formGa4PropertyId, formGoogleAdsCustomerId, formGbpLocationId,
    formSemrushSiteAuditProjectId, formSemrushPositionTrackingProjectId, formSemrushPositionTrackingCampaignId, formEditorialCountsPeriodStartYmd, formOptimizationPackage, formEditorialContentPackage,
    formEditorialPublishTimeLocal, formBenchmarkCustomTag, formPrimaryLocalKeyword, formClientLogoUrl, formClientLogoBoxTheme, formProfileTags, formServiceCity, formServiceState, formServiceCountry,
    onFormNameChange, onFormSiteUrlChange, onFormProductionSiteUrlChange, onFormUsernameChange, onFormAppPasswordChange, onFormGa4PropertyIdChange, onFormGoogleAdsCustomerIdChange, onFormGbpLocationIdChange,
    onFormSemrushSiteAuditProjectIdChange, onFormSemrushPositionTrackingProjectIdChange, onFormSemrushPositionTrackingCampaignIdChange, onFormEditorialCountsPeriodStartYmdChange, onFormOptimizationPackageChange,
    onFormEditorialContentPackageChange, onFormEditorialPublishTimeLocalChange, onFormBenchmarkCustomTagChange, onFormPrimaryLocalKeywordChange, onFormClientLogoUrlChange, onFormClientLogoBoxThemeChange,
    onFormProfileTagsChange, onFormServiceCityChange, onFormServiceStateChange, onFormServiceCountryChange, serviceAreaSite, onPatchSite, patchSiteId, semrushActionsDisabled, className, layout, settingsSubSectionId,
    hc, sh, semrushMatching, semrushBusy, canPatchSemrush, handleMatchSemrushProject, handlePushSemrushId, handleCopySiteId, persistServiceArea, applyServiceCountry, applyServiceState,
  };

  if (layout === "modalFlat") {
    return <SitePropertyModalFlatSections {...sectionsProps} />;
  }

  return <SitePropertyAccordionSections {...sectionsProps} />;
};
