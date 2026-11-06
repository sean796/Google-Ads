import { useRef } from "react";
import {
  Archive,
  ChevronDown,
  Download,
  FileJson,
  RefreshCw,
  RotateCcw,
  Upload,
} from "lucide-react";


import { MY_SITES_POPOVER } from "@/components/hosting/my-sites/my-sites-theme";
import type { VideoBrief, VideoPlan, VideoRenderSnapshot } from "@/lib/video-generator/video-generator-types";
import {
  VIDEO_ASPECTS,
  VIDEO_LENGTH_OPTIONS,
  VIDEO_MODEL_PRESETS,
  resolutionsForVideoModel,
  type VideoAspect,
  type VideoLengthSeconds,
  type VideoResolution,
} from "@/lib/video-generator/video-model-defaults";
import { cn } from "@/lib/utils";
import { Button, FileInput, SelectField, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger } from "@/ui";

type VideoWorkspaceFileMenuProps = {
  working: boolean;
  plan: VideoPlan | null;
  render: VideoRenderSnapshot | null;
  renderActive: boolean;
  onReset: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onExportZip: () => void;
  onRegenerateProductViews?: () => void;
  onRegeneratePlan: () => void;
  onSyncAllFramesFromReferenceVideo?: () => void;
  hasReferenceVideo?: boolean;
  onRestitch: () => void;
};

export function VideoWorkspaceFileMenu({
  working,
  plan,
  render,
  renderActive,
  onReset,
  onExportJson,
  onImportJson,
  onExportZip,
  onRegenerateProductViews,
  onRegeneratePlan,
  onSyncAllFramesFromReferenceVideo,
  hasReferenceVideo,
  onRestitch,
}: VideoWorkspaceFileMenuProps) {
  const jsonInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="quiet"
            type="button"
            disabled={working}
            aria-label="File menu"
          >
            <span>File</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[12rem] rounded-none border-white/15 bg-black text-base text-white">
          <DropdownMenuItem className="gap-2 text-base focus:bg-ui-field-hover" disabled={working} onSelect={onReset}>
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
            New video
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 text-base focus:bg-ui-field-hover" disabled={working} onSelect={onExportJson}>
            <FileJson className="h-4 w-4 shrink-0" aria-hidden />
            Save JSON
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 text-base focus:bg-ui-field-hover"
            disabled={working}
            onSelect={() => jsonInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 shrink-0" aria-hidden />
            Load JSON
          </DropdownMenuItem>

          {plan || render || onRegenerateProductViews ? <DropdownMenuSeparator className="bg-white/10" /> : null}

          {onRegenerateProductViews ? (
            <DropdownMenuItem
              className="gap-2 text-base focus:bg-ui-field-hover"
              disabled={working}
              onSelect={onRegenerateProductViews}
            >
              <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
              Regenerate views
            </DropdownMenuItem>
          ) : null}

          {plan ? (
            <DropdownMenuItem
              className="gap-2 text-base focus:bg-ui-field-hover"
              disabled={working}
              onSelect={onRegeneratePlan}
            >
              <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
              Regenerate plan
            </DropdownMenuItem>
          ) : null}

          {plan && hasReferenceVideo && onSyncAllFramesFromReferenceVideo ? (
            <DropdownMenuItem
              className="gap-2 text-base text-primary focus:bg-ui-field-hover focus:text-primary"
              disabled={working}
              onSelect={onSyncAllFramesFromReferenceVideo}
            >
              <RefreshCw className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              Sync frames from reference video
            </DropdownMenuItem>
          ) : null}

          {render && !renderActive ? (
            <DropdownMenuItem className="gap-2 text-base focus:bg-ui-field-hover" disabled={working} onSelect={onRestitch}>
              <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
              Re-stitch
            </DropdownMenuItem>
          ) : null}

          {plan || render ? (
            <>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem
                className="gap-2 text-base focus:bg-ui-field-hover"
                disabled={working}
                onSelect={onExportZip}
              >
                <Archive className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                Export ZIP
              </DropdownMenuItem>
            </>
          ) : null}

          {render?.finalUrl ? (
            <DropdownMenuItem className="gap-2 text-base focus:bg-ui-field-hover" asChild>
              <a href={render.finalUrl} download>
                <Download className="h-4 w-4 shrink-0" aria-hidden />
                Export MP4
              </a>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <FileInput
        ref={jsonInputRef}
        accept=".json,application/json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImportJson(file);
          e.target.value = "";
        }}
      />
    </>
  );
}

type VideoWorkspaceSettingsMenuProps = {
  working: boolean;
  brief: VideoBrief;
  videoModel: string;
  modelLabel: string;
  onVideoModelChange: (modelId: string) => void;
  onLengthChange: (v: VideoLengthSeconds) => void;
  onAspectChange: (v: VideoAspect) => void;
  onResolutionChange: (v: VideoResolution) => void;
};

export function VideoWorkspaceSettingsMenu({
  working,
  brief,
  videoModel,
  modelLabel,
  onVideoModelChange,
  onLengthChange,
  onAspectChange,
  onResolutionChange,
}: VideoWorkspaceSettingsMenuProps) {
  const resolutions = resolutionsForVideoModel(videoModel);
  const modelOptions = VIDEO_MODEL_PRESETS.some((p) => p.value === videoModel)
    ? VIDEO_MODEL_PRESETS
    : [{ value: videoModel, label: modelLabel }, ...VIDEO_MODEL_PRESETS];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="quiet"
          type="button"
          disabled={working}
          aria-label="Settings menu"
        >
          <span>Settings</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(MY_SITES_POPOVER, "w-72 rounded-none border-white/15 bg-black p-3 text-base text-white")}
      >
        <div className="flex flex-col gap-2">
          <SelectField placeholder="Video model" value={videoModel} onValueChange={onVideoModelChange} disabled={working} options={modelOptions.map((m) => ({ value: m.value, label: m.label }))} width="full" />

          <SelectField
            placeholder="Length"
            value={String(brief.lengthSeconds)}
            onValueChange={(v) => onLengthChange(Number(v) as VideoLengthSeconds)}
            disabled={working}
            options={VIDEO_LENGTH_OPTIONS.map((s) => ({ value: String(s), label: `${s} s` }))}
            width="full"
          />

          <SelectField placeholder="Aspect ratio" value={brief.aspect} onValueChange={(v) => onAspectChange(v as VideoAspect)} disabled={working} options={VIDEO_ASPECTS.map((a) => ({ value: a, label: a }))} width="full" />

          <SelectField placeholder="Resolution" value={brief.resolution} onValueChange={(v) => onResolutionChange(v as VideoResolution)} disabled={working} options={resolutions.map((r) => ({ value: r, label: r }))} width="full" />
        </div>
      </PopoverContent>
    </Popover>
  );
}
