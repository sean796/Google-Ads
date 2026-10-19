import { useEffect, useRef, useState } from "react";
import {
  Archive,
  Download,
  FileJson,
  Film,
  FolderOpen,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MY_SITES_FIELD } from "@/components/hosting/my-sites/my-sites-theme";
import type {
  StoryboardFrame,
  VideoPlan,
  VideoProjectSummary,
  VideoRenderSnapshot,
  VideoStoredClip,
  VideoStoredRenderSummary,
} from "@/lib/video-generator/video-generator-types";
import { cn } from "@/lib/utils";

export type VideoProjectsPanelProps = {
  projectId: string;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  savedProjects: VideoProjectSummary[];
  storedRenders: VideoStoredRenderSummary[];
  plan: VideoPlan | null;
  frames: StoryboardFrame[];
  render: VideoRenderSnapshot | null;
  disabled: boolean;
  onSaveProject: (name?: string) => void;
  onLoadProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onExportZip: () => void;
  onAddVideoClipsToTimeline?: (files: FileList | File[]) => void;
  onAddStoredClipToTimeline?: (clip: VideoStoredClip, label?: string) => void;
  onRefresh: () => void;
};

export function VideoProjectsPanel({
  projectId,
  projectName,
  onProjectNameChange,
  savedProjects,
  storedRenders,
  plan,
  frames,
  render,
  disabled,
  onSaveProject,
  onLoadProject,
  onDeleteProject,
  onExportJson,
  onImportJson,
  onExportZip,
  onAddVideoClipsToTimeline,
  onAddStoredClipToTimeline,
  onRefresh,
}: VideoProjectsPanelProps) {
  const [nameDraft, setNameDraft] = useState(projectName);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const clipInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNameDraft(projectName);
  }, [projectName]);

  const currentScenes = plan?.scenes ?? [];

  return (
    <div className="flex flex-col gap-3.5 text-base">
      {/* Current Project Save / JSON / ZIP Controls */}
      <div className="flex flex-col gap-2.5 bg-zinc-900 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-white">Current Project</span>
          <button
            type="button"
            disabled={disabled}
            onClick={onRefresh}
            aria-label="Refresh saved projects and local clips"
            className="inline-flex items-center gap-1 bg-zinc-950 px-2 py-0.5 text-muted-foreground hover:text-white disabled:opacity-40"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            <span>Refresh</span>
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onProjectNameChange(nameDraft);
            onSaveProject(nameDraft);
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={nameDraft}
            onChange={(e) => {
              setNameDraft(e.target.value);
              onProjectNameChange(e.target.value);
            }}
            disabled={disabled}
            aria-label="Project name"
            placeholder="Project name (e.g. Blind Magic Spring Spot)"
            className={cn(MY_SITES_FIELD, "h-9 flex-1 bg-zinc-950 text-base")}
          />
          <Button
            type="submit"
            disabled={disabled}
            className="h-9 rounded-none bg-primary px-3 font-semibold text-black hover:bg-primary/90"
          >
            <Save className="mr-1.5 h-4 w-4" aria-hidden />
            Save
          </Button>
        </form>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            onClick={onExportJson}
            className="h-9 justify-center bg-zinc-950 text-base text-white hover:bg-primary hover:text-black"
          >
            <FileJson className="mr-1.5 h-4 w-4 text-primary" aria-hidden />
            Save JSON
          </Button>

          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            onClick={() => jsonInputRef.current?.click()}
            className="h-9 justify-center bg-zinc-950 text-base text-white hover:bg-primary hover:text-black"
          >
            <Upload className="mr-1.5 h-4 w-4 text-primary" aria-hidden />
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
        </div>

        <Button
          type="button"
          disabled={disabled}
          onClick={onExportZip}
          className="h-10 w-full rounded-none bg-primary font-semibold text-black hover:bg-primary/90"
        >
          <Archive className="mr-2 h-4 w-4" aria-hidden />
          Export Project ZIP (Full Video + Clips + JSON)
        </Button>

        {onAddVideoClipsToTimeline ? (
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={disabled}
              onClick={() => clipInputRef.current?.click()}
              className="h-9 w-full justify-center bg-zinc-950 text-base text-white hover:bg-primary hover:text-black"
            >
              <Plus className="mr-1.5 h-4 w-4 text-primary" aria-hidden />
              Add Video Clip to Timeline
            </Button>
            <input
              ref={clipInputRef}
              type="file"
              accept="video/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  onAddVideoClipsToTimeline(e.target.files);
                }
                e.target.value = "";
              }}
            />
          </>
        ) : null}
      </div>

      {/* Active Project Scene Clips & Keyframes */}
      {currentScenes.length > 0 ? (
        <div className="flex flex-col gap-2 bg-zinc-900 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-white">Active Project Clips</span>
            {render?.finalUrl ? (
              <a
                href={render.finalUrl}
                download
                className="inline-flex items-center gap-1 bg-primary px-2.5 py-0.5 font-semibold text-black hover:bg-primary/90"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                <span>Full Video MP4</span>
              </a>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            {currentScenes.map((sc) => {
              const clip = render?.scenes.find((s) => s.sceneId === sc.id);
              const frame = frames.find((f) => f.sceneId === sc.id);
              return (
                <div
                  key={sc.id}
                  className="flex items-center justify-between gap-2 bg-zinc-950 px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">
                      S{sc.order}: {sc.title} ({sc.durationSeconds}s)
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {frame?.imageDataUrl ? (
                      <a
                        href={frame.imageDataUrl}
                        download={`scene-0${sc.order}-frame.png`}
                        className="bg-zinc-900 px-2 py-0.5 text-muted-foreground hover:bg-primary hover:text-black"
                      >
                        Frame
                      </a>
                    ) : null}
                    {clip?.clipUrl ? (
                      <a
                        href={clip.clipUrl}
                        download={`scene-0${sc.order}.mp4`}
                        className="inline-flex items-center gap-1 bg-zinc-900 px-2 py-0.5 text-primary hover:bg-primary hover:text-black"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden />
                        <span>Clip MP4</span>
                      </a>
                    ) : (
                      <span className="text-muted-foreground">
                        {clip?.status ?? "Not rendered"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Saved Projects on Local Server Disk */}
      <div className="flex flex-col gap-2 bg-zinc-900 p-3">
        <span className="font-semibold text-white">
          Saved Projects ({savedProjects.length})
        </span>

        {savedProjects.length === 0 ? (
          <p className="bg-zinc-950 p-3 text-muted-foreground">
            No saved projects yet. Click Save above to store this project on disk so you can continue anytime.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {savedProjects.map((proj) => {
              const isCurrent = proj.id === projectId;
              return (
                <div
                  key={proj.id}
                  className={cn(
                    "flex items-center justify-between gap-2 bg-zinc-950 px-3 py-2",
                    isCurrent && "ring-1 ring-primary",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">{proj.name}</p>
                    <p className="truncate tabular-nums text-muted-foreground">
                      {proj.sceneCount} scenes · {proj.step}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onLoadProject(proj.id)}
                      className="inline-flex items-center gap-1 bg-zinc-900 px-2.5 py-1 text-primary hover:bg-primary hover:text-black disabled:opacity-40"
                    >
                      <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                      <span>Open</span>
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onDeleteProject(proj.id)}
                      aria-label={`Delete project ${proj.name}`}
                      className="flex h-7 w-7 items-center justify-center bg-zinc-900 text-muted-foreground hover:bg-red-600 hover:text-white disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Local Clips Storage (All Renders on Disk) */}
      <div className="flex flex-col gap-2 bg-zinc-900 p-3">
        <span className="font-semibold text-white">
          Local Clips Storage ({storedRenders.length})
        </span>

        {storedRenders.length === 0 ? (
          <p className="bg-zinc-950 p-3 text-muted-foreground">
            Rendered video clips appear here automatically and stay saved on local disk.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {storedRenders.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 bg-zinc-950 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Film className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="truncate font-medium text-white">{r.id}</span>
                  </div>
                  {r.finalUrl ? (
                    <a
                      href={r.finalUrl}
                      download={`final-${r.id}.mp4`}
                      className="inline-flex shrink-0 items-center gap-1 bg-primary px-2 py-0.5 font-semibold text-black hover:bg-primary/90"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden />
                      <span>Final MP4</span>
                    </a>
                  ) : (
                    <span className="text-muted-foreground">{r.status}</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {r.clips.map((c) =>
                    c.clipUrl ? (
                      <div key={`${r.id}-${c.sceneId}`} className="inline-flex items-center bg-zinc-900">
                        <a
                          href={c.clipUrl}
                          download={`${r.id}-scene-0${c.order}.mp4`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 tabular-nums text-foreground hover:bg-primary hover:text-black"
                        >
                          <Download className="h-3 w-3 text-primary" aria-hidden />
                          <span>S{c.order} ({c.durationSeconds}s)</span>
                        </a>
                        {onAddStoredClipToTimeline && c.clipFile ? (
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => onAddStoredClipToTimeline(c, `Render S${c.order}`)}
                            title="Add this clip to the current timeline"
                            className="inline-flex items-center gap-0.5 border-l border-white/10 px-1.5 py-0.5 text-primary hover:bg-primary hover:text-black disabled:opacity-40"
                          >
                            <Plus className="h-3 w-3" aria-hidden />
                            <span>Timeline</span>
                          </button>
                        ) : null}
                      </div>
                    ) : null,
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
