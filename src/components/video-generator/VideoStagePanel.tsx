import { useEffect, useRef, useState } from "react";
import {
  Check,
  Film,
  Pause,
  Play,
  RefreshCw,
  Send,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MY_SITES_FIELD, MY_SITES_ICON_BTN, MY_SITES_TOOL_BTN } from "@/components/hosting/my-sites/my-sites-theme";
import type { OpenRouterAppStreamDelta } from "@/lib/openrouter-app-api";
import { PRODUCT_VIEW_DEFINITIONS } from "@/lib/video-generator/video-product-agent";
import {
  formatTransitionBadge,
  type ProductLockState,
  type ProductViewId,
  type StoryboardFrame,
  type VideoBrief,
  type VideoPlan,
  type VideoRenderSnapshot,
} from "@/lib/video-generator/video-generator-types";
import { VIDEO_ASPECT_BOX_CLASS, type VideoAspect } from "@/lib/video-generator/video-model-defaults";
import { VideoPlanLive } from "./VideoPlanLive";
import { VideoProductViewSplash } from "./VideoProductViewSplash";
import { VideoStudioPlaceholderSplash } from "./VideoStudioPlaceholderSplash";
import { VideoStartComposePanel } from "./VideoStartComposePanel";
import type { StudioLeftTabId } from "./VideoStudioLeftDock";
import { cn } from "@/lib/utils";

export type StagePreviewMode = "final" | "clip" | "frame" | "env";

type VideoStagePanelProps = {
  activeTab?: StudioLeftTabId;
  plan: VideoPlan | null;
  planLive?: OpenRouterAppStreamDelta;
  brief?: VideoBrief;
  productLock?: ProductLockState;
  hasSubjectPhotos?: boolean;
  aspect: VideoAspect;
  frames: StoryboardFrame[];
  selectedSceneId: string | null;
  onSelectScene?: (sceneId: string) => void;
  render: VideoRenderSnapshot | null;
  disabled?: boolean;
  onRegenerateProductView?: (viewId: ProductViewId) => void;
  onReviseProductView?: (viewId: ProductViewId | "all", instruction: string) => void;
  onToggleSceneApproved?: (sceneId: string) => void;
  onApprovePlanAndBeginStoryboard?: () => void;
  onSendSceneInstruction?: (
    sceneId: string,
    instruction: string,
    postCutReference?: { dataUrl: string; fileName: string },
  ) => void;
  onRegenerateEnvironmentPlate?: (sceneId: string) => void;
  onRegenerateFrame?: (sceneId: string) => void;
  onRerenderSceneClip?: (sceneId: string) => void;
  onPromptChange?: (v: string) => void;
  productPhotoCount?: number;
  referenceCount?: number;
  isPreparingSubject?: boolean;
  isPreparingReferences?: boolean;
  onAddProductFiles?: (files: FileList | File[]) => void;
  onAddReferenceFiles?: (files: FileList | File[]) => void;
  /** True while survey/render product views batch is in flight (before lock). */
  productViewsBatchBusy?: boolean;
};

const RENDER_STATUS_LABEL: Record<VideoRenderSnapshot["status"], string> = {
  created: "Preparing render",
  rendering: "Generating scene clips",
  stitching: "Assembling the final cut",
  done: "Video ready",
  failed: "Render failed",
};

