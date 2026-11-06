import React from "react";
import { ActionButton, Button, Field, RadioGroup, RadioGroupItem, SelectField, SwitchField } from "@/ui";
import { Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WordPressSite } from "../types";
import { persistGbpLocationIdInput } from "@/lib/gbp-post/normalize-gbp-location-id";
import { isEditorialContentPackageTier } from "@/lib/editorial-content-package";
import { isOptimizationPackageTier } from "@/lib/wordpress-optimization-package";
import { PropertyProfileTagPills } from "./PropertyProfileTagPills";
import { normalizeProfileTags } from "@/lib/wordpress-property-profile-tags";
import { TASK_FORM_FLAT_CONTROL_CLASS, TaskFormFlatField, TaskFormFlatGrid, TaskFormPlaceholderCell, TaskFormSideSection } from "@/components/manager/tasks/TaskFormLayout";
import type { PropertySettingsSubSectionId } from "./property-settings-types";
import { BenchmarkCategoryTagField } from "./BenchmarkCategoryTagField";
import { PropertyClientLogoFields } from "./PropertyClientLogoFields";
import { WpEngineHostingFields } from "./WpEngineHostingFields";
import { ProfileAdditionalLocationsEditor, ProfileLocationSelect } from "./ProfileServiceAreaFields";
import { regionPlaceholder, SERVICE_COUNTRY_OPTIONS, serviceRegionOptions } from "@/lib/keyword-location-utils";
import { EDITORIAL_PACKAGE_OPTIONS, IGNORE_CREDENTIAL_MANAGER, SEMRUSH_MATCH_STATES, type SitePropertySectionsProps } from "./site-property-form-chrome";

