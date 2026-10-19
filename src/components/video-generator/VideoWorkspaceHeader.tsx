import { Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BULK_HEADER_RUN_BTN,
  BULK_TOOLBAR_GROUP_DIVIDER,
} from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import type {
  StoryboardFrame,
  VideoBrief,
  VideoPlan,
  VideoRenderSnapshot,
} from "@/lib/video-generator/video-generator-types";
import { type VideoAspect, type VideoLengthSeconds, type VideoResolution } from "@/lib/video-generator/video-model-defaults";
import { type VideoGeneratorStep } from "./video-generator-steps";
import { VideoWorkspaceFileMenu, VideoWorkspaceSettingsMenu } from "./VideoWorkspaceHeaderMenus";
import { cn } from "@/lib/utils";

export type VideoWorkspaceHeaderProps = {
  step: VideoGeneratorStep;
  maxStep: VideoGeneratorStep;
  onStepChange: (step: VideoGeneratorStep) => void;
  brief: VideoBrief;
  videoModel: string;
  onVideoModelChange: (modelId: string) => void;
  modelLabel: string;
  costLabel: string;
  working: boolean;
  status: string;
  plan: VideoPlan | null;
  frames: StoryboardFrame[];
  render: VideoRenderSnapshot | null;
  renderActive: boolean;
  primaryAction: { label: string; onClick: () => void; disabled: boolean } | null;
  onLengthChange: (v: VideoLengthSeconds) => void;
  onAspectChange: (v: VideoAspect) => void;
  onResolutionChange: (v: VideoResolution) => void;
  onRegenerateProductViews?: () => void;
  onRegeneratePlan: () => void;
  onRestitch: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onExportZip: () => void;
  onReset: () => void;
};

export function VideoWorkspaceHeader(props: VideoWorkspaceHeaderProps) {
  const {
    brief,
    videoModel,
    onVideoModelChange,
    modelLabel,
    costLabel,
    working,
    status,
    plan,
    frames,
    render,
    renderActive,
    primaryAction,
    onLengthChange,
    onAspectChange,
    onResolutionChange,
    onRegenerateProductViews,
    onRegeneratePlan,
    onRestitch,
    onExportJson,
    onImportJson,
    onExportZip,
    onReset,
  } = props;

  const doneFrames = frames.filter((f) => f.status === "done" && f.imageDataUrl && f.videoPrompt).length;
  const doneClips = render?.scenes.filter((s) => s.status === "done").length ?? 0;
  const totalScenes = plan?.scenes.length ?? 0;

  const statusText = working
    ? status || "Processing…"
    : render
      ? render.status === "done"
        ? `Final cut ready (${totalScenes} scenes)`
        : `Render: ${render.status} (${doneClips}/${totalScenes})`
      : totalScenes > 0 && frames.length === 0
        ? `Plan ready (${totalScenes} scenes) · review & approve`
        : totalScenes > 0
          ? `Storyboard: ${doneFrames}/${totalScenes} ready`
          : costLabel;

  return (
    <header className="flex h-12 w-full shrink-0 items-center gap-2 bg-zinc-950 px-3 text-base">
      <div className="flex shrink-0 items-center gap-2 pr-1">
        <Film className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="font-semibold tracking-tight text-white">Video Studio</span>
      </div>

      <div className={BULK_TOOLBAR_GROUP_DIVIDER} aria-hidden />

      <VideoWorkspaceFileMenu
        working={working}
        plan={plan}
        render={render}
        renderActive={renderActive}
        onReset={onReset}
        onExportJson={onExportJson}
        onImportJson={onImportJson}
        onExportZip={onExportZip}
        onRegenerateProductViews={onRegenerateProductViews}
        onRegeneratePlan={onRegeneratePlan}
        onRestitch={onRestitch}
      />

      <VideoWorkspaceSettingsMenu
        working={working}
        brief={brief}
        videoModel={videoModel}
        modelLabel={modelLabel}
        onVideoModelChange={onVideoModelChange}
        onLengthChange={onLengthChange}
        onAspectChange={onAspectChange}
        onResolutionChange={onResolutionChange}
      />

      <div className="ml-auto flex min-w-0 items-center gap-3">
        {!working ? (
          <div className="hidden min-w-0 items-center truncate text-base text-muted-foreground lg:flex">
            <span className="truncate tabular-nums">{statusText}</span>
          </div>
        ) : null}

        {primaryAction ? (
          <Button
            type="button"
            className={cn(BULK_HEADER_RUN_BTN, "max-w-[min(100%,22rem)] shrink-0 font-semibold")}
            disabled={primaryAction.disabled}
            onClick={primaryAction.onClick}
          >
            <span className="truncate">{primaryAction.label}</span>
          </Button>
        ) : null}
      </div>
    </header>
  );
}
