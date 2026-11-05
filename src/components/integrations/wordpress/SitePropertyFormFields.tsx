import React, { useCallback, useState } from "react";
import { ActionButton, Button, Field, SelectField, SwitchField } from "@/ui";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/app-notifications";
import {
  NOTIFY_CLIPBOARD_UNAVAILABLE,
  NOTIFY_COPIED,
  NOTIFY_SAVE_THE_PROPERTY_FIRST_SO_IT_HAS_A_STAB,
  NOTIFY_SAVE_THE_PROPERTY_FIRST_SO_IT_HAS_A_STAB_2,
  NOTIFY_SET_SITE_URL_WORDPRESS_REST_FIRST_THEN_T,
  NOTIFY_SITE_ID_COPIED,
  notifyMatchedSemrushProjectXXX,
} from "@/lib/notify-messages";
import type { WordPressSite } from "../types";
import { matchSemrushProjectForSite } from "@/lib/wordpress-api/semrush";
import {
  EDITORIAL_CONTENT_PACKAGE_LABELS,
  isEditorialContentPackageTier,
} from "@/lib/editorial-content-package";
import { isOptimizationPackageTier } from "@/lib/wordpress-optimization-package";
import { persistGbpLocationIdInput } from "@/lib/gbp-post/normalize-gbp-location-id";
import { PropertyProfileTagPills } from "./PropertyProfileTagPills";
import { normalizeProfileTags } from "@/lib/wordpress-property-profile-tags";
import { WP_PANEL_INSET_BAND, WP_PANEL_LIST_GAP, WP_PANEL_ROW_TILE } from "./wordpress-panel-chrome";
import {
  TASK_FORM_FLAT_CONTROL_CLASS,
  TaskFormFlatField,
  TaskFormFlatGrid,
  TaskFormPlaceholderCell,
  TaskFormSideSection,
} from "@/components/manager/tasks/TaskFormLayout";
import { type PropertySettingsSubSectionId } from "./property-settings-types";
import { buildSiteLocationsPatch } from "@/lib/wordpress-api/site-service-area";
import { BenchmarkCategoryTagField } from "./BenchmarkCategoryTagField";
import { PropertyClientLogoFields } from "./PropertyClientLogoFields";
import { WpEngineHostingFields } from "./WpEngineHostingFields";
import {
  nextStateForCountry,
  ProfileAdditionalLocationsEditor,
  ProfileLocationSelect,
  regionPlaceholder,
  SERVICE_COUNTRY_OPTIONS,
  serviceRegionOptions,
} from "./ProfileServiceAreaFields";

export type SitePropertyFormChrome = "dark" | "light";

/** Lato + 1rem floor; copy wraps instead of truncating. */
const SITE_PROPERTY_COPY = "font-sans text-base leading-normal whitespace-normal break-words";

/** Keep Chrome / password managers off property profile fields. */
const IGNORE_CREDENTIAL_MANAGER = {
  autoComplete: "new-password" as const,
  "data-1p-ignore": true,
  "data-lpignore": "true" as const,
  "data-bwignore": "true" as const,
  "data-form-type": "other" as const,
};

function stackedLabelClass(chrome: SitePropertyFormChrome): string {
  return cn(SITE_PROPERTY_COPY, "font-medium", chrome === "dark" ? "text-white" : "text-foreground");
}

function fieldsGridClass(chrome: SitePropertyFormChrome): string {
  if (chrome === "light") {
    return "grid grid-cols-1 gap-x-4 gap-y-0 sm:grid-cols-2";
  }
  return "flex flex-col";
}

function helpClass(chrome: SitePropertyFormChrome): string {
  return cn(SITE_PROPERTY_COPY, chrome === "dark" ? "text-white" : "text-muted-foreground");
}

function strongHelpClass(chrome: SitePropertyFormChrome): string {
  return chrome === "dark" ? "font-semibold text-white" : "font-semibold text-foreground";
}

