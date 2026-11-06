import {
  Archive,
  Box,
  Clapperboard,
  FolderOpen,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type { ManualImageReference } from "@/lib/image-generator/manual-reference-upload";
import type { OpenRouterAppStreamDelta } from "@/lib/openrouter-app-api";
import type {
  ProductLockState,
  ProductViewId,
  StoryboardFrame,
  VideoBrief,
  VideoClarifyQuestion,
  VideoPlan,
  VideoProjectSummary,
  VideoRenderSnapshot,
  VideoStoredClip,
  VideoStoredRenderSummary,
  VideoTransition,
} from "@/lib/video-generator/video-generator-types";

export type StudioLeftTabId = "assets" | "brief" | "product" | "director" | "postcut" | "projects";
export type AssetFilter = "all" | "product" | "references" | "video";

export type VideoStudioLeftDockProps = {
  apiKey?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: StudioLeftTabId;
  onTabChange: (tab: StudioLeftTabId) => void;
  working: boolean;
  planDrafting?: boolean;
  renderActive?: boolean;
  brief: VideoBrief;
  onPromptChange: (v: string) => void;
  brainstormNotes: string;
  onBrainstormNotesChange: (v: string) => void;
  canBrainstorm: boolean;
  onBrainstorm: () => void;
  subjectPhotos: ManualImageReference[];
  isPreparingSubject: boolean;
  onAddSubjectFiles: (files: FileList | File[]) => void;
  onRemoveSubjectPhoto: (id: string) => void;
  onClearSubject: () => void;
  isPreparingReferences: boolean;
  onAddReferenceFiles: (files: FileList | File[]) => void;
  onRemoveReference: (id: string) => void;
  isPreparingReferenceVideo: boolean;
  onUploadReferenceVideo: (file: File) => void | Promise<void>;
  onRemoveReferenceVideo: () => void;
  brainstormVideo: { file: File; previewUrl: string } | null;
  brainstormImages: ManualImageReference[];
  isPreparingBrainstorm: boolean;
  onAddBrainstormFiles: (files: FileList | File[]) => void;
  onRemoveBrainstormVideo: () => void;
  onRemoveBrainstormImage: (id: string) => void;
  productLock: ProductLockState;
  onRegenerateProductView: (viewId: ProductViewId) => void;
  onReviseProductView?: (viewId: ProductViewId | "all", instruction: string) => void;
  questions: VideoClarifyQuestion[] | null;
  answers: Record<string, string>;
  onAnswerQuestion: (id: string, value: string) => void;
  plan: VideoPlan | null;
  planLive: OpenRouterAppStreamDelta;
  frames: StoryboardFrame[];
  render: VideoRenderSnapshot | null;
  selectedSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
  onSendSceneInstruction: (
    sceneId: string,
    instruction: string,
    postCutReference?: { dataUrl: string; fileName: string },
  ) => void;
  onRegenerateEnvironmentPlate: (sceneId: string) => void;
  onRegenerateFrame?: (sceneId: string, customInstruction?: string) => void;
  onRestoreReferenceFrame?: (sceneId: string) => void;
  onRerenderSceneClip: (sceneId: string, customPrompt?: string) => void;
  onClearSceneRevisionNotes?: (sceneId: string) => void;
  onUpdateSceneTransition: (sceneId: string, transition: VideoTransition, applyToAll?: boolean) => void;
  onUpdatePlanFades: (fadeInSeconds: number, fadeOutSeconds: number) => void;
  onUpdateScenePrompts: (
    sceneId: string,
    patch: {
      environmentPrompt?: string;
      storyboardPrompt?: string;
      motionPrompt?: string;
      videoPrompt?: string;
      postCutReferenceDataUrl?: string;
      postCutReferenceFileName?: string;
      customClipFile?: string | null;
      customClipUrl?: string | null;
    },
    action?: "save" | "redraw" | "rerender",
  ) => void;
  onRestitch: () => void;
  projectId: string;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  savedProjects: VideoProjectSummary[];
  storedRenders: VideoStoredRenderSummary[];
  onSaveProject: (name?: string) => void;
  onLoadProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onExportZip: () => void;
  onAddVideoClipsToTimeline?: (files: FileList | File[]) => void;
  onAddStoredClipToTimeline?: (clip: VideoStoredClip, label?: string) => void;
  onRefreshProjects: () => void;
};

export const RAIL_ITEMS: Array<{ id: StudioLeftTabId; label: string; icon: typeof Sparkles }> = [
  { id: "assets", label: "Assets", icon: FolderOpen },
  { id: "brief", label: "Brief", icon: Sparkles },
  { id: "product", label: "Product", icon: Box },
  { id: "director", label: "Director", icon: Clapperboard },
  { id: "postcut", label: "Post-Cut", icon: SlidersHorizontal },
  { id: "projects", label: "Projects", icon: Archive },
];

export type LibraryTile = {
  id: string;
  name: string;
  badge: string;
  category: "product" | "references" | "video";
  kind: "image" | "video";
  src: string;
  onRemove?: () => void;
};

export type VideoStudioAssetsPanelProps = {
  brief: VideoBrief;
  working: boolean;
  assetFilter: AssetFilter;
  onAssetFilterChange: (filter: AssetFilter) => void;
  filteredTiles: LibraryTile[];
  subjectPhotos: ManualImageReference[];
  isPreparingSubject: boolean;
  isPreparingReferences: boolean;
  isPreparingReferenceVideo: boolean;
  isPreparingBrainstorm: boolean;
  onPromptChange: (v: string) => void;
  onAddSubjectFiles: (files: FileList | File[]) => void;
  onAddReferenceFiles: (files: FileList | File[]) => void;
  onUploadReferenceVideo: (file: File) => void | Promise<void>;
  onAddBrainstormFiles: (files: FileList | File[]) => void;
};
