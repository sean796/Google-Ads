import type { WordPressSite } from "@/components/integrations/types";
import {
  patchMetaGenerateGranularStep,
  type MetaGenerateGranularStepId,
  type SocialGenerateProgressState,
  type MetaGenerateStepId,
} from "@/lib/social/social-creator-progress-types";
import {
  syncMetaMergedResearchSections,
} from "@/lib/ppc/meta-ad-research-sections";
import type { MetaAdTypographyStyle } from "@/lib/ppc/meta-ad-typography-styles";
import {
  type MetaAdBlueprint,
  type MetaAdChecklistItem,
  type MetaAdContextSource,
  type MetaAdCopy,
  type MetaAdCreative,
  type MetaAdCreativeBrief,
  type MetaAdInstagramGoal,
  type MetaAdResearchSection,
  type MetaAdVisualReferenceElement,
  type SocialGenerateConfig,
  type SocialCreatorRow,
  type MetaAdColorPalette,
} from "@/lib/social/social-creator-types";
import type { MetaAdImageReferenceSummary } from "@/lib/ppc/meta-ad-image-reference-types";

export type RunSocialCreatorGenerateResult = {
  goal: MetaAdInstagramGoal;
  creativeBrief: MetaAdCreativeBrief;
  blueprint: MetaAdBlueprint;
  copyChecklist: MetaAdChecklistItem[];
  fbInstagramContent: string;
  imageChecklist?: MetaAdChecklistItem[];
  visualReferenceElements?: MetaAdVisualReferenceElement[];
  creative?: MetaAdCreative;
  imagePromptDescription?: string;
  imageReferences: MetaAdImageReferenceSummary[];
  researchSections: MetaAdResearchSection[];
};

export type MetaAdGeneratePartialUpdate = Partial<
  Pick<
    SocialCreatorRow,
    | "instagramGoal"
    | "creativeBrief"
    | "blueprint"
    | "copyChecklist"
    | "fbInstagramContent"
    | "imageChecklist"
    | "visualReferenceElements"
    | "imageReferences"
    | "creative"
    | "imagePromptDescription"
    | "researchSections"
  >
>;

export type RunSocialCreatorGenerateOptions = {
  site: WordPressSite;
  apiKey: string;
  model: string;
  config: SocialGenerateConfig;
  focusKeyword?: string;
  contextSource?: MetaAdContextSource;
  contextUrl?: string;
  landingPageUrl?: string;
  allowPeopleInImage?: boolean;
  imagePromptModifier?: string;
  fbInstagramContent?: string;
  typographyStyle?: MetaAdTypographyStyle;
  colorPalette?: MetaAdColorPalette;
  visualToolPalette?: MetaAdCreativeBrief["visualToolPalette"];
  teamName?: string | null;
  onProgress: (progress: SocialGenerateProgressState) => void;
  onResearchSections?: (sections: MetaAdResearchSection[]) => void;
  onPartialUpdate?: (patch: MetaAdGeneratePartialUpdate) => void;
  signal?: AbortSignal;
};

export function patchStep(
  progress: SocialGenerateProgressState,
  stepId: MetaGenerateGranularStepId,
  status: "running" | "done" | "error",
  statusMessage?: string,
): SocialGenerateProgressState {
  return patchMetaGenerateGranularStep(progress, stepId, status, statusMessage);
}

export function patchPhase(
  progress: SocialGenerateProgressState,
  stepId: MetaGenerateStepId,
  status: "running" | "done" | "error",
  statusMessage?: string,
): SocialGenerateProgressState {
  const steps = progress.steps.map((step) =>
    step.id === stepId ? { ...step, status } : step,
  );
  const completed = steps.filter((step) => step.status === "done").length;
  const active = steps.find((step) => step.status === "running");
  return {
    ...progress,
    steps,
    activeStepId: status === "running" ? stepId : progress.activeStepId,
    completed,
    label: active?.label ?? progress.label,
    statusMessage,
  };
}

export function publishMergedResearchSections(
  sections: MetaAdResearchSection[],
  onResearchSections?: (sections: MetaAdResearchSection[]) => void,
  onPartialUpdate?: (patch: MetaAdGeneratePartialUpdate) => void,
) {
  const merged = syncMetaMergedResearchSections(sections);
  publishResearchSections(merged, onResearchSections, onPartialUpdate);
  return merged;
}

export function resolveContextSource(source: MetaAdContextSource | undefined): MetaAdContextSource {
  return source === "neo-pulse_app" ? "neo-pulse_app" : "custom";
}

export function publishPartialUpdate(
  patch: MetaAdGeneratePartialUpdate,
  onPartialUpdate?: (patch: MetaAdGeneratePartialUpdate) => void,
) {
  onPartialUpdate?.(patch);
}

export function publishResearchSections(
  sections: MetaAdResearchSection[],
  onResearchSections?: (sections: MetaAdResearchSection[]) => void,
  onPartialUpdate?: (patch: MetaAdGeneratePartialUpdate) => void,
) {
  onResearchSections?.(sections);
  publishPartialUpdate({ researchSections: sections }, onPartialUpdate);
}

export function organicCaptionToMetaAdCopy(
  caption: string,
  finalUrl: string,
  headline: string,
): MetaAdCopy {
  return {
    primaryText: caption,
    headline,
    description: "",
    cta: "Learn More",
    finalUrl,
  };
}
