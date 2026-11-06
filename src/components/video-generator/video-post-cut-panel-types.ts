import type { Dispatch, RefObject, SetStateAction } from "react";
import type { PostCutSceneReference, VideoScenePlan } from "@/lib/video-generator/video-generator-types";
import type {
  StoryboardFrame,
  VideoPlan,
  VideoRenderSnapshot,
  VideoTransition,
} from "@/lib/video-generator/video-generator-types";

export type VideoPostCutPanelProps = {
  apiKey?: string;
  plan: VideoPlan | null;
  frames: StoryboardFrame[];
  render: VideoRenderSnapshot | null;
  selectedSceneId: string | null;
  disabled: boolean;
  onSelectScene: (sceneId: string) => void;
  onSendSceneInstruction: (sceneId: string, instruction: string, postCutReference?: PostCutSceneReference) => void;
  onRegenerateEnvironmentPlate: (sceneId: string) => void;
  onRegenerateFrame: (sceneId: string, customInstruction?: string) => void;
  onRestoreReferenceFrame?: (sceneId: string) => void;
  onRerenderSceneClip: (sceneId: string, customPrompt?: string) => void;
  onClearSceneRevisionNotes?: (sceneId: string) => void;
  onUpdateSceneTransition: (sceneId: string, transition: VideoTransition, applyToAll?: boolean) => void;
  onUpdatePlanFades: (fadeInSeconds: number, fadeOutSeconds: number) => void;
  onUpdateScenePrompts?: (
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
};

export type VideoPostCutPromptAccordionProps = {
  activeScene: VideoScenePlan;
  instructionText: string;
  setInstructionText: Dispatch<SetStateAction<string>>;
  promptText: string;
  handleMainPromptChange: (nextText: string) => void;
  isRemakingPrompt: boolean;
  remakeNotice: string | null;
  sceneReference: PostCutSceneReference | null;
  referenceInputRef: RefObject<HTMLInputElement | null>;
  onReferenceFiles: (files: FileList | null) => Promise<void>;
  applyInstructionToMainPrompt: (instructionVal: string) => Promise<void>;
  handleRemoveReference: () => void;
};

export type VideoPostCutTransitionsProps = {
  activeScene: VideoScenePlan;
  plan: VideoPlan;
  render: VideoRenderSnapshot | null;
  disabled: boolean;
  onRestitch: () => void;
  onUpdateSceneTransition: (sceneId: string, transition: VideoTransition, applyToAll?: boolean) => void;
  onUpdatePlanFades: (fadeInSeconds: number, fadeOutSeconds: number) => void;
};
