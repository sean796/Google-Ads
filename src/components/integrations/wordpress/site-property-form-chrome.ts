import { cn } from "@/lib/utils";
import type { WordPressSite } from "../types";
import { WP_PANEL_ROW_TILE } from "./wordpress-panel-chrome";
import { EDITORIAL_CONTENT_PACKAGE_LABELS } from "@/lib/editorial-content-package";
import { type PropertySettingsSubSectionId } from "./property-settings-types";

export type SitePropertyFormChrome = "dark" | "light";

/** Lato + 1rem floor; copy wraps instead of truncating. */
export const SITE_PROPERTY_COPY = "font-sans text-base leading-normal whitespace-normal break-words";

/** Keep Chrome / password managers off property profile fields. */
export const IGNORE_CREDENTIAL_MANAGER = {
  autoComplete: "new-password" as const,
  "data-1p-ignore": true,
  "data-lpignore": "true" as const,
  "data-bwignore": "true" as const,
  "data-form-type": "other" as const,
};

export function stackedLabelClass(chrome: SitePropertyFormChrome): string {
  return cn(SITE_PROPERTY_COPY, "font-medium", chrome === "dark" ? "text-white" : "text-foreground");
}

export function fieldsGridClass(chrome: SitePropertyFormChrome): string {
  if (chrome === "light") {
    return "grid grid-cols-1 gap-x-4 gap-y-0 sm:grid-cols-2";
  }
  return "flex flex-col";
}

export function helpClass(chrome: SitePropertyFormChrome): string {
  return cn(SITE_PROPERTY_COPY, chrome === "dark" ? "text-white" : "text-muted-foreground");
}

export function strongHelpClass(chrome: SitePropertyFormChrome): string {
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
export function accordionItemClass(chrome: SitePropertyFormChrome): string {
  if (chrome === "light") {
    return cn(WP_PANEL_ROW_TILE, "border-b-0 !border-b-0 p-0 shadow-none");
  }
  return accordionItemBorder(chrome);
}

export function accordionTriggerClass(chrome: SitePropertyFormChrome): string {
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

export function accordionContentClass(chrome: SitePropertyFormChrome): string {
  return cn(
    "!text-base",
    chrome === "light" ? "[&>div]:px-3 [&>div]:pt-0 [&>div]:!pb-3" : "pb-2 pt-0",
  );
}

export function radioOptionLabelClass(chrome: SitePropertyFormChrome): string {
  return cn("cursor-pointer font-normal", SITE_PROPERTY_COPY, chrome === "dark" ? "text-white" : "text-foreground");
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

export const SEMRUSH_MATCH_STATES = ["Match project from Semrush", "Matching"] as const;
export const EDITORIAL_PACKAGE_OPTIONS = [
  { value: "__unset__", label: "No editorial package" },
  { value: "standard", label: EDITORIAL_CONTENT_PACKAGE_LABELS.standard },
  { value: "lite", label: EDITORIAL_CONTENT_PACKAGE_LABELS.lite },
];

export interface SitePropertySectionsProps extends SitePropertyFormFieldsProps {
  hc: string;
  sh: string;
  semrushMatching: boolean;
  semrushBusy: boolean;
  canPatchSemrush: boolean;
  handleMatchSemrushProject: () => Promise<void>;
  handlePushSemrushId: () => void;
  handleCopySiteId: () => Promise<void>;
  persistServiceArea: (city?: string, state?: string, country?: string) => void;
  applyServiceCountry: (country: string) => void;
  applyServiceState: (state: string) => void;
}
