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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MY_SITES_POPOVER } from "@/components/hosting/my-sites/my-sites-theme";
import {
  BULK_HEADER_SELECT_TRIGGER,
  BULK_HEADER_TOOL_BTN,
} from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
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
  onRestitch,
}: VideoWorkspaceFileMenuProps) {
  const jsonInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className={cn(BULK_HEADER_TOOL_BTN, "gap-1")}
            disabled={working}
            aria-label="File menu"
          >
            <span>File</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[12rem] rounded-none border-white/15 bg-zinc-950 text-base text-white">
          <DropdownMenuItem className="gap-2 text-base focus:bg-zinc-800" disabled={working} onSelect={onReset}>
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
            New video
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 text-base focus:bg-zinc-800" disabled={working} onSelect={onExportJson}>
            <FileJson className="h-4 w-4 shrink-0" aria-hidden />
            Save JSON
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 text-base focus:bg-zinc-800"
            disabled={working}
            onSelect={() => jsonInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 shrink-0" aria-hidden />
            Load JSON
          </DropdownMenuItem>

          {plan || render || onRegenerateProductViews ? <DropdownMenuSeparator className="bg-white/10" /> : null}

          {onRegenerateProductViews ? (
            <DropdownMenuItem
              className="gap-2 text-base focus:bg-zinc-800"
              disabled={working}
              onSelect={onRegenerateProductViews}
            >
              <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
              Regenerate views
            </DropdownMenuItem>
          ) : null}

          {plan ? (
            <DropdownMenuItem
              className="gap-2 text-base focus:bg-zinc-800"
              disabled={working}
              onSelect={onRegeneratePlan}
            >
              <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
              Regenerate plan
            </DropdownMenuItem>
          ) : null}

          {render && !renderActive ? (
            <DropdownMenuItem className="gap-2 text-base focus:bg-zinc-800" disabled={working} onSelect={onRestitch}>
              <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
              Re-stitch
            </DropdownMenuItem>
          ) : null}

          {plan || render ? (
            <>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem
                className="gap-2 text-base focus:bg-zinc-800"
                disabled={working}
                onSelect={onExportZip}
              >
                <Archive className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                Export ZIP
              </DropdownMenuItem>
            </>
          ) : null}

          {render?.finalUrl ? (
            <DropdownMenuItem className="gap-2 text-base focus:bg-zinc-800" asChild>
              <a href={render.finalUrl} download>
                <Download className="h-4 w-4 shrink-0" aria-hidden />
                Export MP4
              </a>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
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
          type="button"
          variant="ghost"
          className={cn(BULK_HEADER_TOOL_BTN, "gap-1")}
          disabled={working}
          aria-label="Settings menu"
        >
          <span>Settings</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(MY_SITES_POPOVER, "w-72 rounded-none border-white/15 bg-zinc-950 p-3 text-base text-white")}
      >
        <div className="flex flex-col gap-2">
          <Select value={videoModel} onValueChange={onVideoModelChange} disabled={working}>
            <SelectTrigger className={cn(BULK_HEADER_SELECT_TRIGGER, "w-full")} aria-label="Video model">
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
            <SelectTrigger className={cn(BULK_HEADER_SELECT_TRIGGER, "w-full")} aria-label="Video length">
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

          <Select value={brief.aspect} onValueChange={(v) => onAspectChange(v as VideoAspect)} disabled={working}>
            <SelectTrigger className={cn(BULK_HEADER_SELECT_TRIGGER, "w-full")} aria-label="Aspect ratio">
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
            <SelectTrigger className={cn(BULK_HEADER_SELECT_TRIGGER, "w-full")} aria-label="Resolution">
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
        </div>
      </PopoverContent>
    </Popover>
  );
}