function formatTimecode(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${String(rem).padStart(2, "0")}`;
}

function formatJoinDescription(scene: VideoPlan["scenes"][number]): string {
  if (!scene.transitionIn) return "opens video";
  if (scene.transitionIn.type === "cut") return "cut 0 s (keyframe)";
  if (scene.transitionIn.type === "continue") return "continue (dual-frame)";
  return formatTransitionBadge(scene.transitionIn).toLowerCase();
}

/** Persistent Center Stage Monitor + Pre-Scene Brief Approval Gate + NLE Transport Bar. */
export function VideoStagePanel({
  activeTab,
  plan,
  planLive,
  brief,
  productLock,
  hasSubjectPhotos = false,
  aspect,
  frames,
  selectedSceneId,
  onSelectScene,
  render,
  disabled = false,
  onRegenerateProductView,
  onReviseProductView,
  onToggleSceneApproved,
  onApprovePlanAndBeginStoryboard,
  onSendSceneInstruction,
  onRegenerateEnvironmentPlate,
  onRegenerateFrame,
  onRerenderSceneClip,
  onPromptChange,
  productPhotoCount = 0,
  referenceCount = 0,
  isPreparingSubject = false,
  isPreparingReferences = false,
  onAddProductFiles,
  onAddReferenceFiles,
  productViewsBatchBusy = false,
}: VideoStagePanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [previewMode, setPreviewMode] = useState<StagePreviewMode>("final");
  const [sceneDrafts, setSceneDrafts] = useState<Record<string, string>>({});
  const [productViewDrafts, setProductViewDrafts] = useState<Record<string, string>>({});

  const scenes = plan?.scenes ?? [];
  const selectedIndex = scenes.findIndex((s) => s.id === selectedSceneId);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const scene = scenes[activeIndex] ?? null;
  const frame = scene ? frames.find((f) => f.sceneId === scene.id) : undefined;
  const clip = scene && render ? render.scenes.find((s) => s.sceneId === scene.id) : undefined;
  const sceneClipUrl = clip?.clipUrl ?? scene?.customClipUrl;

  useEffect(() => {
    if (render?.finalUrl) {
      setPreviewMode("final");
    } else if (sceneClipUrl) {
      setPreviewMode("clip");
    } else {
      setPreviewMode("frame");
    }
  }, [render?.finalUrl, sceneClipUrl]);

  const effectiveMode: StagePreviewMode =
    previewMode === "final" && render?.finalUrl
      ? "final"
      : previewMode === "clip" && sceneClipUrl
        ? "clip"
        : previewMode === "env" && frame?.environmentDataUrl
          ? "env"
          : frame?.imageDataUrl
            ? "frame"
            : render?.finalUrl
              ? "final"
              : sceneClipUrl
                ? "clip"
                : "frame";

  const activeVideoUrl =
    effectiveMode === "final"
      ? render?.finalUrl
      : effectiveMode === "clip"
        ? sceneClipUrl
        : undefined;

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, [activeVideoUrl]);

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
    } else {
      el.pause();
    }
  };

  const totalDuration =
    plan?.scenes.reduce((sum, s) => sum + s.durationSeconds, 0) ?? brief?.lengthSeconds ?? 30;
  const isVertical = aspect === "9:16" || aspect === "3:4";
  const boxSizeClass = isVertical
    ? "h-full max-h-full w-auto max-w-full"
    : "w-full max-w-full max-h-full";

  const isStreamingPlan = Boolean(!plan && (planLive?.content || planLive?.reasoning));
  const hasProductViews = Boolean(
    productLock?.views.some((v) => v.imageDataUrl || v.status === "generating" || v.status === "failed"),
  );
  const showProductGrid = Boolean(productLock && (activeTab === "product" || (!plan && !isStreamingPlan && hasProductViews)));
  const isPreSceneApproval = Boolean(plan && frames.length === 0 && !showProductGrid && !isStreamingPlan);

  // Pre-Scene Simplified Brief Review & Approval Gate (before any storyboard frames are generated)
  if (isPreSceneApproval && plan) {
    const approvedCount = plan.scenes.filter((s) => s.approved).length;
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-zinc-950 text-base">
        <div className="flex h-10 shrink-0 items-center justify-between gap-3 bg-zinc-900 px-4">
          <span className="truncate font-semibold text-white">
            Scene Brief Review · {plan.title}
          </span>
          <span className="shrink-0 bg-zinc-950 px-2 py-0.5 tabular-nums text-primary">
            {approvedCount}/{plan.scenes.length} approved
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-black p-3">
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {plan.scenes.map((sc) => {
              const isSelected = sc.id === (selectedSceneId ?? plan.scenes[0]?.id);
              const draftText = sceneDrafts[sc.id] ?? "";
              const submitScenePrompt = () => {
                const trimmed = draftText.trim();
                if (!trimmed || disabled || !onSendSceneInstruction) return;
                onSendSceneInstruction(sc.id, trimmed);
                setSceneDrafts((prev) => ({ ...prev, [sc.id]: "" }));
              };

              return (
                <div
                  key={sc.id}
                  onClick={() => onSelectScene?.(sc.id)}
                  className={cn(
                    "flex cursor-pointer flex-col justify-between gap-2.5 bg-zinc-900 p-3.5 transition-colors",
                    isSelected ? "ring-2 ring-primary" : "hover:bg-zinc-900/80",
                  )}
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center bg-primary px-1.5 font-semibold tabular-nums text-black">
                          {sc.order}
                        </span>
                        <span className="truncate font-semibold text-white">{sc.title}</span>
                        <span className="shrink-0 bg-zinc-950 px-2 py-0.5 tabular-nums text-muted-foreground">
                          {sc.durationSeconds}s
                        </span>
                      </div>

                      {onToggleSceneApproved ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleSceneApproved(sc.id);
                          }}
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 px-2.5 py-0.5 text-base font-medium transition-colors",
                            sc.approved
                              ? "bg-primary text-black"
                              : "bg-zinc-950 text-muted-foreground hover:text-white",
                          )}
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden />
                          <span>{sc.approved ? "Approved" : "Approve"}</span>
                        </button>
                      ) : null}
                    </div>

                    <p className="text-foreground">{sc.sceneInstructions}</p>

                    {sc.revisionNotes && sc.revisionNotes.length > 0 ? (
                      <div className="flex flex-col gap-0.5 bg-zinc-950 px-2.5 py-1.5 text-primary">
                        {sc.revisionNotes.map((note, idx) => (
                          <p key={`${idx}-${note}`}>
                            {idx + 1}. {note}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {onSendSceneInstruction ? (
                    <form
                      onClick={(e) => e.stopPropagation()}
                      onSubmit={(e) => {
                        e.preventDefault();
                        submitScenePrompt();
                      }}
                      className="flex items-center gap-1.5 pt-1"
                    >
                      <Input
                        value={draftText}
                        onChange={(e) =>
                          setSceneDrafts((prev) => ({ ...prev, [sc.id]: e.target.value }))
                        }
                        disabled={disabled}
                        aria-label={`Natural language prompt for Scene ${sc.order}`}
                        placeholder={`Type what to change in Scene ${sc.order}...`}
                        className={cn(MY_SITES_FIELD, "h-9 flex-1 bg-zinc-950 text-base")}
                      />
                      <Button
                        type="submit"
                        variant="ghost"
                        className={MY_SITES_ICON_BTN}
                        disabled={disabled || !draftText.trim()}
                        aria-label={`Apply prompt to Scene ${sc.order}`}
                      >
                        <Send className="h-4 w-4" aria-hidden />
                      </Button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Product Lock 2x2 Turntable Viewport or Pre-Plan Monitor
  if (showProductGrid || !plan || !scene) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-zinc-950">
        <div className="flex h-10 shrink-0 items-center justify-between bg-zinc-900 px-4">
          <span className="truncate font-semibold text-white">
            {isStreamingPlan
              ? "Director · Writing Scene Plan"
              : showProductGrid
                ? `Product Lock Turntable · ${productLock?.spec?.name ?? "4 Chained Studio Angles"}`
                : "Studio Monitor"}
          </span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {aspect} · {brief?.resolution ?? "480p"} · 0:00 / {formatTimecode(totalDuration)}
          </span>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black p-3">
          {isStreamingPlan && planLive ? (
            <VideoPlanLive live={planLive} />
          ) : showProductGrid && productLock ? (
            <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-2.5">
              {PRODUCT_VIEW_DEFINITIONS.map((def) => {
                const v = productLock.views.find((item) => item.id === def.id);
                const spinning = v?.status === "generating";
                const draftText = productViewDrafts[def.id] ?? "";
                const submitViewPrompt = () => {
                  const trimmed = draftText.trim();
                  if (!trimmed || disabled || spinning || !hasSubjectPhotos || !onReviseProductView) return;
                  onReviseProductView(def.id, trimmed);
                  setProductViewDrafts((prev) => ({ ...prev, [def.id]: "" }));
                };

                return (
                  <div key={def.id} className="group relative flex flex-col overflow-hidden bg-zinc-900">
                    <div className="flex h-8 shrink-0 items-center justify-between bg-zinc-950/90 px-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-semibold text-white">{def.shortLabel}</span>
                        <span className="truncate text-muted-foreground">{def.chainHint}</span>
                        {v?.revisionNotes && v.revisionNotes.length > 0 ? (
                          <span
                            className="shrink-0 bg-primary/20 px-1.5 text-primary"
                            title={v.revisionNotes.join(" · ")}
                          >
                            {v.revisionNotes.length} edit{v.revisionNotes.length === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                      {onRegenerateProductView ? (
                        <button
                          type="button"
                          disabled={disabled || spinning || !hasSubjectPhotos}
                          onClick={() => onRegenerateProductView(def.id)}
                          aria-label={`Regenerate ${def.label}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-muted-foreground transition-colors hover:bg-primary hover:text-black disabled:opacity-40"
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                          <span>Regenerate</span>
                        </button>
                      ) : null}
                    </div>

                    <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
                      {v?.imageDataUrl ? (
                        <img
                          src={v.imageDataUrl}
                          alt={def.label}
                          className="absolute inset-0 h-full w-full object-contain"
                        />
                      ) : v?.error ? (
                        <div className="flex max-h-full flex-col gap-1 overflow-y-auto px-4 py-3 text-red-300">
                          <p className="font-medium">{v.error}</p>
                        </div>
                      ) : (
                        <VideoProductViewSplash
                          viewId={def.id}
                          label={def.label}
                          shortLabel={def.shortLabel}
                          breathing={spinning || (productViewsBatchBusy && !v?.imageDataUrl)}
                        />
                      )}
                    </div>

                    {/* Per-Picture Natural-Language Prompt Input Bar */}
                    {onReviseProductView ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          submitViewPrompt();
                        }}
                        className="flex h-9 shrink-0 items-center gap-1.5 bg-zinc-950 px-2"
                      >
                        <Input
                          value={draftText}
                          onChange={(e) =>
                            setProductViewDrafts((prev) => ({ ...prev, [def.id]: e.target.value }))
                          }
                          disabled={disabled || spinning || !hasSubjectPhotos}
                          aria-label={`Prompt AI to change ${def.label}`}
                          placeholder={`Prompt AI to change ${def.shortLabel} (e.g. "match uploaded color", "show full drop")`}
                          className={cn(MY_SITES_FIELD, "h-7 flex-1 bg-zinc-900 px-2.5 text-base")}
                        />
                        <Button
                          type="submit"
                          variant="ghost"
                          className={cn(MY_SITES_ICON_BTN, "h-7 w-7")}
                          disabled={disabled || spinning || !hasSubjectPhotos || !draftText.trim()}
                          aria-label={`Send prompt for ${def.label}`}
                        >
                          <Send className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </form>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : onPromptChange && onAddProductFiles && onAddReferenceFiles ? (
            <div
              className={cn(
                "relative flex flex-col items-center justify-center bg-zinc-900/40 p-6",
                VIDEO_ASPECT_BOX_CLASS[aspect],
                boxSizeClass,
              )}
            >
              <VideoStartComposePanel
                variant="stage"
                prompt={brief?.prompt ?? ""}
                onPromptChange={onPromptChange}
                productCount={productPhotoCount}
                referenceCount={referenceCount}
                disabled={disabled}
                isPreparingSubject={isPreparingSubject}
                isPreparingReferences={isPreparingReferences}
                onAddProductFiles={onAddProductFiles}
                onAddReferenceFiles={onAddReferenceFiles}
              />
            </div>
          ) : (
            <div
              className={cn(
                "relative flex flex-col items-center justify-center gap-3 bg-zinc-900/40 p-6 text-center",
                VIDEO_ASPECT_BOX_CLASS[aspect],
                boxSizeClass,
              )}
            >
              <Film className="h-10 w-10 text-primary/80" aria-hidden />
              <p className="font-semibold text-white">Ready to Direct</p>
              <p className="max-w-md text-muted-foreground">
                Add a brief, product photos, or references, then use the primary action in the top bar.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const headline =
    effectiveMode === "final" && render?.finalUrl
      ? plan.title
      : `Scene ${scene.order}: ${scene.title}`;
  const spinning =
    frame?.status === "generating" ||
    frame?.status === "waiting" ||
    frame?.environmentStatus === "generating";
  const canRerenderClip =
    Boolean(render && onRerenderSceneClip && frame?.status === "done" && frame.imageDataUrl && frame.videoPrompt) &&
    !disabled &&
    render?.status !== "rendering" &&
    render?.status !== "stitching";

  const hasMonitorVisual =
    Boolean(activeVideoUrl) ||
    Boolean(effectiveMode === "env" && frame?.environmentDataUrl) ||
    Boolean(frame?.imageDataUrl);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-950">
      {/* Top Monitor Bar */}
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 bg-zinc-900 px-4">
        <p className="truncate font-semibold text-white">{headline}</p>
        <div className="flex shrink-0 items-center gap-2">
          {render || sceneClipUrl || frame?.environmentDataUrl ? (
            <div className="flex items-center gap-1 bg-zinc-950 p-0.5">
              {render?.finalUrl ? (
                <button
                  type="button"
                  onClick={() => setPreviewMode("final")}
                  className={cn(
                    "px-2.5 py-0.5 text-base transition-colors",
                    effectiveMode === "final"
                      ? "bg-primary font-medium text-black"
                      : "text-muted-foreground hover:text-white",
                  )}
                >
                  Final cut
                </button>
              ) : null}
              {sceneClipUrl ? (
                <button
                  type="button"
                  onClick={() => setPreviewMode("clip")}
                  className={cn(
                    "px-2.5 py-0.5 text-base transition-colors",
                    effectiveMode === "clip"
                      ? "bg-primary font-medium text-black"
                      : "text-muted-foreground hover:text-white",
                  )}
                >
                  Scene {scene.order} clip
                </button>
              ) : null}
              {frame?.imageDataUrl ? (
                <button
                  type="button"
                  onClick={() => setPreviewMode("frame")}
                  className={cn(
                    "px-2.5 py-0.5 text-base transition-colors",
                    effectiveMode === "frame"
                      ? "bg-primary font-medium text-black"
                      : "text-muted-foreground hover:text-white",
                  )}
                >
                  Scene {scene.order} frame
                </button>
              ) : null}
              {frame?.environmentDataUrl ? (
                <button
                  type="button"
                  onClick={() => setPreviewMode("env")}
                  className={cn(
                    "px-2.5 py-0.5 text-base transition-colors",
                    effectiveMode === "env"
                      ? "bg-primary font-medium text-black"
                      : "text-muted-foreground hover:text-white",
                  )}
                >
                  Scene {scene.order} env
                </button>
              ) : null}
            </div>
          ) : null}
          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 tabular-nums",
              render?.status === "failed" ? "text-red-300" : "text-muted-foreground",
            )}
          >
            {render ? RENDER_STATUS_LABEL[render.status] : `${scene.durationSeconds} s`}
          </span>
        </div>
      </div>

      {/* Center Video / Keyframe / Environment Plate Viewport */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black p-2">
        <div className={cn("relative h-full w-full bg-black", VIDEO_ASPECT_BOX_CLASS[aspect], boxSizeClass)}>
          {activeVideoUrl ? (
            <video
              ref={videoRef}
              key={activeVideoUrl}
              src={activeVideoUrl}
              controls
              playsInline
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              className="absolute inset-0 h-full w-full object-contain"
            />
          ) : effectiveMode === "env" && frame?.environmentDataUrl ? (
            <img
              src={frame.environmentDataUrl}
              alt={`Scene ${scene.order} environment plate`}
              className="absolute inset-0 h-full w-full object-contain"
            />
          ) : frame?.imageDataUrl ? (
            <img
              src={frame.imageDataUrl}
              alt={`Scene ${scene.order}: ${scene.title}`}
              className="absolute inset-0 h-full w-full object-contain"
            />
          ) : null}
          {!hasMonitorVisual && spinning ? (
            <VideoStudioPlaceholderSplash
              title={`Scene ${scene.order}`}
              subtitle={scene.title}
              breathing
              variant="stage"
            />
          ) : null}
        </div>
      </div>

      {/* NLE Transport & Scene Action Bar */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 bg-zinc-900 px-4">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            className={MY_SITES_ICON_BTN}
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
            type="button"
            variant="ghost"
            className={MY_SITES_ICON_BTN}
            disabled={!activeVideoUrl}
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={togglePlay}
          >
            {isPlaying ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={MY_SITES_ICON_BTN}
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
          <span className="bg-zinc-950 px-2.5 py-0.5 text-foreground">
            {formatJoinDescription(scene)}
          </span>
          {scene.environmentId ? (
            <span className="bg-zinc-950 px-2.5 py-0.5 text-primary">
              {scene.environmentId.replace(/_/g, " ")}
            </span>
          ) : null}
          {scene.productView ? (
            <span className="bg-zinc-950 px-2.5 py-0.5 text-muted-foreground">
              {scene.productView.replace(/_/g, " ")}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {onRegenerateEnvironmentPlate && frame?.environmentDataUrl ? (
            <Button
              type="button"
              variant="ghost"
              className={MY_SITES_TOOL_BTN}
              disabled={disabled || spinning}
              onClick={() => onRegenerateEnvironmentPlate(scene.id)}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Redraw env
            </Button>
          ) : null}
          {onRegenerateFrame ? (
            <Button
              type="button"
              variant="ghost"
              className={MY_SITES_TOOL_BTN}
              disabled={disabled || spinning}
              onClick={() => onRegenerateFrame(scene.id)}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Redraw keyframe
            </Button>
          ) : null}
          {canRerenderClip ? (
            <Button
              type="button"
              variant="ghost"
              className={MY_SITES_TOOL_BTN}
              onClick={() => onRerenderSceneClip?.(scene.id)}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Re-render scene {scene.order} clip
            </Button>
          ) : null}
        </div>
      </div>

      {render?.error || frame?.error ? (
        <p className="bg-red-950/60 px-4 py-1.5 text-red-300">{render?.error ?? frame?.error}</p>
      ) : null}
    </div>
  );
}
