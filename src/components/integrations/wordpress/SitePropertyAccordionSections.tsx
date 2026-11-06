import type { ReactNode } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, ActionButton, Button, Field, RadioGroup, RadioGroupItem, SwitchField } from "@/ui";
import { Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WordPressSite } from "../types";
import { persistGbpLocationIdInput } from "@/lib/gbp-post/normalize-gbp-location-id";
import { isOptimizationPackageTier } from "@/lib/wordpress-optimization-package";
import { PropertyProfileTagPills } from "./PropertyProfileTagPills";
import { normalizeProfileTags } from "@/lib/wordpress-property-profile-tags";
import { WP_PANEL_INSET_BAND, WP_PANEL_LIST_GAP } from "./wordpress-panel-chrome";
import { BenchmarkCategoryTagField } from "./BenchmarkCategoryTagField";
import { PropertyClientLogoFields } from "./PropertyClientLogoFields";
import { ProfileAdditionalLocationsEditor, ProfileLocationSelect } from "./ProfileServiceAreaFields";
import { regionPlaceholder, SERVICE_COUNTRY_OPTIONS, serviceRegionOptions } from "@/lib/keyword-location-utils";
import { accordionContentClass, accordionItemClass, accordionTriggerClass, fieldsGridClass, IGNORE_CREDENTIAL_MANAGER, radioOptionLabelClass, SEMRUSH_MATCH_STATES, SITE_PROPERTY_COPY, stackedLabelClass, type SitePropertyFormChrome, type SitePropertySectionsProps } from "./site-property-form-chrome";

/** Field (label is its placeholder); optional help spans full tile width below. */
function FieldBlock({ field, help, chrome, span = "default" }: { field: ReactNode; help?: ReactNode; chrome: SitePropertyFormChrome; span?: "default" | "full" }) {
  return (
    <div className={cn("flex w-full flex-col gap-1 py-1.5", span === "full" && chrome === "light" && "sm:col-span-2")}>
      {field}
      {help ? <div className="w-full">{help}</div> : null}
    </div>
  );
}

