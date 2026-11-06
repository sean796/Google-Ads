import type { Dispatch, DragEvent, RefObject, SetStateAction } from "react";
import { CheckSquare, FolderOpen, Sparkles } from "lucide-react";
import type { GeneratorFreeFlowBindings } from "@/components/generator/generator-free-flow-bindings";
import type { useImageGenerator } from "@/components/generator/image/useImageGenerator";
import type { ImageAspectRatio } from "@/lib/image-generator/image-generator-options";

export type ImageStudioLeftTabId = "assets" | "brief" | "checklist";

export const RAIL_ITEMS: Array<{ id: ImageStudioLeftTabId; label: string; icon: typeof Sparkles }> = [
  { id: "assets", label: "Assets", icon: FolderOpen },
  { id: "brief", label: "Brief", icon: Sparkles },
  { id: "checklist", label: "Checklist", icon: CheckSquare },
];

export const IMAGE_ASPECT_STAGE_CLASS: Record<ImageAspectRatio, string> = {
  "1:1": "aspect-square h-full max-h-full w-auto max-w-full",
  "16:9": "aspect-video w-full max-w-full max-h-full",
  "9:16": "aspect-[9/16] h-full max-h-full w-auto max-w-full",
  "9:19": "aspect-[9/19] h-full max-h-full w-auto max-w-full",
  "4:3": "aspect-[4/3] w-full max-w-full max-h-full",
  "3:4": "aspect-[3/4] h-full max-h-full w-auto max-w-full",
  "21:9": "aspect-[21/9] w-full max-w-full max-h-full",
};

export interface ImageStudioTabContentProps {
  apiKey: string;
  bindings?: GeneratorFreeFlowBindings;
}

export interface ImageStudioDrawerProps {
  g: ReturnType<typeof useImageGenerator>;
  leftTab: ImageStudioLeftTabId;
  setLeftTab: Dispatch<SetStateAction<ImageStudioLeftTabId>>;
  leftOpen: boolean;
  setLeftOpen: Dispatch<SetStateAction<boolean>>;
  openPanelTab: (tab: ImageStudioLeftTabId) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleDrop: (e: DragEvent<HTMLDivElement>) => void;
  working: boolean;
  isSolo: boolean;
}

