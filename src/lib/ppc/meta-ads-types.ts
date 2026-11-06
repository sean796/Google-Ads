import { NEO_PULSE_PRODUCT_URL } from "@/lib/ppc/neo-pulse-meta-marketing-context";
import type { MetaAdTypographyStyle } from "@/lib/ppc/meta-ad-typography-styles";
import type { PpcWpPageContext } from "@/lib/ppc/google-ads-types";
import type { MetaAdImageReferenceSummary } from "@/lib/ppc/meta-ad-image-reference-types";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import type { MetaAdCta } from "@/lib/ppc/meta-ads-field-limits";

export type MetaAdContextSource = "neo-pulse_app" | "custom";

export type MetaAdPlacement = "feed_1x1" | "feed_4x5" | "story_9x16";

export type MetaAdRowStatus = "idle" | "generating" | "ready" | "error";

export type MetaAdBlueprint = {
  angle: string;
  audience: string;
  hook: string;
  visualDirection: string;
};

export type MetaAdCreativeMode = "agency_service" | "product_saas" | "local_lead";

export type MetaAdCreativeStyle = "designed_graphic" | "photo_hero";

export type MetaAdVisualReferenceKind = "layout" | "device" | "prop" | "scene" | "map";

export type MetaAdVisualToolKey =
  | "typography"
  | "icon_cluster"
  | "accent_shapes"
  | "city_skyline"
  | "device_screen"
  | "people"
  | "map_overlay"
  | "gradient_panel"
  | "photo_focal";

export type { MetaAdTypographyStyle } from "@/lib/ppc/meta-ad-typography-styles";

export type MetaAdVisualToolWeight = { chance: number; degree: number };

export type MetaAdVisualToolPalette = Record<MetaAdVisualToolKey, MetaAdVisualToolWeight>;

export type MetaAdColorPalette = {
  background?: string;
  accent?: string;
  primary?: string;
};

export type MetaAdColorThemeId = "neo-pulse-dark" | "neo-pulse-light" | "neon-contrast";

export type MetaAdVisualToolThemeId =
  | "openrouter"
  | "typography-icons"
  | "skyline-local"
  | "device-vignette"
  | "icon-graphic"
  | "photo-hero"
  | "map-local";

export type MetaAdDeviceScreenLayout =
  | "elementor_editor"
  | "wordpress_admin"
  | "published_homepage"
  | "published_service_page"
  | "neo_pulse_dashboard"
  | "none";

export type MetaAdCreativeBrief = {
  strategyStatement: string;
  captionHook: string;
  onImageHeadline: string;
  onImageSubline: string;
  visualConcept: string;
  visualVibe: string;
  backgroundTreatment: string;
  useMapOverlay: boolean;
  creativeStyle: MetaAdCreativeStyle;
  visualToolPalette: MetaAdVisualToolPalette;
  deviceScreenLayout?: MetaAdDeviceScreenLayout;
  referenceAdPattern?: string;
};

export type MetaAdInstagramGoal = {
  goalStatement: string;
  primaryTopic: string;
  audience: string;
  adAngle: string;
  hook: string;
  visualDirection: string;
  creativeMode: MetaAdCreativeMode;
  onImageTextHint?: string;
  referenceQueries: string[];
};

export type MetaAdVisualReferenceElement = {
  id: string;
  label: string;
  kind: MetaAdVisualReferenceKind;
  googleImageQuery: string;
  acceptanceBrief: string;
  pickCount?: number;
};

export type MetaAdResearchSectionStatus = "waiting" | "running" | "done" | "error";

export type MetaAdResearchSection = {
  id: string;
  title: string;
  status: MetaAdResearchSectionStatus;
  markdown?: string;
};

export type MetaAdChecklistItem = {
  id: string;
  label: string;
  detail?: string;
};

export type MetaAdCopy = {
  primaryText: string;
  headline: string;
  description: string;
  cta: MetaAdCta;
  finalUrl: string;
};

export type MetaAdCreative = {
  imagePreviewUrl?: string | null;
  imageBase64?: string | null;
  aspectRatio: MetaAdPlacement;
};

export type MetaGenerateConfig = {
  adCount: number;
  placement: MetaAdPlacement;
  includeImage: boolean;
  defaultColorPalette: MetaAdColorPalette;
  defaultVisualToolPalette: MetaAdVisualToolPalette;
  defaultTypographyStyle?: MetaAdTypographyStyle;
};

export type MetaAdRow = {
  id: string;
  adName: string;
  focusKeyword?: string;
  contextSource?: MetaAdContextSource;
  contextUrl?: string;
  landingPageUrl?: string;
  allowPeopleInImage?: boolean;
  imagePromptModifier?: string;
  fbInstagramContent?: string;
  typographyStyle?: MetaAdTypographyStyle;
  colorPalette?: MetaAdColorPalette;
  visualToolPalette?: MetaAdVisualToolPalette;
  status: MetaAdRowStatus;
  createdAt: string;
  config?: MetaGenerateConfig;
  blueprint?: MetaAdBlueprint;
  instagramGoal?: MetaAdInstagramGoal;
  creativeBrief?: MetaAdCreativeBrief;
  visualReferenceElements?: MetaAdVisualReferenceElement[];
  researchSections?: MetaAdResearchSection[];
  copyChecklist?: MetaAdChecklistItem[];
  copy?: MetaAdCopy;
  imageChecklist?: MetaAdChecklistItem[];
  creative?: MetaAdCreative;
  imagePromptDescription?: string;
  imageReferences?: MetaAdImageReferenceSummary[];
  errorMessage?: string;
};