export function SitePropertyModalFlatSections(props: SitePropertySectionsProps) {
  const {
    formName, formSiteUrl, formProductionSiteUrl, formUsername, formAppPassword, formGa4PropertyId, formGoogleAdsCustomerId, formGbpLocationId,
    formSemrushSiteAuditProjectId, formSemrushPositionTrackingProjectId, formSemrushPositionTrackingCampaignId, formEditorialCountsPeriodStartYmd, formOptimizationPackage, formEditorialContentPackage,
    formEditorialPublishTimeLocal, formBenchmarkCustomTag, formPrimaryLocalKeyword, formClientLogoUrl, formClientLogoBoxTheme = "black", formProfileTags, formServiceCity, formServiceState, formServiceCountry,
    onFormNameChange, onFormSiteUrlChange, onFormProductionSiteUrlChange, onFormUsernameChange, onFormAppPasswordChange, onFormGa4PropertyIdChange, onFormGoogleAdsCustomerIdChange, onFormGbpLocationIdChange,
    onFormSemrushSiteAuditProjectIdChange, onFormSemrushPositionTrackingProjectIdChange, onFormSemrushPositionTrackingCampaignIdChange, onFormEditorialCountsPeriodStartYmdChange, onFormOptimizationPackageChange,
    onFormEditorialContentPackageChange, onFormEditorialPublishTimeLocalChange, onFormBenchmarkCustomTagChange, onFormPrimaryLocalKeywordChange, onFormClientLogoUrlChange, onFormClientLogoBoxThemeChange,
    onFormProfileTagsChange, onFormServiceCityChange, serviceAreaSite, onPatchSite, patchSiteId, className = "", settingsSubSectionId = "profile",
    semrushMatching, semrushBusy, canPatchSemrush, handleMatchSemrushProject, handlePushSemrushId, handleCopySiteId, persistServiceArea, applyServiceCountry, applyServiceState,
  } = props;

  const flatInputClass = TASK_FORM_FLAT_CONTROL_CLASS;

  const profileSection = (
    <TaskFormSideSection title="Profile">
      <TaskFormFlatGrid className="grid-cols-2">
        <TaskFormPlaceholderCell>
          <Field
            value={formName}
            onChange={(e) => onFormNameChange(e.target.value)}
            placeholder="Site name"
            aria-label="Site name"
            autoComplete="off"
          />
        </TaskFormPlaceholderCell>
        <TaskFormPlaceholderCell>
          <BenchmarkCategoryTagField
            value={formBenchmarkCustomTag}
            onChange={onFormBenchmarkCustomTagChange}
            onCommit={(tag) => {
              if (onPatchSite && patchSiteId) {
                onPatchSite(patchSiteId, { benchmarkCustomTag: tag });
              }
            }}
            chrome="dark"
            className={flatInputClass}
          />
        </TaskFormPlaceholderCell>
      </TaskFormFlatGrid>
      <div className="mt-2">
        <PropertyClientLogoFields
          formClientLogoUrl={formClientLogoUrl}
          onFormClientLogoUrlChange={onFormClientLogoUrlChange}
          formClientLogoBoxTheme={formClientLogoBoxTheme}
          onFormClientLogoBoxThemeChange={onFormClientLogoBoxThemeChange}
          siteForFetch={{
            siteUrl: formSiteUrl,
            productionSiteUrl: formProductionSiteUrl,
            name: formName,
          }}
          onPatchSite={onPatchSite}
          patchSiteId={patchSiteId}
        />
      </div>
      <div className="mt-2">
        <PropertyProfileTagPills
          value={formProfileTags}
          onChange={onFormProfileTagsChange}
          onCommit={(tags) => {
            if (onPatchSite && patchSiteId) {
              const normalized = normalizeProfileTags(tags);
              onPatchSite(patchSiteId, {
                profileTags: normalized.length ? normalized : undefined,
              });
            }
          }}
        />
      </div>
      <TaskFormFlatGrid className="grid-cols-2">
        <TaskFormPlaceholderCell>
          <Field
            value={formPrimaryLocalKeyword}
            onChange={(e) => onFormPrimaryLocalKeywordChange(e.target.value)}
            onBlur={() => {
              if (onPatchSite && patchSiteId) {
                const kw = formPrimaryLocalKeyword.trim();
                onPatchSite(patchSiteId, { primaryLocalKeyword: kw || undefined });
              }
            }}
            placeholder="Primary keyword"
            aria-label="Primary keyword"
            autoComplete="off"
          />
        </TaskFormPlaceholderCell>
        <TaskFormPlaceholderCell>
          <Field
            value={formServiceCity}
            onChange={(e) => onFormServiceCityChange(e.target.value)}
            onBlur={() => persistServiceArea()}
            placeholder="Service city"
            aria-label="Service city"
            name="neo-pulse_service_city"
            autoComplete="address-level2"
          />
        </TaskFormPlaceholderCell>
      </TaskFormFlatGrid>
      <TaskFormFlatGrid className="grid-cols-2">
        <TaskFormPlaceholderCell>
          <ProfileLocationSelect
            placeholder="Country"
            value={formServiceCountry}
            options={SERVICE_COUNTRY_OPTIONS}
            onChange={applyServiceCountry}
          />
        </TaskFormPlaceholderCell>
        <TaskFormPlaceholderCell>
          <ProfileLocationSelect
            placeholder={regionPlaceholder(formServiceCountry)}
            value={formServiceState}
            options={serviceRegionOptions(formServiceCountry)}
            onChange={applyServiceState}
            disabled={!formServiceCountry}
          />
        </TaskFormPlaceholderCell>
      </TaskFormFlatGrid>
      <ProfileAdditionalLocationsEditor
        site={serviceAreaSite}
        defaultCountry={formServiceCountry}
        defaultState={formServiceState}
        onPatchSite={onPatchSite}
        patchSiteId={patchSiteId}
      />
    </TaskFormSideSection>
  );

  const accessSection = (
    <TaskFormSideSection title="Access">
      <TaskFormFlatGrid className="grid-cols-2">
        <TaskFormPlaceholderCell>
          <Field
            value={formSiteUrl}
            onChange={(e) => onFormSiteUrlChange(e.target.value)}
            placeholder="Site URL (WordPress / REST)"
            aria-label="Site URL"
            autoComplete="off"
          />
        </TaskFormPlaceholderCell>
        <TaskFormPlaceholderCell>
          <Field
            value={formProductionSiteUrl}
            onChange={(e) => onFormProductionSiteUrlChange(e.target.value)}
            placeholder="Production URL (optional)"
            aria-label="Production URL"
            autoComplete="off"
          />
        </TaskFormPlaceholderCell>
        <TaskFormPlaceholderCell>
          <Field
            value={formUsername}
            onChange={(e) => onFormUsernameChange(e.target.value)}
            placeholder="Username"
            aria-label="Username"
            name="neo_pulse_wp_api_username"
            autoComplete="off"
          />
        </TaskFormPlaceholderCell>
        <TaskFormPlaceholderCell>
          <Field
            type="password"
            value={formAppPassword}
            onChange={(e) => onFormAppPasswordChange(e.target.value)}
            placeholder="Application password"
            aria-label="Application password"
            name="neo_pulse_wp_api_application_token"
            {...IGNORE_CREDENTIAL_MANAGER}
          />
        </TaskFormPlaceholderCell>
      </TaskFormFlatGrid>
    </TaskFormSideSection>
  );

  const integrationsSection = (
    <TaskFormSideSection title="Integrations">
      <TaskFormFlatGrid className="grid-cols-2">
        <TaskFormFlatField label="GA4 Property ID">
          <Field
            value={formGa4PropertyId}
            onChange={(e) => onFormGa4PropertyIdChange(e.target.value)}
            aria-label="GA4 Property ID"
            autoComplete="off"
            placeholder="GA4 Property ID"
          />
        </TaskFormFlatField>
        <TaskFormFlatField label="Google Ads customer ID">
          <Field
            value={formGoogleAdsCustomerId}
            onChange={(e) => onFormGoogleAdsCustomerIdChange(e.target.value)}
            aria-label="Google Ads customer ID"
            autoComplete="off"
            placeholder="Google Ads customer ID"
          />
        </TaskFormFlatField>
        <TaskFormFlatField label="GBP Location ID" className="sm:col-span-2">
          <Field
            value={formGbpLocationId}
            onChange={(e) => onFormGbpLocationIdChange(e.target.value)}
            onBlur={() => {
              const normalized = persistGbpLocationIdInput(formGbpLocationId);
              if (normalized && normalized !== formGbpLocationId) {
                onFormGbpLocationIdChange(normalized);
              }
            }}
            aria-label="GBP Location ID"
            autoComplete="off"
            placeholder="GBP Location ID"
          />
        </TaskFormFlatField>
        <TaskFormFlatField label="Semrush Site Audit Project ID" className="sm:col-span-2">
          <Field
            value={formSemrushSiteAuditProjectId}
            onChange={(e) => onFormSemrushSiteAuditProjectIdChange(e.target.value)}
            aria-label="Semrush Site Audit Project ID"
            autoComplete="off"
            placeholder="Semrush Site Audit Project ID"
          />
        </TaskFormFlatField>
        <TaskFormFlatField label="Position Tracking project ID">
          <Field
            value={formSemrushPositionTrackingProjectId}
            onChange={(e) => onFormSemrushPositionTrackingProjectIdChange(e.target.value)}
            placeholder="Position Tracking project ID"
            aria-label="Position Tracking project ID"
            autoComplete="off"
          />
        </TaskFormFlatField>
        <TaskFormFlatField label="Position Tracking campaign ID">
          <Field
            value={formSemrushPositionTrackingCampaignId}
            onChange={(e) => onFormSemrushPositionTrackingCampaignIdChange(e.target.value)}
            placeholder="Position Tracking campaign ID"
            aria-label="Position Tracking campaign ID"
            autoComplete="off"
          />
        </TaskFormFlatField>
        <WpEngineHostingFields site={serviceAreaSite} onPatchSite={onPatchSite} />
      </TaskFormFlatGrid>
      <div className="mt-1 flex flex-wrap items-center gap-2 px-1">
        <ActionButton
          variant="tool"
          states={SEMRUSH_MATCH_STATES}
          state={semrushMatching ? "Matching" : "Match project from Semrush"}
          disabled={semrushBusy || !formSiteUrl.trim()}
          onClick={() => void handleMatchSemrushProject()}
        />
        {canPatchSemrush ? (
          <Button disabled={semrushBusy} onClick={handlePushSemrushId}>
            Save project ID now
          </Button>
        ) : null}        </div>
    </TaskFormSideSection>
  );

  const editorialSection = (
    <TaskFormSideSection title="Editorial">
      <TaskFormFlatGrid className="grid-cols-2">
        <TaskFormPlaceholderCell>
          <Field
            type="date"
            value={formEditorialCountsPeriodStartYmd}
            onChange={(e) => onFormEditorialCountsPeriodStartYmdChange(e.target.value)}
            aria-label="Editorial counts period start"
            placeholder="Editorial counts period start"
          />
        </TaskFormPlaceholderCell>
        <TaskFormPlaceholderCell>
          <SelectField
            placeholder="Editorial package"
            width="full"
            value={formEditorialContentPackage || "__unset__"}
            options={EDITORIAL_PACKAGE_OPTIONS}
            onValueChange={(v) => {
              const next = v === "__unset__" ? "" : v;
              onFormEditorialContentPackageChange(next);
              if (onPatchSite && patchSiteId && (next === "" || isEditorialContentPackageTier(next))) {
                onPatchSite(patchSiteId, {
                  editorialContentPackage:
                    next && isEditorialContentPackageTier(next) ? next : undefined,
                });
              }
            }}
          />          </TaskFormPlaceholderCell>
        <TaskFormPlaceholderCell>
          <Field
            value={formEditorialPublishTimeLocal}
            onChange={(e) => onFormEditorialPublishTimeLocalChange(e.target.value)}
            placeholder="Publish time (HH:MM)"
            aria-label="Editorial publish time"
          />
        </TaskFormPlaceholderCell>
      </TaskFormFlatGrid>
      <div className="mt-2 flex flex-col gap-3 px-1">
        <SwitchField
          label="Optimization period limit"
          checked={Boolean(
            formOptimizationPackage?.trim() &&
              isOptimizationPackageTier(formOptimizationPackage.trim()),
          )}
          onCheckedChange={(checked) => {
              if (!checked) {
                onFormOptimizationPackageChange("");
                if (onPatchSite && patchSiteId) {
                  onPatchSite(patchSiteId, { optimizationPackage: undefined });
                }
                return;
              }
              const tier =
                formOptimizationPackage?.trim() &&
                isOptimizationPackageTier(formOptimizationPackage.trim())
                  ? formOptimizationPackage.trim()
                  : "basic";
              onFormOptimizationPackageChange(tier);
              if (onPatchSite && patchSiteId) {
                onPatchSite(patchSiteId, {
                  optimizationPackage: tier as WordPressSite["optimizationPackage"],
                });
              }
            }}
        />
        {formOptimizationPackage?.trim() &&
        isOptimizationPackageTier(formOptimizationPackage.trim()) ? (
          <RadioGroup
            value={formOptimizationPackage}
            onValueChange={(tier) => {
              onFormOptimizationPackageChange(tier);
              if (onPatchSite && patchSiteId && isOptimizationPackageTier(tier)) {
                onPatchSite(patchSiteId, {
                  optimizationPackage: tier as WordPressSite["optimizationPackage"],
                });
              }
            }}
            className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="basic" id="opt-pkg-basic-modal" />
              <label htmlFor="opt-pkg-basic-modal" className="text-base text-foreground">
                Basic (50)
              </label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="pro" id="opt-pkg-pro-modal" />
              <label htmlFor="opt-pkg-pro-modal" className="text-base text-foreground">
                Pro (100)
              </label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="plus" id="opt-pkg-plus-modal" />
              <label htmlFor="opt-pkg-plus-modal" className="text-base text-foreground">
                Plus (200)
              </label>
            </div>
          </RadioGroup>
        ) : null}
      </div>
    </TaskFormSideSection>
  );

  const provisioningSection = (
    <TaskFormSideSection title="Provisioning">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-base font-semibold text-foreground">WordPress plugin site ID</p>
            {patchSiteId ? (
              <p className="break-all font-mono text-base text-foreground">{patchSiteId}</p>
            ) : (
              <p className="text-base text-muted-foreground">Save the property first.</p>
            )}
          </div>
          <Button icon={Copy} disabled={!patchSiteId} onClick={() => void handleCopySiteId()}>
            Copy site ID
          </Button>
        </div>
      </div>
    </TaskFormSideSection>
  );

  const modalSections: Record<PropertySettingsSubSectionId, React.ReactNode> = {
    profile: profileSection,
    access: accessSection,
    integrations: integrationsSection,
    editorial: editorialSection,
    provisioning: provisioningSection,
  };

  return (
    <form
      className={cn("flex min-h-0 flex-1 flex-col gap-1 py-0 font-sans text-base", className)}
      autoComplete="off"
      onSubmit={(e) => e.preventDefault()}
    >
      {modalSections[settingsSubSectionId]}
    </form>
  );
}
