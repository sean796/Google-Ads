import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Film,
  Pause,
  Play,
  RefreshCw,
  Send,
  SkipBack,
  SkipForward,
  Undo2,
} from "lucide-react";
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
import { DecisionAuditRowBadge } from "@/components/keyword-research/bulk/DecisionAuditRowBadge";
import { cn } from "@/lib/utils";
import { Button, Field } from "@/ui";

export type StagePreviewMode = "final" | "clip" | "frame" | "env";

type VideoStagePanelProps = {
  activeTab?: StudioLeftTabId;
  plan: VideoPlan | null;
  planLive?: OpenRouterAppStreamDelta;
  planDrafting?: boolean;
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
  onApproveAllScenes?: () => void;
  onApprovePlanAndBeginStoryboard?: () => void;
  onSendSceneInstruction?: (
    sceneId: string,
    instruction: string,
    postCutReference?: { dataUrl: string; fileName: string },
  ) => void;
  onRegenerateEnvironmentPlate?: (sceneId: string) => void;
  onRegenerateFrame?: (sceneId: string, customInstruction?: string) => void;
  onRestoreReferenceFrame?: (sceneId: string) => void;
  onSyncAllFramesFromReferenceVideo?: () => void;
  onRerenderSceneClip?: (sceneId: string) => void;
  onPromptChange?: (v: string) => void;
  productPhotoCount?: number;
  referenceCount?: number;
  isPreparingSubject?: boolean;
  isPreparingReferences?: boolean;
  isPreparingReferenceVideo?: boolean;
  hasReferenceVideo?: boolean;
  onAddProductFiles?: (files: FileList | File[]) => void;
  onAddReferenceFiles?: (files: FileList | File[]) => void;
  onAddVideoFile?: (file: File) => void;
  /** True while survey/render product views batch is in flight (before lock). */
  productViewsBatchBusy?: boolean;
  previewMode?: StagePreviewMode;
  onPreviewModeChange?: (mode: StagePreviewMode) => void;
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
  planDrafting = false,
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
  onApproveAllScenes,
  onApprovePlanAndBeginStoryboard,
  onSendSceneInstruction,
  onRegenerateEnvironmentPlate,
  onRegenerateFrame,
  onRestoreReferenceFrame,
  onSyncAllFramesFromReferenceVideo,
  onRerenderSceneClip,
  onPromptChange,
  productPhotoCount = 0,
  referenceCount = 0,
  isPreparingSubject = false,
  isPreparingReferences = false,
  isPreparingReferenceVideo = false,
  hasReferenceVideo = false,
  onAddProductFiles,
  onAddReferenceFiles,
  onAddVideoFile,
  productViewsBatchBusy = false,
  previewMode: previewModeProp,
  onPreviewModeChange,
}: VideoStagePanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [internalPreviewMode, setInternalPreviewMode] = useState<StagePreviewMode>("final");
  const previewMode = previewModeProp ?? internalPreviewMode;
  const setPreviewMode = onPreviewModeChange ?? setInternalPreviewMode;
  const [sceneDrafts, setSceneDrafts] = useState<Record<string, string>>({});
  const [productViewDrafts, setProductViewDrafts] = useState<Record<string, string>>({});

  const scenes = plan?.scenes ?? [];
  const selectedIndex = scenes.findIndex((s) => s.id === selectedSceneId);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const scene = scenes[activeIndex] ?? null;
  const frame = scene ? frames.find((f) => f.sceneId === scene.id) : undefined;
  const clip = scene && render ? render.scenes.find((s) => s.sceneId === scene.id) : undefined;
  const sceneClipUrl = clip?.clipUrl ?? scene?.customClipUrl;

  // When a full video render first completes, switch to "final" cut
  const prevRenderIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (render?.finalUrl && render.id !== prevRenderIdRef.current) {
      prevRenderIdRef.current = render.id;
      setPreviewMode("final");
    }
  }, [render?.id, render?.finalUrl, setPreviewMode]);

  // When sceneClipUrl changes or freshly completes, switch to previewing that clip
  const prevClipUrlRef = useRef<string | undefined>(sceneClipUrl);
  useEffect(() => {
    if (sceneClipUrl && sceneClipUrl !== prevClipUrlRef.current) {
      prevClipUrlRef.current = sceneClipUrl;
      setPreviewMode("clip");
    }
  }, [sceneClipUrl, setPreviewMode]);

  // When selectedSceneId changes (user clicks on a scene/clip in timeline or tabs):
  const prevSceneIdRef = useRef<string | null>(selectedSceneId);
  useEffect(() => {
    if (selectedSceneId && prevSceneIdRef.current !== selectedSceneId) {
      prevSceneIdRef.current = selectedSceneId;
      if (sceneClipUrl) {
        setPreviewMode("clip");
      } else if (frame?.imageDataUrl) {
        setPreviewMode("frame");
      }
    }
  }, [selectedSceneId, sceneClipUrl, frame?.imageDataUrl, setPreviewMode]);

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

  const isStreamingPlan = Boolean(
    !plan && (planDrafting || planLive?.content || planLive?.reasoning),
  );
  const hasProductViews = Boolean(
    productLock?.views.some((v) => v.imageDataUrl || v.status === "generating" || v.status === "failed"),
  );
  const showProductGrid = Boolean(productLock && (activeTab === "product" || (!plan && !isStreamingPlan && hasProductViews)));
  const isPreSceneApproval = Boolean(plan && frames.length === 0 && !showProductGrid && !isStreamingPlan);

  // Pre-Scene Simplified Brief Review & Approval Gate (before any storyboard frames are generated)
  if (isPreSceneApproval && plan) {
    const approvedCount = plan.scenes.filter((s) => s.approved).length;
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-black text-base">
        <div className="flex h-10 shrink-0 items-center justify-between gap-3 bg-ui-field px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="break-words font-semibold text-white">
              Scene Brief Review · {plan.title}
            </span>
            {plan.decisionAuditJson ? (
              <DecisionAuditRowBadge auditJson={plan.decisionAuditJson} showScores />
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="bg-black px-2.5 py-1 tabular-nums text-primary font-medium">
              {approvedCount}/{plan.scenes.length} approved
            </span>
          </div>
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
                    "flex cursor-pointer flex-col justify-between gap-2.5 bg-ui-field p-3.5 transition-colors",
                    isSelected ? "ring-2 ring-primary" : "hover:bg-ui-field/80",
                  )}
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center bg-primary px-1.5 font-semibold tabular-nums text-black">
                          {sc.order}
                        </span>
                        <span className="break-words font-semibold text-white">{sc.title}</span>
                        <span className="shrink-0 bg-black px-2 py-0.5 tabular-nums text-muted-foreground">
                          {sc.durationSeconds}s
                        </span>
                      </div>

                      {onToggleSceneApproved ? (
                        <Button
                          pressed={Boolean(sc.approved)}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleSceneApproved(sc.id);
                          }}
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden />
                          <span>{sc.approved ? "Approved" : "Approve"}</span>
                        </Button>
                      ) : null}
                    </div>

                    <p className="text-foreground">{sc.sceneInstructions}</p>

                    {sc.revisionNotes && sc.revisionNotes.length > 0 ? (
                      <div className="flex flex-col gap-0.5 bg-black px-2.5 py-1.5 text-primary">
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
                      <Field
                        value={draftText}
                        onChange={(e) =>
                          setSceneDrafts((prev) => ({ ...prev, [sc.id]: e.target.value }))
                        }
                        disabled={disabled}
                        aria-label={`Natural language prompt for Scene ${sc.order}`}
                        placeholder={`Type what to change in Scene ${sc.order}...`}
                      />
                      <Button
                        variant="quiet"
                        type="submit"
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
      <div className="flex min-h-0 flex-1 flex-col bg-black">
        <div className="flex h-10 shrink-0 items-center justify-between bg-ui-field px-4">
          <span className="break-words font-semibold text-white">
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
          {isStreamingPlan ? (
            planLive?.content || planLive?.reasoning ? (
              <VideoPlanLive live={planLive!} />
            ) : (
              <div className={cn("relative h-full w-full", VIDEO_ASPECT_BOX_CLASS[aspect], boxSizeClass)}>
                <VideoStudioPlaceholderSplash
                  title="Director"
                  subtitle="Writing scene plan…"
                  breathing
                  variant="stage"
                />
              </div>
            )
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
                  <div key={def.id} className="group relative flex flex-col overflow-hidden bg-ui-field">
                    <div className="flex h-8 shrink-0 items-center justify-between bg-black/90 px-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-semibold text-white">{def.shortLabel}</span>
                        <span className="break-words text-muted-foreground">{def.chainHint}</span>
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
                        <Button
                          variant="run"
                          disabled={disabled || spinning || !hasSubjectPhotos}
                          onClick={() => onRegenerateProductView(def.id)}
                          aria-label={`Regenerate ${def.label}`}
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                          <span>Regenerate</span>
                        </Button>
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
                        <div className="flex max-h-full flex-col gap-1 overflow-y-auto px-4 py-3 text-ui-danger-hover">
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
                        className="flex h-9 shrink-0 items-center gap-1.5 bg-black px-2"
                      >
                        <Field
                          value={draftText}
                          onChange={(e) =>
                            setProductViewDrafts((prev) => ({ ...prev, [def.id]: e.target.value }))
                          }
                          disabled={disabled || spinning || !hasSubjectPhotos}
                          aria-label={`Prompt AI to change ${def.label}`}
                          placeholder={`Prompt AI to change ${def.shortLabel} (e.g. "match uploaded color", "show full drop")`}
                        />
                        <Button
                          variant="quiet"
                          type="submit"
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
          ) : isPreparingReferenceVideo ? (
            <div
              className={cn(
                "relative flex h-full w-full items-center justify-center overflow-hidden",
                VIDEO_ASPECT_BOX_CLASS[aspect],
                boxSizeClass,
              )}
            >
              <VideoStudioPlaceholderSplash
                title="Neo Pulse"
                subtitle="Preparing reference video…"
                breathing
                variant="stage"
              />
            </div>
          ) : onPromptChange && onAddProductFiles && onAddReferenceFiles && onAddVideoFile ? (
            <div
              className={cn(
                "relative flex flex-col items-center justify-center bg-ui-field/40 p-6",
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
                hasReferenceVideo={hasReferenceVideo}
                disabled={disabled}
                isPreparingSubject={isPreparingSubject}
                isPreparingReferences={isPreparingReferences}
                isPreparingReferenceVideo={isPreparingReferenceVideo}
                onAddProductFiles={onAddProductFiles}
                onAddReferenceFiles={onAddReferenceFiles}
                onAddVideoFile={onAddVideoFile}
              />
            </div>
          ) : (
            <div
              className={cn(
                "relative flex flex-col items-center justify-center gap-3 bg-ui-field/40 p-6 text-center",
                VIDEO_ASPECT_BOX_CLASS[aspect],
                boxSizeClass,
              )}
            >
              <Film className="h-10 w-10 text-primary/80" aria-hidden />
              <p className="font-semibold text-white">Ready to Direct</p>
              <p className="max-w-md text-muted-foreground">
                Add a brief, video, product photos, or references, then use Ask the Director in the top bar.
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
  const isSceneGenerating =
    frame?.status === "generating" ||
    frame?.environmentStatus === "generating";
  const spinning = isSceneGenerating || (!frame?.imageDataUrl && frame?.status === "waiting");
  const isRenderActive = render?.status === "rendering" || render?.status === "stitching";
  const canRerenderClip =
    Boolean(render && onRerenderSceneClip && frame?.status === "done" && frame.imageDataUrl && frame.videoPrompt) &&
    !disabled &&
    !isRenderActive;

  const hasMonitorVisual =
    Boolean(activeVideoUrl) ||
    Boolean(effectiveMode === "env" && frame?.environmentDataUrl) ||
    Boolean(frame?.imageDataUrl);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-black">
      {/* Top Monitor Bar */}
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 bg-ui-field px-4">
        <p className="break-words font-semibold text-white">{headline}</p>
        <div className="flex shrink-0 items-center gap-2">
          {render || sceneClipUrl || frame?.environmentDataUrl ? (
            <div className="flex items-center gap-1 bg-black p-0.5">
              {render?.finalUrl ? (
                <Button
                  pressed={effectiveMode === "final"}
                  variant="quiet"
                  onClick={() => setPreviewMode("final")}
                >
                  Final cut
                </Button>
              ) : null}
              {sceneClipUrl ? (
                <Button
                  pressed={effectiveMode === "clip"}
                  variant="quiet"
                  onClick={() => setPreviewMode("clip")}
                >
                  Scene {scene.order} clip
                </Button>
              ) : null}
              {frame?.imageDataUrl ? (
                <Button
                  pressed={effectiveMode === "frame"}
                  variant="quiet"
                  onClick={() => setPreviewMode("frame")}
                >
                  Scene {scene.order} frame
                </Button>
              ) : null}
              {frame?.environmentDataUrl ? (
                <Button
                  pressed={effectiveMode === "env"}
                  variant="quiet"
                  onClick={() => setPreviewMode("env")}
                >
                  Scene {scene.order} env
                </Button>
              ) : null}
            </div>
          ) : null}
          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 tabular-nums",
              render?.status === "failed" ? "text-ui-danger-hover" : "text-muted-foreground",
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
          ) : spinning ? (
            <VideoStudioPlaceholderSplash
              title={`Scene ${scene.order}`}
              subtitle="Drawing keyframe from reference…"
              breathing
              variant="stage"
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
        </div>
      </div>

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
    </div>
  );
}