/** Fields read by meta ad deliverable builders (shared by MetaAdRow and SocialCreatorRow). */
export type MetaAdDeliverableRow = {
  adName?: string;
  focusKeyword?: string;
  config?: { placement?: MetaAdPlacement };
  copy?: MetaAdCopy;
  creative?: MetaAdCreative;
  researchSections?: MetaAdResearchSection[];
  imagePromptDescription?: string;
};

export const META_AD_COUNT_MIN = 1;
export const META_AD_COUNT_MAX = 20;
export const META_DEFAULT_AD_COUNT = 1;

export function clampMetaAdCount(n: number): number {
  return Math.min(META_AD_COUNT_MAX, Math.max(META_AD_COUNT_MIN, Math.round(n)));
}

export function createMetaAdRowId(): string {
  return `ppc-meta-ad-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createIdleMetaAdRow(): MetaAdRow {
  return {
    id: createMetaAdRowId(),
    adName: "",
    focusKeyword: "",
    contextSource: "custom",
    contextUrl: "",
    landingPageUrl: "",
    status: "idle",
    createdAt: "",
  };
}

export function resolveMetaRowContextSource(row: Pick<MetaAdRow, "contextSource">): MetaAdContextSource {
  return row.contextSource === "neo-pulse_app" ? "neo-pulse_app" : "custom";
}

export function resolveMetaRowContextUrl(row: Pick<MetaAdRow, "contextSource" | "contextUrl">): string {
  if (resolveMetaRowContextSource(row) === "neo-pulse_app") {
    return NEO_PULSE_PRODUCT_URL;
  }
  return row.contextUrl?.trim() ?? "";
}

export function resolveMetaRowFocusKeyword(row: MetaAdDeliverableRow): string {
  if (row.focusKeyword !== undefined) return row.focusKeyword;
  return row.copy?.headline?.trim() ?? row.adName?.trim() ?? "";
}

export function resolveMetaRowLandingPageUrl(row: MetaAdRow): string {
  if (row.landingPageUrl !== undefined) return row.landingPageUrl;
  return row.copy?.finalUrl?.trim() ?? "";
}

export function resolveMetaRowAdName(row: MetaAdDeliverableRow): string {
  if (row.adName !== undefined) return row.adName;
  const keyword = resolveMetaRowFocusKeyword(row);
  return keyword.trim() || row.copy?.headline?.trim() || "";
}

export function metaRowUserInputPreserve(
  row: MetaAdRow,
): Partial<
  Pick<
    MetaAdRow,
    | "focusKeyword"
    | "adName"
    | "contextSource"
    | "contextUrl"
    | "landingPageUrl"
    | "allowPeopleInImage"
    | "imagePromptModifier"
    | "fbInstagramContent"
    | "typographyStyle"
    | "colorPalette"
    | "visualToolPalette"
  >
> {
  return {
    focusKeyword: row.focusKeyword,
    adName: row.adName,
    contextSource: row.contextSource,
    contextUrl: row.contextUrl,
    landingPageUrl: row.landingPageUrl,
    allowPeopleInImage: row.allowPeopleInImage,
    imagePromptModifier: row.imagePromptModifier,
    fbInstagramContent: row.fbInstagramContent,
    typographyStyle: row.typographyStyle,
    colorPalette: row.colorPalette,
    visualToolPalette: row.visualToolPalette,
  };
}

export function metaRowPatchFromGenerated(
  blueprint: MetaAdBlueprint,
  copy: MetaAdCopy,
  _creative?: MetaAdCreative,
  preserve?: Partial<
    Pick<MetaAdRow, "focusKeyword" | "adName" | "contextSource" | "contextUrl" | "landingPageUrl">
  >,
): Pick<MetaAdRow, "focusKeyword" | "adName" | "contextSource" | "contextUrl" | "landingPageUrl"> {
  const focusKeyword = preserve?.focusKeyword ?? copy.headline.trim();
  const landingPageUrl = preserve?.landingPageUrl ?? copy.finalUrl.trim();
  const adName =
    preserve?.adName !== undefined
      ? preserve.adName
      : focusKeyword.trim() || blueprint.hook.trim() || copy.headline.trim();

  return {
    focusKeyword,
    adName,
    contextSource: preserve?.contextSource,
    contextUrl: preserve?.contextUrl,
    landingPageUrl,
  };
}

export function metaAdStatusLabel(status: MetaAdRowStatus): string {
  switch (status) {
    case "idle":
      return "Not generated";
    case "generating":
      return "Generating";
    case "ready":
      return "";
    case "error":
      return "Error";
    default:
      return "Not generated";
  }
}

export function metaGoalToBlueprint(goal: MetaAdInstagramGoal): MetaAdBlueprint {
  return {
    angle: goal.adAngle,
    audience: goal.audience,
    hook: goal.hook,
    visualDirection: goal.visualDirection,
  };
}

export function metaPlacementToImageAspectRatio(
  placement: MetaAdPlacement,
): "1:1" | "3:4" | "9:16" {
  switch (placement) {
    case "feed_1x1":
      return "1:1";
    case "feed_4x5":
      return "3:4";
    case "story_9x16":
      return "9:16";
    default:
      return "1:1";
  }
}

export function findMetaLandingPageContext(
  pages: PpcWpPageContext[],
  url: string,
): PpcWpPageContext | undefined {
  const key = normalizePageUrlKey(url);
  return pages.find((page) => normalizePageUrlKey(page.url) === key);
}
