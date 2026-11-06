import type { OpenRouterAppStreamDelta } from "@/lib/openrouter-app-api";
import {
  formatTransitionBadge,
  type ProductLockState,
  type ProductViewId,
  type StoryboardFrame,
  type VideoBrief,
  type VideoPlan,
  type VideoRenderSnapshot,
} from "@/lib/video-generator/video-generator-types";
import { type VideoAspect } from "@/lib/video-generator/video-model-defaults";
import type { StudioLeftTabId } from "./video-studio-left-dock-types";

export type StagePreviewMode = "final" | "clip" | "frame" | "env";

export type VideoStagePanelProps = {
  activeTab?: StudioLeftTabId;
  plan: VideoPlan | null;
  planLive?: OpenRouterAppStreamDelta;
  planDrafting?: boolean;
  brief?: VideoBrief;
  productLock?: ProductLockState;
  hasSubjectPhotos?: boolean;
  aspect: VideoAspect;
  frames: StoryboardFrame[];
  selectedSceneId: string | null;
  onSelectScene?: (sceneId: string) => void;
  render: VideoRenderSnapshot | null;
  disabled?: boolean;
  onRegenerateProductView?: (viewId: ProductViewId) => void;
  onReviseProductView?: (viewId: ProductViewId | "all", instruction: string) => void;
  onToggleSceneApproved?: (sceneId: string) => void;
  onApproveAllScenes?: () => void;
  onApprovePlanAndBeginStoryboard?: () => void;
  onSendSceneInstruction?: (
    sceneId: string,
    instruction: string,
    postCutReference?: { dataUrl: string; fileName: string },
  ) => void;
  onRegenerateEnvironmentPlate?: (sceneId: string) => void;
  onRegenerateFrame?: (sceneId: string, customInstruction?: string) => void;
  onRestoreReferenceFrame?: (sceneId: string) => void;
  onSyncAllFramesFromReferenceVideo?: () => void;
  onRerenderSceneClip?: (sceneId: string) => void;
  onPromptChange?: (v: string) => void;
  productPhotoCount?: number;
  referenceCount?: number;
  isPreparingSubject?: boolean;
  isPreparingReferences?: boolean;
  isPreparingReferenceVideo?: boolean;
  hasReferenceVideo?: boolean;
  onAddProductFiles?: (files: FileList | File[]) => void;
  onAddReferenceFiles?: (files: FileList | File[]) => void;
  onAddVideoFile?: (file: File) => void;
  /** True while survey/render product views batch is in flight (before lock). */
  productViewsBatchBusy?: boolean;
  previewMode?: StagePreviewMode;
  onPreviewModeChange?: (mode: StagePreviewMode) => void;
};

export const RENDER_STATUS_LABEL: Record<VideoRenderSnapshot["status"], string> = {
  created: "Preparing render",
  rendering: "Generating scene clips",
  stitching: "Assembling the final cut",
  done: "Video ready",
  failed: "Render failed",
};

export function formatTimecode(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${String(rem).padStart(2, "0")}`;
}

export function formatJoinDescription(scene: VideoPlan["scenes"][number]): string {
  if (!scene.transitionIn) return "opens video";
  if (scene.transitionIn.type === "cut") return "cut 0 s (keyframe)";
  if (scene.transitionIn.type === "continue") return "continue (dual-frame)";
  return formatTransitionBadge(scene.transitionIn).toLowerCase();
}

