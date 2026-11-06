import { Pause, Play, RefreshCw, SkipBack, SkipForward, Undo2 } from "lucide-react";
import type {
  StoryboardFrame,
  VideoBrief,
  VideoPlan,
  VideoRenderSnapshot,
} from "@/lib/video-generator/video-generator-types";
import { formatJoinDescription, formatTimecode, type StagePreviewMode } from "./video-stage-panel-helpers";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

type VideoStageTransportBarProps = {
  scenes: VideoPlan["scenes"];
  activeIndex: number;
  onSelectScene?: (sceneId: string) => void;
  activeVideoUrl?: string;
  isPlaying: boolean;
  togglePlay: () => void;
  currentTime: number;
  totalDuration: number;
  effectiveMode: StagePreviewMode;
  scene: VideoPlan["scenes"][number];
  brief?: VideoBrief;
  referenceCount?: number;
  frame?: StoryboardFrame;
  render: VideoRenderSnapshot | null;
  isRenderActive: boolean;
  isSceneGenerating: boolean;
  canRerenderClip: boolean;
  onRegenerateEnvironmentPlate?: (sceneId: string) => void;
  onRegenerateFrame?: (sceneId: string, customInstruction?: string) => void;
  onRestoreReferenceFrame?: (sceneId: string) => void;
  onSyncAllFramesFromReferenceVideo?: () => void;
  onRerenderSceneClip?: (sceneId: string) => void;
};

export function VideoStageTransportBar({
  scenes,
  activeIndex,
  onSelectScene,
  activeVideoUrl,
  isPlaying,
  togglePlay,
  currentTime,
  totalDuration,
  effectiveMode,
  scene,
  brief,
  referenceCount = 0,
  frame,
  render,
  isRenderActive,
  isSceneGenerating,
  canRerenderClip,
  onRegenerateEnvironmentPlate,
  onRegenerateFrame,
  onRestoreReferenceFrame,
  onSyncAllFramesFromReferenceVideo,
  onRerenderSceneClip,
}: VideoStageTransportBarProps) {
  return (
    <>
      {/* NLE Transport & Scene Action Bar */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 bg-ui-field px-4">
        <div className="flex items-center gap-1">
          <Button
            variant="quiet"
            type="button"
            disabled={activeIndex <= 0}
            aria-label="Previous scene"
            onClick={() => {
              const prev = scenes[activeIndex - 1];
              if (prev) onSelectScene?.(prev.id);
            }}
          >
            <SkipBack className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            variant="quiet"
            type="button"
            disabled={!activeVideoUrl}
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={togglePlay}
          >
            {isPlaying ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          </Button>
          <Button
            variant="quiet"
            type="button"
            disabled={activeIndex >= scenes.length - 1}
            aria-label="Next scene"
            onClick={() => {
              const next = scenes[activeIndex + 1];
              if (next) onSelectScene?.(next.id);
            }}
          >
            <SkipForward className="h-4 w-4" aria-hidden />
          </Button>
          <span className="ml-2 tabular-nums text-muted-foreground">
            {formatTimecode(currentTime)} / {formatTimecode(effectiveMode === "final" ? totalDuration : scene.durationSeconds)}
          </span>
        </div>

        <div className="hidden items-center gap-2 text-muted-foreground md:flex">
          <span className="bg-black px-2.5 py-0.5 text-foreground">
            {formatJoinDescription(scene)}
          </span>
          {scene.environmentId ? (
            <span className="bg-black px-2.5 py-0.5 text-primary">
              {scene.environmentId.replace(/_/g, " ")}
            </span>
          ) : null}
          {scene.productView ? (
            <span className="bg-black px-2.5 py-0.5 text-muted-foreground">
              {scene.productView.replace(/_/g, " ")}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {onRegenerateEnvironmentPlate && frame?.environmentDataUrl && !brief?.referenceVideo?.serverId && !scene.postCutReferenceDataUrl ? (
            <Button
              variant="quiet"
              type="button"
              disabled={isRenderActive || isSceneGenerating}
              onClick={() => onRegenerateEnvironmentPlate(scene.id)}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Redraw env
            </Button>
          ) : null}
          {onRegenerateFrame ? (
            <Button
              variant="quiet"
              type="button"
              disabled={isRenderActive || isSceneGenerating}
              onClick={() => onRegenerateFrame(scene.id)}
              title="Redraw this frame with AI using your prompt and reference image"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {brief?.referenceVideo?.serverId || scene.postCutReferenceDataUrl ? "Redraw with AI (Apply Prompt)" : "Redraw keyframe"}
            </Button>
          ) : null}
          {onRestoreReferenceFrame && (scene.postCutReferenceDataUrl || brief?.referenceVideo?.serverId || referenceCount > 0) ? (
            <Button
              variant="quiet"
              type="button"
              disabled={isRenderActive || isSceneGenerating}
              onClick={() => onRestoreReferenceFrame(scene.id)}
              title="Reset this keyframe to the real photo or frame cut from the reference video"
            >
              <Undo2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Reset Scene to Real Still
            </Button>
          ) : null}
          {onSyncAllFramesFromReferenceVideo && (brief?.referenceVideo?.serverId || referenceCount > 0) ? (
            <Button
              variant="quiet"
              type="button"
              disabled={isRenderActive || isSceneGenerating}
              onClick={onSyncAllFramesFromReferenceVideo}
              title="Reset ALL scenes back to 100% real camera stills and uploaded photos (undo all AI hallucinations)"
            >
              <Undo2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Reset All to Real Stills
            </Button>
          ) : null}
          {canRerenderClip ? (
            <Button
              variant="quiet"
              type="button"
              onClick={() => onRerenderSceneClip?.(scene.id)}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Re-render scene {scene.order} clip
            </Button>
          ) : null}
        </div>
      </div>

      {render?.error || frame?.error ? (
        <p className="bg-ui-danger-surface/60 px-4 py-1.5 text-ui-danger-hover">{render?.error ?? frame?.error}</p>
      ) : null}
    </>
  );
}