function inlineCodeClass(chrome: SitePropertyFormChrome): string {
  return cn(
    SITE_PROPERTY_COPY,
    "rounded-md px-1.5 py-0.5 font-mono font-medium",
    chrome === "dark" ? "bg-white/12 text-white/95" : "bg-background text-foreground ring-1 ring-border/60",
  );
}

function accordionItemBorder(chrome: SitePropertyFormChrome): string {
  return cn("border-b", chrome === "dark" ? "border-white/10" : "border-border");
}

/** Sitemap-style inset tiles when using theme (light) chrome. */
function accordionItemClass(chrome: SitePropertyFormChrome): string {
  if (chrome === "light") {
    return cn(WP_PANEL_ROW_TILE, "border-b-0 !border-b-0 p-0 shadow-none");
  }
  return accordionItemBorder(chrome);
}

function accordionTriggerClass(chrome: SitePropertyFormChrome): string {
  if (chrome === "dark") {
    return cn(
      "min-h-10 items-center py-1.5 text-left hover:no-underline [&[data-state=open]>svg]:text-current text-white",
      SITE_PROPERTY_COPY,
    );
  }
  return cn(
    "min-h-10 items-center px-3 py-2 text-left font-medium text-foreground hover:no-underline [&[data-state=open]>svg]:text-foreground",
    SITE_PROPERTY_COPY,
  );
}

function accordionContentClass(chrome: SitePropertyFormChrome): string {
  return cn(
    "!text-base",
    chrome === "light" ? "[&>div]:px-3 [&>div]:pt-0 [&>div]:!pb-3" : "pb-2 pt-0",
  );
}

function radioOptionLabelClass(chrome: SitePropertyFormChrome): string {
  return cn("cursor-pointer font-normal", SITE_PROPERTY_COPY, chrome === "dark" ? "text-white" : "text-foreground");
}

/** Field (label is its placeholder); optional help spans full tile width below. */
function FieldBlock({
  field,
  help,
  chrome,
  span = "default",
}: {
  field: React.ReactNode;
  help?: React.ReactNode;
  chrome: SitePropertyFormChrome;
  /** `full` spans both grid columns in light (modal) chrome. */
  span?: "default" | "full";
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1 py-1.5",
        span === "full" && chrome === "light" && "sm:col-span-2",
      )}
    >
      {field}
      {help ? <div className="w-full">{help}</div> : null}
    </div>
  );
}
export interface SitePropertyFormFieldsProps {
  /** Dark sheet (embedded site settings) vs light card (modal). */
  chrome?: SitePropertyFormChrome;
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
  /** Empty string = no package (unlimited). */
  formOptimizationPackage: string;
  /** Empty string = unset editorial package. */
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
  /** Site row used when persisting service city on blur. */
  serviceAreaSite?: WordPressSite | null;
  /**
   * When set with `patchSiteId`, "Match project from Semrush" / "Save project ID now" persist immediately
   * (embedded Site Settings or edit dialog). Otherwise Match only fills the field until you save the property.
   */
  onPatchSite?: (siteId: string, patch: Partial<WordPressSite>) => void;
  patchSiteId?: string | null;
  /** When true, Semrush buttons are disabled (e.g. property toggled off). */
  semrushActionsDisabled?: boolean;
  /** Extra classes on the root form element (e.g. compact vs dialog spacing). */
  className?: string;
  layout?: "accordion" | "modalFlat";
  settingsSubSectionId?: PropertySettingsSubSectionId;
}

