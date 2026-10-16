import { useRef } from "react";
import { Archive, Download, FileJson, Film, Loader2, RefreshCw, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BULK_HEADER_RUN_BTN,
  BULK_HEADER_SELECT_TRIGGER,
  BULK_HEADER_TOOL_BTN,
  BULK_TOOLBAR_GROUP_DIVIDER,
} from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import type {
  StoryboardFrame,
  VideoBrief,
  VideoPlan,
  VideoRenderSnapshot,
} from "@/lib/video-generator/video-generator-types";
import {
  VIDEO_ASPECTS,
  VIDEO_LENGTH_OPTIONS,
  VIDEO_MODEL_PRESETS,
  resolutionsForVideoModel,
  type VideoAspect,
  type VideoLengthSeconds,
  type VideoResolution,
} from "@/lib/video-generator/video-model-defaults";
import { type VideoGeneratorStep } from "./video-generator-steps";
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

  const jsonInputRef = useRef<HTMLInputElement>(null);
  const resolutions = resolutionsForVideoModel(videoModel);
  const modelOptions = VIDEO_MODEL_PRESETS.some((p) => p.value === videoModel)
    ? VIDEO_MODEL_PRESETS
    : [{ value: videoModel, label: modelLabel }, ...VIDEO_MODEL_PRESETS];
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
          : `${modelLabel} · ${costLabel}`;

  return (
    <header className="flex h-12 w-full shrink-0 items-center gap-2 bg-zinc-950 px-3 text-base">
      <div className="flex shrink-0 items-center gap-2 pr-1">
        <Film className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="font-semibold tracking-tight text-white">Video Studio</span>
      </div>

      <div className={BULK_TOOLBAR_GROUP_DIVIDER} aria-hidden />

      <Select
        value={videoModel}
        onValueChange={onVideoModelChange}
        disabled={working}
      >
        <SelectTrigger className={BULK_HEADER_SELECT_TRIGGER} aria-label="Video model">
          <SelectValue placeholder="Video model" />
        </SelectTrigger>
        <SelectContent className="rounded-none border-white/15 bg-zinc-950 text-white">
          {modelOptions.map((m) => (
            <SelectItem key={m.value} value={m.value} className="text-base">
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={String(brief.lengthSeconds)}
        onValueChange={(v) => onLengthChange(Number(v) as VideoLengthSeconds)}
        disabled={working}
      >
        <SelectTrigger className={BULK_HEADER_SELECT_TRIGGER} aria-label="Video length">
          <SelectValue placeholder="Length" />
        </SelectTrigger>
        <SelectContent className="rounded-none border-white/15 bg-zinc-950 text-white">
          {VIDEO_LENGTH_OPTIONS.map((s) => (
            <SelectItem key={s} value={String(s)} className="text-base">
              {s} s
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={brief.aspect}
        onValueChange={(v) => onAspectChange(v as VideoAspect)}
        disabled={working}
      >
        <SelectTrigger className={BULK_HEADER_SELECT_TRIGGER} aria-label="Aspect ratio">
          <SelectValue placeholder="Aspect ratio" />
        </SelectTrigger>
        <SelectContent className="rounded-none border-white/15 bg-zinc-950 text-white">
          {VIDEO_ASPECTS.map((a) => (
            <SelectItem key={a} value={a} className="text-base">
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={brief.resolution}
        onValueChange={(v) => onResolutionChange(v as VideoResolution)}
        disabled={working}
      >
        <SelectTrigger className={BULK_HEADER_SELECT_TRIGGER} aria-label="Resolution">
          <SelectValue placeholder="Resolution" />
        </SelectTrigger>
        <SelectContent className="rounded-none border-white/15 bg-zinc-950 text-white">
          {resolutions.map((r) => (
            <SelectItem key={r} value={r} className="text-base">
              {r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className={BULK_TOOLBAR_GROUP_DIVIDER} aria-hidden />

      <Button type="button" variant="ghost" className={BULK_HEADER_TOOL_BTN} disabled={working} onClick={onReset}>
        <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden />
        New video
      </Button>

      <Button
        type="button"
        variant="ghost"
        className={BULK_HEADER_TOOL_BTN}
        disabled={working}
        onClick={onExportJson}
        title="Download resumable project JSON file"
      >
        <FileJson className="mr-1.5 h-4 w-4" aria-hidden />
        Save JSON
      </Button>

      <Button
        type="button"
        variant="ghost"
        className={BULK_HEADER_TOOL_BTN}
        disabled={working}
        onClick={() => jsonInputRef.current?.click()}
        title="Load a saved project JSON file to continue"
      >
        <Upload className="mr-1.5 h-4 w-4" aria-hidden />
        Load JSON
      </Button>
      <input
        ref={jsonInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImportJson(file);
          e.target.value = "";
        }}
      />

      {onRegenerateProductViews ? (
        <Button
          type="button"
          variant="ghost"
          className={BULK_HEADER_TOOL_BTN}
          disabled={working}
          onClick={onRegenerateProductViews}
        >
          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
          Regenerate views
        </Button>
      ) : null}

      {plan ? (
        <Button type="button" variant="ghost" className={BULK_HEADER_TOOL_BTN} disabled={working} onClick={onRegeneratePlan}>
          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
          Regenerate plan
        </Button>
      ) : null}

      {render && !renderActive ? (
        <Button type="button" variant="ghost" className={BULK_HEADER_TOOL_BTN} disabled={working} onClick={onRestitch}>
          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
          Re-stitch
        </Button>
      ) : null}

      <div className="ml-auto flex min-w-0 items-center gap-3">
        <div className="hidden items-center gap-2 truncate text-base text-muted-foreground lg:flex">
          {working ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden /> : null}
          <span className="truncate tabular-nums">{statusText}</span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {primaryAction ? (
            <Button
              type="button"
              className={cn(BULK_HEADER_RUN_BTN, "font-semibold")}
              disabled={primaryAction.disabled}
              onClick={primaryAction.onClick}
            >
              {working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {primaryAction.label}
            </Button>
          ) : null}

          {plan || render ? (
            <Button
              type="button"
              variant="ghost"
              className={BULK_HEADER_TOOL_BTN}
              disabled={working}
              onClick={onExportZip}
              title="Download ZIP with full video, individual scene clips, keyframes, and project.json"
            >
              <Archive className="mr-1.5 h-4 w-4 text-primary" aria-hidden />
              Export ZIP
            </Button>
          ) : null}

          {render?.finalUrl ? (
            <Button asChild type="button" className={cn(BULK_HEADER_RUN_BTN, "font-semibold")}>
              <a href={render.finalUrl} download>
                <Download className="h-4 w-4" aria-hidden />
                Export MP4
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
