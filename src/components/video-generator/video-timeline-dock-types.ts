import type { StoryboardFrame, VideoPlan, VideoRenderScene, VideoTransition } from "@/lib/video-generator/video-generator-types";

export type VideoTimelineDockProps = {
  plan: VideoPlan | null;
  totalSeconds: number;
  frames: StoryboardFrame[];
  renderScenes: VideoRenderScene[] | null;
  selectedSceneId: string | null;
  disabled: boolean;
  onSelectScene: (sceneId: string) => void;
  onPreviewClip?: (sceneId: string) => void;
  onRegenerateFrame: (sceneId: string) => void;
  onRerenderSceneClip?: (sceneId: string) => void;
  onUpdateSceneTransition?: (sceneId: string, transition: VideoTransition, applyToAll?: boolean) => void;
  onOpenPostCutForScene?: (sceneId: string) => void;
  onAddVideoClips?: (files: FileList | File[]) => void;
  onMoveScene?: (sceneId: string, direction: -1 | 1) => void;
  onRemoveScene?: (sceneId: string) => void;
};
