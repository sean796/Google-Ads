import type { ReactNode } from "react";
import { AlertTriangle, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HOST_SURFACE, MY_SITES_ICON_BTN } from "@/components/hosting/my-sites/my-sites-theme";
import type { StoryboardFrame, VideoPlan, VideoRenderScene } from "@/lib/video-generator/video-generator-types";
import { VIDEO_ASPECT_BOX_CLASS, type VideoAspect } from "@/lib/video-generator/video-model-defaults";
import { VideoStudioPlaceholderSplash } from "./VideoStudioPlaceholderSplash";
import { cn } from "@/lib/utils";

type VideoSceneSidebarProps = {
  plan: VideoPlan | null;
  /** Shown in place of the scenes until the Director writes the plan: the upload field and every uploaded file. */
  uploads: ReactNode;
  aspect: VideoAspect;
  frames: StoryboardFrame[];
  /** Set during the render step: tiles show clip status instead of the regenerate control. */
  renderScenes: VideoRenderScene[] | null;
  selectedSceneId: string | null;
  disabled: boolean;
  onSelect: (sceneId: string) => void;
  onRegenerate: (sceneId: string) => void;
};

const CLIP_STATUS_LABEL: Record<VideoRenderScene["status"], string> = {
  queued: "Queued",
  generating: "Generating clip",
  done: "Clip ready",
  failed: "Clip failed",
};

/** Left column: one tile per scene in order; the selected scene drives the stage. Always mounted so the layout never shifts. */
export function VideoSceneSidebar({
  plan,
  uploads,
  aspect,
  frames,
  renderScenes,
  selectedSceneId,
  disabled,
  onSelect,
  onRegenerate,
}: VideoSceneSidebarProps) {
  return (
    <aside className={cn("neo-pulse-manager-tab-scroll flex h-full min-h-0 flex-col gap-3 overflow-y-auto overflow-x-hidden pr-1")}>
      {plan === null ? (
        uploads
      ) : (
        plan.scenes.map((scene) => {
          const frame = frames.find((f) => f.sceneId === scene.id);
          const clip = renderScenes?.find((s) => s.sceneId === scene.id);
          const spinning = frame?.status === "generating" || frame?.status === "waiting";
          const clipBusy = clip?.status === "generating" || clip?.status === "queued";
          const prompting = frame?.status === "done" && !frame.videoPrompt && renderScenes === null;
          const selected = scene.id === selectedSceneId;
          return (
            <div
              key={scene.id}
              className={cn(HOST_SURFACE, "flex flex-col", selected && "ring-1 ring-primary/70")}
              aria-current={selected ? "true" : undefined}
            >
              <button
                type="button"
                className={cn("relative w-full overflow-hidden bg-black text-left", VIDEO_ASPECT_BOX_CLASS[aspect])}
                aria-label={`Select scene ${scene.order}: ${scene.title}`}
                onClick={() => onSelect(scene.id)}
              >
                {frame?.imageDataUrl ? (
                  <img
                    src={frame.imageDataUrl}
                    alt=""
                    className={cn(
                      "absolute inset-0 h-full w-full object-cover",
                      clip?.status === "generating" ? "animate-video-product-splash-breathe" : "",
                    )}
                  />
                ) : spinning ? (
                  <VideoStudioPlaceholderSplash
                    title={`Scene ${scene.order}`}
                    subtitle={scene.title}
                    breathing
                    variant="tile"
                  />
                ) : null}
                {frame?.status === "failed" && !frame?.imageDataUrl ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <AlertTriangle className="h-6 w-6 text-red-300" aria-label="Frame failed" />
                  </span>
                ) : null}
                <span className="absolute left-2 top-2 inline-flex h-6 min-w-[1.5rem] items-center justify-center bg-black/80 px-1.5 tabular-nums text-white">
                  {scene.order}
                </span>
                {clip ? (
                  <span
                    className={cn(
                      "absolute inset-x-0 bottom-0 flex h-8 items-center gap-2 bg-black/80 px-3",
                      clip.status === "failed" ? "text-red-300" : clip.status === "done" ? "text-primary" : "text-foreground",
                    )}
                  >
                    {clipBusy && !frame?.imageDataUrl ? (
                      <span className="h-2 w-2 shrink-0 animate-video-product-splash-breathe bg-primary" aria-hidden />
                    ) : null}
                    {clip.status === "done" ? <Check className="h-4 w-4" aria-hidden /> : null}
                    {clip.status === "failed" ? <AlertTriangle className="h-4 w-4" aria-hidden /> : null}
                    <span className="truncate">{CLIP_STATUS_LABEL[clip.status]}</span>
                  </span>
                ) : null}
              </button>
              <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-3">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(scene.id)}>
                  <p className="truncate font-medium text-white">{scene.title}</p>
                  <p className="truncate tabular-nums text-muted-foreground" title={frame?.error ?? clip?.error ?? undefined}>
                    {scene.durationSeconds} s
                    {scene.transitionIn
                      ? ` · ${
                          scene.transitionIn.type === "dissolve"
                            ? `dissolve ${scene.transitionIn.seconds} s`
                            : scene.transitionIn.type === "cut"
                              ? "cut"
                              : "continue"
                        }`
                      : ""}
                    {prompting ? " · Writing clip prompt" : ""}
                    {frame?.status === "failed" && frame.error ? ` · ${frame.error}` : ""}
                    {clip?.status === "failed" && clip.error ? ` · ${clip.error}` : ""}
                  </p>
                </button>
                {frames.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className={MY_SITES_ICON_BTN}
                    disabled={disabled || spinning || prompting || clip?.status === "generating"}
                    aria-label={`Regenerate scene ${scene.order}`}
                    onClick={() => onRegenerate(scene.id)}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden />
                  </Button>
                ) : (
                  <span className="h-8 w-8 shrink-0" aria-hidden />
                )}
              </div>
            </div>
          );
        })
      )}
    </aside>
  );
}
