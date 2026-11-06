import type { WordPressSite } from "@/components/integrations/types";
import type { MetaAdTypographyStyle } from "@/lib/ppc/meta-ad-typography-styles";
import type {
  MetaAdBlueprint,
  MetaAdChecklistItem,
  MetaAdColorPalette,
  MetaAdContextSource,
  MetaAdCopy,
  MetaAdCreative,
  MetaAdCreativeBrief,
  MetaAdInstagramGoal,
  MetaAdResearchSection,
  MetaAdRow,
  MetaAdVisualReferenceElement,
  MetaGenerateConfig,
} from "@/lib/ppc/meta-ads-types";
import type { MetaAdImageReferenceSummary } from "@/lib/ppc/meta-ad-image-reference-types";
import type { MetaGenerateProgressState } from "@/lib/ppc/meta-ads-progress-types";

export type RunPpcMetaAdGenerateResult = {
  goal: MetaAdInstagramGoal;
  creativeBrief: MetaAdCreativeBrief;
  blueprint: MetaAdBlueprint;
  copyChecklist: MetaAdChecklistItem[];
  copy: MetaAdCopy;
  imageChecklist?: MetaAdChecklistItem[];
  visualReferenceElements?: MetaAdVisualReferenceElement[];
  creative?: MetaAdCreative;
  imagePromptDescription?: string;
  imageReferences: MetaAdImageReferenceSummary[];
  researchSections: MetaAdResearchSection[];
};

export type MetaAdGeneratePartialUpdate = Partial<
  Pick<
    MetaAdRow,
    | "instagramGoal"
    | "creativeBrief"
    | "blueprint"
    | "copyChecklist"
    | "copy"
    | "imageChecklist"
    | "visualReferenceElements"
    | "imageReferences"
    | "creative"
    | "imagePromptDescription"
    | "researchSections"
  >
>;

export type RunPpcMetaAdGenerateOptions = {
  site: WordPressSite;
  apiKey: string;
  model: string;
  config: MetaGenerateConfig;
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
  onProgress: (progress: MetaGenerateProgressState) => void;
  onResearchSections?: (sections: MetaAdResearchSection[]) => void;
  onPartialUpdate?: (patch: MetaAdGeneratePartialUpdate) => void;
  signal?: AbortSignal;
};