const SEMRUSH_MATCH_STATES = ["Match project from Semrush", "Matching"] as const;
const EDITORIAL_PACKAGE_OPTIONS = [
  { value: "__unset__", label: "No editorial package" },
  { value: "standard", label: EDITORIAL_CONTENT_PACKAGE_LABELS.standard },
  { value: "lite", label: EDITORIAL_CONTENT_PACKAGE_LABELS.lite },
];

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
      if (res.ok) {
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
          // eslint-disable-next-line no-console
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

  if (layout === "modalFlat") {
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

  return (
    <div className={cn("flex flex-col gap-0 py-1 font-sans text-base", className)}>
      <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
      <FieldBlock
        chrome={chrome}
        span="full"
        field={
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
        }
      />

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

      <FieldBlock
        chrome={chrome}
        field={
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
        }
      />

      <FieldBlock
        chrome={chrome}
        field={
          <Field
            id="serviceCity"
            name="neo-pulse_service_city"
            value={formServiceCity}
            onChange={(e) => onFormServiceCityChange(e.target.value)}
            onBlur={() => persistServiceArea()}
            placeholder="Service city"
            autoComplete="address-level2"
          />
        }
      />

      <FieldBlock
        chrome={chrome}
        field={
          <ProfileLocationSelect
            placeholder="Country"
            value={formServiceCountry}
            options={SERVICE_COUNTRY_OPTIONS}
            onChange={applyServiceCountry}
          />
        }
      />

      <FieldBlock
        chrome={chrome}
        field={
          <ProfileLocationSelect
            placeholder={regionPlaceholder(formServiceCountry)}
            value={formServiceState}
            options={serviceRegionOptions(formServiceCountry)}
            onChange={applyServiceState}
            disabled={!formServiceCountry}
          />
        }
      />

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
            <FieldBlock
        chrome={chrome}
        field={
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
              }
            />

            <FieldBlock
        chrome={chrome}
        field={
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
              }
            />

            <FieldBlock
        chrome={chrome}
        span="full"
        field={
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

            <FieldBlock
        chrome={chrome}
        span="full"
        field={
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
              }
            />

            <FieldBlock
        chrome={chrome}
        span="full"
        field={
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
              }
            />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="analytics" className={accordionItemClass(chrome)}>
          <AccordionTrigger className={accordionTriggerClass(chrome)}>Analytics & Business Profile</AccordionTrigger>
          <AccordionContent className={accordionContentClass(chrome)}>
            <div className={fieldsGridClass(chrome)}>
            <FieldBlock
        chrome={chrome}
        field={
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
              }
            />

            <FieldBlock
        chrome={chrome}
        field={
                <Field
                  id="googleAdsCustomerId"
                  type="text"
                  value={formGoogleAdsCustomerId}
                  onChange={(e) => onFormGoogleAdsCustomerIdChange(e.target.value)}
                  aria-label="Google Ads customer ID"
                  placeholder="Google Ads customer ID"
                />
              }
            />

            <FieldBlock
        chrome={chrome}
        span="full"
        field={
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
              }
            />
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="semrush" className={accordionItemClass(chrome)}>
          <AccordionTrigger className={accordionTriggerClass(chrome)}>Semrush & Editorial</AccordionTrigger>
          <AccordionContent className={accordionContentClass(chrome)}>
            <div className={fieldsGridClass(chrome)}>
            <FieldBlock
        chrome={chrome}
        span="full"
        field={
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
              }
            />

            <FieldBlock
        chrome={chrome}
        field={
                <Field
                  id="semrushPositionTrackingProjectId"
                  type="text"
                  value={formSemrushPositionTrackingProjectId}
                  onChange={(e) => onFormSemrushPositionTrackingProjectIdChange(e.target.value)}
                  placeholder="Position Tracking project ID (Optional)"
                />
              }
            />

            <FieldBlock
        chrome={chrome}
        field={
                <Field
                  id="semrushPositionTrackingCampaignId"
                  type="text"
                  value={formSemrushPositionTrackingCampaignId}
                  onChange={(e) => onFormSemrushPositionTrackingCampaignIdChange(e.target.value)}
                  placeholder="Position Tracking campaign ID (Optional)"
                />
              }
            />

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

            <FieldBlock
        chrome={chrome}
        span="full"
        field={
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
              }
            />

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
};
