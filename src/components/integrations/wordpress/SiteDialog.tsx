import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type WordPressSite } from "../types";
import { SitePropertyFormFields } from "./SitePropertyFormFields";

interface SiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  formClientLogoBoxTheme?: "black" | "white";
  formProfileTags: string[];
  formServiceCity: string;
  formServiceState: string;
  formServiceCountry: string;
  onFormNameChange: (value: string) => void;
  onFormSiteUrlChange: (value: string) => void;
  onFormProductionSiteUrlChange: (value: string) => void;
  onFormUsernameChange: (value: string) => void;
  onFormAppPasswordChange: (value: string) => void;
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
  onFormClientLogoBoxThemeChange?: (theme: "black" | "white") => void;
  onFormProfileTagsChange: (tags: string[]) => void;
  onFormServiceCityChange: (value: string) => void;
  onFormServiceStateChange: (value: string) => void;
  onFormServiceCountryChange: (value: string) => void;
  onSave: () => void;
  onPatchSite?: (siteId: string, patch: Partial<WordPressSite>) => void;
}

export const SiteDialog: React.FC<SiteDialogProps> = ({
  open,
  onOpenChange,
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
  formClientLogoBoxTheme = "black",
  onFormClientLogoBoxThemeChange,
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
  onSave,
  onPatchSite,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl overflow-y-auto bg-card font-sans text-base text-foreground">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-foreground">
            {editingSite ? "Edit WordPress Site" : "Add WordPress Site"}
          </DialogTitle>
          <DialogDescription className="text-base text-muted-foreground whitespace-normal break-words">
            Enter your WordPress site details. Use an Application Password for authentication.
          </DialogDescription>
        </DialogHeader>
        <SitePropertyFormFields
          chrome="light"
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
          onFormClientLogoBoxThemeChange={onFormClientLogoBoxThemeChange}
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
          onPatchSite={onPatchSite}
          patchSiteId={editingSite?.id ?? null}
          serviceAreaSite={editingSite}
          semrushActionsDisabled={editingSite?.enabled === false}
          className="py-2"
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-red-400 text-red-400 hover:bg-red-400/10"
          >
            Cancel
          </Button>
          <Button type="button" onClick={onSave} className="bg-primary font-bold text-primary-foreground hover:bg-primary/90">
            {editingSite ? "Update" : "Add"} Site
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