export function SitePropertyAccordionSections(props: SitePropertySectionsProps) {
  const {
    chrome = "dark", formName, formSiteUrl, formProductionSiteUrl, formUsername, formAppPassword, formGa4PropertyId, formGoogleAdsCustomerId, formGbpLocationId,
    formSemrushSiteAuditProjectId, formSemrushPositionTrackingProjectId, formSemrushPositionTrackingCampaignId, formEditorialCountsPeriodStartYmd, formOptimizationPackage,
    formEditorialPublishTimeLocal, formBenchmarkCustomTag, formPrimaryLocalKeyword, formClientLogoUrl, formClientLogoBoxTheme = "black", formProfileTags, formServiceCity, formServiceState, formServiceCountry,
    onFormNameChange, onFormSiteUrlChange, onFormProductionSiteUrlChange, onFormUsernameChange, onFormAppPasswordChange, onFormGa4PropertyIdChange, onFormGoogleAdsCustomerIdChange, onFormGbpLocationIdChange,
    onFormSemrushSiteAuditProjectIdChange, onFormSemrushPositionTrackingProjectIdChange, onFormSemrushPositionTrackingCampaignIdChange, onFormEditorialCountsPeriodStartYmdChange, onFormOptimizationPackageChange,
    onFormEditorialPublishTimeLocalChange, onFormBenchmarkCustomTagChange, onFormPrimaryLocalKeywordChange, onFormClientLogoUrlChange, onFormClientLogoBoxThemeChange,
    onFormProfileTagsChange, onFormServiceCityChange, serviceAreaSite, onPatchSite, patchSiteId, className = "",
    hc, sh, semrushMatching, semrushBusy, canPatchSemrush, handleMatchSemrushProject, handlePushSemrushId, handleCopySiteId, persistServiceArea, applyServiceCountry, applyServiceState,
  } = props;

  return (
    <div className={cn("flex flex-col gap-0 py-1 font-sans text-base", className)}>
      <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
      <FieldBlock chrome={chrome} span="full" field={
          <BenchmarkCategoryTagField
            value={formBenchmarkCustomTag}
            onChange={onFormBenchmarkCustomTagChange}
            onCommit={(tag) => {
              if (onPatchSite && patchSiteId) {
                onPatchSite(patchSiteId, { benchmarkCustomTag: tag });
              }
            }}
            chrome={chrome}
          />
        } />
      <div className="py-2">
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
      <div className="py-2">
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
      <FieldBlock chrome={chrome} field={
          <Field
            id="primaryLocalKeyword"
            value={formPrimaryLocalKeyword}
            onChange={(e) => onFormPrimaryLocalKeywordChange(e.target.value)}
            onBlur={() => {
              if (onPatchSite && patchSiteId) {
                const kw = formPrimaryLocalKeyword.trim();
                onPatchSite(patchSiteId, { primaryLocalKeyword: kw || undefined });
              }
            }}
            placeholder="Primary keyword"
            autoComplete="off"
          />
        } />
      <FieldBlock chrome={chrome} field={
          <Field
            id="serviceCity"
            name="neo-pulse_service_city"
            value={formServiceCity}
            onChange={(e) => onFormServiceCityChange(e.target.value)}
            onBlur={() => persistServiceArea()}
            placeholder="Service city"
            autoComplete="address-level2"
          />
        } />
      <FieldBlock chrome={chrome} field={
          <ProfileLocationSelect
            placeholder="Country"
            value={formServiceCountry}
            options={SERVICE_COUNTRY_OPTIONS}
            onChange={applyServiceCountry}
          />
        } />
      <FieldBlock chrome={chrome} field={
          <ProfileLocationSelect
            placeholder={regionPlaceholder(formServiceCountry)}
            value={formServiceState}
            options={serviceRegionOptions(formServiceCountry)}
            onChange={applyServiceState}
            disabled={!formServiceCountry}
          />
        } />
      <div className={cn("w-full py-1.5", chrome === "light" && "sm:col-span-2")}>
        <ProfileAdditionalLocationsEditor
          site={serviceAreaSite}
          defaultCountry={formServiceCountry}
          defaultState={formServiceState}
          onPatchSite={onPatchSite}
          patchSiteId={patchSiteId}
        />
      </div>
      </form>
      <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
      <Accordion type="multiple" defaultValue={[]} className={cn("w-full", chrome === "light" && WP_PANEL_LIST_GAP)}>
        <AccordionItem value="wordpress" className={accordionItemClass(chrome)}>
          <AccordionTrigger className={accordionTriggerClass(chrome)}>WordPress & Credentials</AccordionTrigger>
          <AccordionContent className={accordionContentClass(chrome)}>
            <div className={fieldsGridClass(chrome)}>
            <FieldBlock chrome={chrome} field={
                <Field
                  id="name"
                  name="neo-pulse_property_label"
                  value={formName}
                  onChange={(e) => onFormNameChange(e.target.value)}
                  placeholder="Site Name"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              } />
            <FieldBlock chrome={chrome} field={
                <Field
                  id="wpApiUsername"
                  name="neo_pulse_wp_api_username"
                  value={formUsername}
                  onChange={(e) => onFormUsernameChange(e.target.value)}
                  placeholder="Username"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              } />
            <FieldBlock chrome={chrome} span="full" field={
                <Field
                  id="siteUrl"
                  name="neo-pulse_property_site_url"
                  value={formSiteUrl}
                  onChange={(e) => onFormSiteUrlChange(e.target.value)}
                  placeholder="Site URL (WordPress / REST)"
                  autoComplete="off"
                />
              }
              help={<p className={hc}>Used for Application Password API calls (staging is fine).</p>}
            />
            <FieldBlock chrome={chrome} span="full" field={
                <Field
                  id="productionSiteUrl"
                  name="neo-pulse_property_production_url"
                  value={formProductionSiteUrl}
                  onChange={(e) => onFormProductionSiteUrlChange(e.target.value)}
                  placeholder="Production URL (Optional)"
                  autoComplete="off"
                />
              }
              help={
                <p className={hc}>
                  Live site shown in Manager, research, and exports when it differs from the URL above.
                </p>
              } />
            <FieldBlock chrome={chrome} span="full" field={
                <Field
                  id="appPassword"
                  name="neo_pulse_wp_api_application_token"
                  type="password"
                  value={formAppPassword}
                  onChange={(e) => onFormAppPasswordChange(e.target.value)}
                  placeholder="Application Password"
                  {...IGNORE_CREDENTIAL_MANAGER}
                />
              }
              help={
                <p className={hc}>
                  Create an Application Password in WordPress: Users → Profile → Application Passwords
                </p>
              } />
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="analytics" className={accordionItemClass(chrome)}>
          <AccordionTrigger className={accordionTriggerClass(chrome)}>Analytics & Business Profile</AccordionTrigger>
          <AccordionContent className={accordionContentClass(chrome)}>
            <div className={fieldsGridClass(chrome)}>
            <FieldBlock chrome={chrome} field={
                <Field
                  id="ga4PropertyId"
                  type="text"
                  value={formGa4PropertyId}
                  onChange={(e) => onFormGa4PropertyIdChange(e.target.value)}
                  aria-label="GA4 Property ID"
                  placeholder="GA4 Property ID (Optional)"
                />
              }
              help={
                <p className={hc}>
                  Numeric ID from GA4 Admin → Property settings for this site. Used by the Test GA button on the site
                  tile.
                </p>
              } />
            <FieldBlock chrome={chrome} field={
                <Field
                  id="googleAdsCustomerId"
                  type="text"
                  value={formGoogleAdsCustomerId}
                  onChange={(e) => onFormGoogleAdsCustomerIdChange(e.target.value)}
                  aria-label="Google Ads customer ID"
                  placeholder="Google Ads customer ID"
                />
              } />
            <FieldBlock chrome={chrome} span="full" field={
                <Field
                  id="gbpLocationId"
                  type="text"
                  value={formGbpLocationId}
                  onChange={(e) => onFormGbpLocationIdChange(e.target.value)}
                  onBlur={() => {
                    const normalized = persistGbpLocationIdInput(formGbpLocationId);
                    if (normalized && normalized !== formGbpLocationId) {
                      onFormGbpLocationIdChange(normalized);
                    }
                  }}
                  aria-label="Google Business Profile Location ID"
                  placeholder="Google Business Profile Location ID (Optional)"
                />
              }
              help={
                <p className={hc}>
                  Paste the full profile URL (NEO Pulse uses <code className="rounded bg-muted px-1">fid=</code> when present, then{" "}
                  <code className="rounded bg-muted px-1">/n/...</code>), or use{" "}
                  <strong className={sh}>
                    Advanced settings → Copy ID
                  </strong>
                  . Connect Google Business with the account that owns this location.
                </p>
              } />
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="semrush" className={accordionItemClass(chrome)}>
          <AccordionTrigger className={accordionTriggerClass(chrome)}>Semrush & Editorial</AccordionTrigger>
          <AccordionContent className={accordionContentClass(chrome)}>
            <div className={fieldsGridClass(chrome)}>
            <FieldBlock chrome={chrome} span="full" field={
                <Field
                  id="semrushSiteAuditProjectId"
                  type="text"
                  value={formSemrushSiteAuditProjectId}
                  onChange={(e) => onFormSemrushSiteAuditProjectIdChange(e.target.value)}
                  placeholder="Semrush Site Audit Project ID (Optional)"
                />
              }
              help={
                <p className={hc}>
                  Paste the numeric project ID from your Semrush Projects URL, or use{" "}
                  <strong className={sh}>Match project from Semrush</strong> below (uses Site URL). Used by the Meta
                  Optimizer AUDIT action for page-level Site Audit data.
                </p>
              } />
            <FieldBlock chrome={chrome} field={
                <Field
                  id="semrushPositionTrackingProjectId"
                  type="text"
                  value={formSemrushPositionTrackingProjectId}
                  onChange={(e) => onFormSemrushPositionTrackingProjectIdChange(e.target.value)}
                  placeholder="Position Tracking project ID (Optional)"
                />
              } />
            <FieldBlock chrome={chrome} field={
                <Field
                  id="semrushPositionTrackingCampaignId"
                  type="text"
                  value={formSemrushPositionTrackingCampaignId}
                  onChange={(e) => onFormSemrushPositionTrackingCampaignIdChange(e.target.value)}
                  placeholder="Position Tracking campaign ID (Optional)"
                />
              } />
            <div
              className={cn(
                "flex w-full flex-col gap-1.5 py-1.5",
                chrome === "light" && "sm:col-span-2",
              )}
            >
              <span className={stackedLabelClass(chrome)}>Semrush tools</span>
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
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
                ) : null}
                <p className={cn(hc, "w-full")}>
                  {canPatchSemrush
                    ? "Match updates the field and saves immediately when this property already exists. Save project ID now pushes the current field value without using Save Property."
                    : "Match fills the project ID from your Semrush account; save the property to persist when adding a new site."}
                </p>
              </div>
            </div>
            <FieldBlock chrome={chrome} span="full" field={
                <Field
                  id="editorialCountsPeriodStartYmd"
                  type="date"
                  value={formEditorialCountsPeriodStartYmd}
                  onChange={(e) => onFormEditorialCountsPeriodStartYmdChange(e.target.value)}
                  placeholder="Editorial Counts Period Start (Optional)"
                />
              }
              help={
                <p className={hc}>
                  Editorial counts period start. When set, post and entity totals use rolling 3-month periods from this date. Leave blank to use calendar
                  quarters (Q1-Q4).
                </p>
              } />
            <div
              className={cn(
                "flex w-full flex-col gap-3 py-1.5",
                chrome === "light" && "sm:col-span-2",
              )}
            >
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
              <p className={cn("max-w-none", hc)}>
                When off, the sparkle count on the property tile is hidden and bulk runs are not capped
                (e.g. no 154/50).
              </p>
              {formOptimizationPackage?.trim() &&
              isOptimizationPackageTier(formOptimizationPackage.trim()) ? (
                <div className="flex w-full flex-col gap-1.5">
                  <span className={stackedLabelClass(chrome)}>Package tier</span>
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
                    className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-1"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="basic" id="opt-pkg-basic" />
                      <label htmlFor="opt-pkg-basic" className={radioOptionLabelClass(chrome)}>
                        Basic (50)
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="pro" id="opt-pkg-pro" />
                      <label htmlFor="opt-pkg-pro" className={radioOptionLabelClass(chrome)}>
                        Pro (100)
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="plus" id="opt-pkg-plus" />
                      <label htmlFor="opt-pkg-plus" className={radioOptionLabelClass(chrome)}>
                        Plus (200)
                      </label>
                    </div>
                  </RadioGroup>
                </div>
              ) : null}
            </div>
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="wordpress-plugin" className={accordionItemClass(chrome)}>
          <AccordionTrigger className={accordionTriggerClass(chrome)}>WordPress plugin</AccordionTrigger>
          <AccordionContent className={accordionContentClass(chrome)}>
            <div className="flex flex-col gap-4 pt-0.5">
              <p className={hc}>
                On the client site, open <strong className={sh}>NEO Pulse WP → Settings</strong>, paste this site ID, and
                click Connect.
              </p>
              <div
                className={cn(
                  WP_PANEL_INSET_BAND,
                  "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
                  chrome === "dark" && "bg-ui-field shadow-none",
                )}
              >
                <div className="w-full space-y-1">
                  <p className={cn("font-semibold", SITE_PROPERTY_COPY, chrome === "dark" ? "text-white" : "text-foreground")}>
                    Site ID
                  </p>
                  <p className={hc}>
                    {patchSiteId
                      ? "Copy into NEO Pulse WP → Settings on the client site."
                      : "Save the property first to lock in a site ID."}
                  </p>
                  {patchSiteId ? (
                    <p className={cn("break-all font-mono font-semibold", SITE_PROPERTY_COPY, chrome === "dark" ? "text-white" : "text-foreground")}>
                      {patchSiteId}
                    </p>
                  ) : null}
                </div>
                <Button icon={Copy} disabled={!patchSiteId} onClick={() => void handleCopySiteId()}>
                  Copy site ID
                </Button>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      </form>
    </div>
  );
}
