import { useEffect, useRef, useState } from "react";
import { VIDEO_ASPECT_BOX_CLASS } from "@/lib/video-generator/video-model-defaults";
import { VideoStagePreSceneApproval } from "./VideoStagePreSceneApproval";
import { VideoStageProductMonitor } from "./VideoStageProductMonitor";
import { VideoStageTransportBar } from "./VideoStageTransportBar";
import { VideoStudioPlaceholderSplash } from "./VideoStudioPlaceholderSplash";
import {
  RENDER_STATUS_LABEL,
  type StagePreviewMode,
  type VideoStagePanelProps,
} from "./video-stage-panel-helpers";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

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
  // Pre-Scene Simplified Brief Review & Approval Gate (before any storyboard frames are generated)
  if (isPreSceneApproval && plan) {
    return (
      <VideoStagePreSceneApproval
        plan={plan}
        selectedSceneId={selectedSceneId}
        sceneDrafts={sceneDrafts}
        setSceneDrafts={setSceneDrafts}
        disabled={disabled}
        onSelectScene={onSelectScene}
        onToggleSceneApproved={onToggleSceneApproved}
        onSendSceneInstruction={onSendSceneInstruction}
      />
    );
  }

  // Product Lock 2x2 Turntable Viewport or Pre-Plan Monitor
  if (showProductGrid || !plan || !scene) {
    return (
      <VideoStageProductMonitor
        isStreamingPlan={isStreamingPlan}
        planLive={planLive}
        plan={plan}
        showProductGrid={showProductGrid}
        productLock={productLock}
        aspect={aspect}
        brief={brief}
        totalDuration={totalDuration}
        boxSizeClass={boxSizeClass}
        productViewDrafts={productViewDrafts}
        setProductViewDrafts={setProductViewDrafts}
        disabled={disabled}
        hasSubjectPhotos={hasSubjectPhotos}
        onRegenerateProductView={onRegenerateProductView}
        onReviseProductView={onReviseProductView}
        productViewsBatchBusy={productViewsBatchBusy}
        isPreparingSubject={isPreparingSubject}
        isPreparingReferences={isPreparingReferences}
        isPreparingReferenceVideo={isPreparingReferenceVideo}
        hasReferenceVideo={hasReferenceVideo}
        onPromptChange={onPromptChange}
        productPhotoCount={productPhotoCount}
        referenceCount={referenceCount}
        onAddProductFiles={onAddProductFiles}
        onAddReferenceFiles={onAddReferenceFiles}
        onAddVideoFile={onAddVideoFile}
      />
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

      <VideoStageTransportBar
        scenes={scenes}
        activeIndex={activeIndex}
        onSelectScene={onSelectScene}
        activeVideoUrl={activeVideoUrl}
        isPlaying={isPlaying}
        togglePlay={togglePlay}
        currentTime={currentTime}
        totalDuration={totalDuration}
        effectiveMode={effectiveMode}
        scene={scene}
        brief={brief}
        referenceCount={referenceCount}
        frame={frame}
        render={render}
        isRenderActive={isRenderActive}
        isSceneGenerating={isSceneGenerating}
        canRerenderClip={canRerenderClip}
        onRegenerateEnvironmentPlate={onRegenerateEnvironmentPlate}
        onRegenerateFrame={onRegenerateFrame}
        onRestoreReferenceFrame={onRestoreReferenceFrame}
        onSyncAllFramesFromReferenceVideo={onSyncAllFramesFromReferenceVideo}
        onRerenderSceneClip={onRerenderSceneClip}
      />
    </div>
  );
}
