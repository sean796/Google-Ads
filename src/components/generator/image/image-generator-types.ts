import type { AgentConfig } from "@/types/agent-config";
import type { ImageChecklistItem } from "@/lib/image-checklist-builder";
import type { SavedPrompt } from "@/lib/image-prompt-shortcuts";
import type { MarkdownSection } from "@/lib/section-parser";
import type {
  ImageAspectRatio,
  ImageColorScheme,
  ImageGeneratorOptions,
  ImageSourceMode,
  ImageStyle,
} from "@/lib/image-generator/image-generator-options";
import type { ManualImageReference } from "@/lib/image-generator/manual-reference-upload";

export type FeaturedImageGeneratorState = {
  generatedImageUrl: string | null;
  generatedImageBase64: string | null;
  previewImageUrl: string | null;
  selectedSection?: string | null;
};

export type ImageReferenceProvenance = {
  mode: "abstract" | "grounded";
  queries: string[];
  references: Array<{
    imageUrl: string;
    sourceUrl?: string;
    query: string;
    kind: string;
    layer?: string;
    why: string;
    previewDataUrl?: string;
    useFromImage?: string[];
    ignoreFromImage?: string[];
  }>;
  spatialLayout?: string;
};

export type ImageGeneratorInputProps = {
  apiKey?: string;
  flowTitle?: string;
  flowPurpose?: string;
  agents?: AgentConfig[];
  finalOutput?: string;
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  onImageStateChange?: (state: FeaturedImageGeneratorState) => void;
};

export type ImageGeneratorViewState = {
  userPrompt: string;
  imageSourceMode: ImageSourceMode;
  selectedSection: string | null;
  includeText: boolean;
  includePeople: boolean;
  includeAnimals: boolean;
  includeCars: boolean;
  isInfographic: boolean;
  aspectRatio: ImageAspectRatio;
  style: ImageStyle;
  colorScheme: ImageColorScheme;
  colorForeground: string;
  colorBackground: string;
  imageModel: string;
  isCustomModel: boolean;
  generatedImageUrl: string | null;
  generatedImageBase64: string | null;
  previewImageUrl: string | null;
  isGenerating: boolean;
  isGeneratingChecklist: boolean;
  imageChecklist: ImageChecklistItem[];
  hasGeneratedChecklist: boolean;
  error: string | null;
  referenceResearch: ImageReferenceProvenance | null;
  manualReferences: ManualImageReference[];
  isPreparingReferences: boolean;
  savedPrompts: SavedPrompt[];
  saveDialogOpen: boolean;
  saveDialogName: string;
  availableSections: MarkdownSection[];
  imageDisplayUrl: string | null;
  hasApiKey: boolean;
  options: ImageGeneratorOptions;
};

export type ImageGeneratorActions = {
  setUserPrompt: (v: string) => void;
  setImageSourceMode: (v: ImageSourceMode) => void;
  setSelectedSection: (v: string | null) => void;
  setIncludeText: (v: boolean) => void;
  setIncludePeople: (v: boolean) => void;
  setIncludeAnimals: (v: boolean) => void;
  setIncludeCars: (v: boolean) => void;
  setIsInfographic: (v: boolean) => void;
  setAspectRatio: (v: ImageAspectRatio) => void;
  setStyle: (v: ImageStyle) => void;
  setColorScheme: (v: ImageColorScheme) => void;
  setColorForeground: (v: string) => void;
  setColorBackground: (v: string) => void;
  setImageModel: (v: string) => void;
  setIsCustomModel: (v: boolean) => void;
  setSaveDialogOpen: (v: boolean) => void;
  setSaveDialogName: (v: string) => void;
  handleInsertShortcut: (content: string) => void;
  handleSaveCurrent: () => void;
  handleConfirmSave: () => void;
  handleGenerateChecklist: () => Promise<ImageChecklistItem[]>;
  handleGenerateImage: () => Promise<void>;
  handleDownload: () => Promise<void>;
  handleCopy: () => Promise<void>;
  handlePreviewError: () => void;
  addManualReferences: (files: FileList | File[]) => Promise<void>;
  removeManualReference: (id: string) => void;
};

export type UseImageGeneratorResult = ImageGeneratorViewState & ImageGeneratorActions;
