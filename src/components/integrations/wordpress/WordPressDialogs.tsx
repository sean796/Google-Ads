import React from "react";
import { SiteDialog } from "./SiteDialog";
import type { WordPressSite } from "../types";

export interface WordPressSiteFormDialogsProps {
  isDialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  editingSite: WordPressSite | null;
  formName: string;
  formSiteUrl: string;
  formProductionSiteUrl: string;
  formUsername: string;
  formAppPassword: string;
  formGa4PropertyId: string;
  formGoogleAdsCustomerId: string;
  formGbpLocationId: string;
  formSemrushSiteAuditProjectId: string;
  formSemrushPositionTrackingProjectId: string;
  formSemrushPositionTrackingCampaignId: string;
  formEditorialCountsPeriodStartYmd: string;
  formOptimizationPackage: string;
  formEditorialContentPackage: string;
  formEditorialPublishTimeLocal: string;
  formBenchmarkCustomTag: string;
  formPrimaryLocalKeyword: string;
  formClientLogoUrl: string;
  formProfileTags: string[];
  formServiceCity: string;
  formServiceState: string;
  formServiceCountry: string;
  onFormNameChange: (name: string) => void;
  onFormSiteUrlChange: (url: string) => void;
  onFormProductionSiteUrlChange: (url: string) => void;
  onFormUsernameChange: (username: string) => void;
  onFormAppPasswordChange: (password: string) => void;
  onFormGa4PropertyIdChange: (value: string) => void;
  onFormGoogleAdsCustomerIdChange: (value: string) => void;
  onFormGbpLocationIdChange: (value: string) => void;
  onFormSemrushSiteAuditProjectIdChange: (value: string) => void;
  onFormSemrushPositionTrackingProjectIdChange: (value: string) => void;
  onFormSemrushPositionTrackingCampaignIdChange: (value: string) => void;
  onFormEditorialCountsPeriodStartYmdChange: (value: string) => void;
  onFormOptimizationPackageChange: (value: string) => void;
  onFormEditorialContentPackageChange: (value: string) => void;
  onFormEditorialPublishTimeLocalChange: (value: string) => void;
  onFormBenchmarkCustomTagChange: (value: string) => void;
  onFormPrimaryLocalKeywordChange: (value: string) => void;
  onFormClientLogoUrlChange: (value: string) => void;
  onFormProfileTagsChange: (tags: string[]) => void;
  onFormServiceCityChange: (value: string) => void;
  onFormServiceStateChange: (value: string) => void;
  onFormServiceCountryChange: (value: string) => void;
  onSaveSite: () => void;
  onPatchSite?: (siteId: string, patch: Partial<WordPressSite>) => void;
}

/** Add/Edit site only. Keyword selection is mounted in {@link WordPressOptimizationProvider}. */
export const WordPressDialogs: React.FC<WordPressSiteFormDialogsProps> = ({
  isDialogOpen,
  onDialogOpenChange,
  editingSite,
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
  onFormProfileTagsChange,
  onFormServiceCityChange,
  onFormServiceStateChange,
  onFormServiceCountryChange,
  onSaveSite,
  onPatchSite,
}) => {
  return (
    <SiteDialog
      open={isDialogOpen}
      onOpenChange={onDialogOpenChange}
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
      formProfileTags={formProfileTags}
      formServiceCity={formServiceCity}
      formServiceState={formServiceState}
      formServiceCountry={formServiceCountry}
      onFormNameChange={onFormNameChange}
      onFormSiteUrlChange={onFormSiteUrlChange}
      onFormProductionSiteUrlChange={onFormProductionSiteUrlChange}
      onFormUsernameChange={onFormUsernameChange}
      onFormAppPasswordChange={onFormAppPasswordChange}
      onFormGa4PropertyIdChange={onFormGa4PropertyIdChange}
      onFormGoogleAdsCustomerIdChange={onFormGoogleAdsCustomerIdChange}
      onFormGbpLocationIdChange={onFormGbpLocationIdChange}
      onFormSemrushSiteAuditProjectIdChange={onFormSemrushSiteAuditProjectIdChange}
      onFormSemrushPositionTrackingProjectIdChange={onFormSemrushPositionTrackingProjectIdChange}
      onFormSemrushPositionTrackingCampaignIdChange={onFormSemrushPositionTrackingCampaignIdChange}
      onFormEditorialCountsPeriodStartYmdChange={onFormEditorialCountsPeriodStartYmdChange}
      onFormOptimizationPackageChange={onFormOptimizationPackageChange}
      onFormEditorialContentPackageChange={onFormEditorialContentPackageChange}
      onFormEditorialPublishTimeLocalChange={onFormEditorialPublishTimeLocalChange}
      onFormBenchmarkCustomTagChange={onFormBenchmarkCustomTagChange}
      onFormPrimaryLocalKeywordChange={onFormPrimaryLocalKeywordChange}
      onFormClientLogoUrlChange={onFormClientLogoUrlChange}
      onFormProfileTagsChange={onFormProfileTagsChange}
      onFormServiceCityChange={onFormServiceCityChange}
      onFormServiceStateChange={onFormServiceStateChange}
      onFormServiceCountryChange={onFormServiceCountryChange}
      onSave={onSaveSite}
      onPatchSite={onPatchSite}
    />
  );
};
