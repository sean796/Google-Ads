import { Fragment, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Film,
  Mic,
  Music,
  Play,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  VIDEO_TRANSITION_DURATIONS,
  VIDEO_TRANSITION_OPTIONS,
  formatTransitionBadge,
  formatVideoPlanAudioSummary,
  type StoryboardFrame,
  type VideoPlan,
  type VideoRenderScene,
  type VideoTransition,
  type VideoTransitionType,
} from "@/lib/video-generator/video-generator-types";
import { VideoStudioPlaceholderSplash } from "./VideoStudioPlaceholderSplash";
import { cn } from "@/lib/utils";
import { Button, FileInput } from "@/ui";

export type VideoTimelineDockProps = {
  plan: VideoPlan | null;
  totalSeconds: number;
  frames: StoryboardFrame[];
  renderScenes: VideoRenderScene[] | null;
  selectedSceneId: string | null;
  disabled: boolean;
  onSelectScene: (sceneId: string) => void;
  onPreviewClip?: (sceneId: string) => void;
  onRegenerateFrame: (sceneId: string) => void;
  onRerenderSceneClip?: (sceneId: string) => void;
  onUpdateSceneTransition?: (sceneId: string, transition: VideoTransition, applyToAll?: boolean) => void;
  onOpenPostCutForScene?: (sceneId: string) => void;
  onAddVideoClips?: (files: FileList | File[]) => void;
  onMoveScene?: (sceneId: string, direction: -1 | 1) => void;
  onRemoveScene?: (sceneId: string) => void;
};

function buildRulerTicks(totalSeconds: number): number[] {
  const step = totalSeconds <= 30 ? 5 : totalSeconds <= 60 ? 10 : 15;
  const ticks: number[] = [];
  for (let t = 0; t <= totalSeconds; t += step) {
    ticks.push(t);
  }
  if (ticks[ticks.length - 1] !== totalSeconds) {
    ticks.push(totalSeconds);
  }
  return ticks;
}

export function VideoTimelineDock({
  plan,
  totalSeconds,
  frames,
  renderScenes,
  selectedSceneId,
  disabled,
  onSelectScene,
  onPreviewClip,
  onRegenerateFrame,
  onRerenderSceneClip,
  onUpdateSceneTransition,
  onOpenPostCutForScene,
  onAddVideoClips,
  onMoveScene,
  onRemoveScene,
}: VideoTimelineDockProps) {
  const [editingTransitionSceneId, setEditingTransitionSceneId] = useState<string | null>(null);
  const clipInputRef = useRef<HTMLInputElement>(null);
  const effectiveTotal =
    plan?.scenes.reduce((sum, s) => sum + s.durationSeconds, 0) || totalSeconds || 30;
  const ticks = buildRulerTicks(effectiveTotal);

  const editingScene =
    editingTransitionSceneId && plan
      ? plan.scenes.find((s) => s.id === editingTransitionSceneId) ?? null
      : null;
  const activeTransition = editingScene?.transitionIn ?? { type: "dissolve" as const, seconds: 0.7 };
  const activeTransitionMeta =
    VIDEO_TRANSITION_OPTIONS.find((o) => o.value === activeTransition.type) ?? VIDEO_TRANSITION_OPTIONS[0];

  const applyTransitionType = (type: VideoTransitionType) => {
    if (!editingScene || !onUpdateSceneTransition) return;
    const meta = VIDEO_TRANSITION_OPTIONS.find((o) => o.value === type);
    const seconds = meta?.hasDuration
      ? activeTransition.seconds > 0
        ? activeTransition.seconds
        : meta.defaultSeconds
      : 0;
    onUpdateSceneTransition(editingScene.id, { type, seconds }, false);
  };

  const applyTransitionDuration = (seconds: number) => {
    if (!editingScene || !onUpdateSceneTransition) return;
    onUpdateSceneTransition(editingScene.id, { type: activeTransition.type, seconds }, false);
  };

  return (
    <section
      aria-label="Multi-track video timeline"
      onDragOver={(e) => {
        if (onAddVideoClips) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!onAddVideoClips || disabled) return;
        e.preventDefault();
        if (e.dataTransfer.files?.length) {
          onAddVideoClips(e.dataTransfer.files);
        }
      }}
      className="relative flex h-52 w-full shrink-0 flex-col bg-black text-base select-none"
    >
      {onAddVideoClips ? (
        <FileInput
          ref={clipInputRef}
          accept="video/*"
          multiple
          onChange={(e) => {
            if (e.target.files?.length) {
              onAddVideoClips(e.target.files);
            }
            e.target.value = "";
          }}
        />
      ) : null}

      {/* Floating Instagram-Style Transition Popover Bar (zero CLS overlay) */}
      {editingScene && onUpdateSceneTransition ? (
        <div
          role="dialog"
          aria-label={`Transition into Scene ${editingScene.order}`}
          className="absolute inset-x-3 top-1 z-30 flex flex-wrap items-center justify-between gap-2 bg-ui-field px-3 py-1.5 shadow-lg ring-1 ring-primary"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-primary">
              Cut {editingScene.order - 1}→{editingScene.order}:
            </span>
            {VIDEO_TRANSITION_OPTIONS.map((opt) => (
              <Button
                pressed={activeTransition.type === opt.value}
                key={opt.value}
                disabled={disabled}
                onClick={() => applyTransitionType(opt.value)}
              >
                {opt.shortLabel}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {activeTransitionMeta.hasDuration
              ? VIDEO_TRANSITION_DURATIONS.map((sec) => (
                  <Button
                    variant="quiet"
                    key={sec}
                    disabled={disabled}
                    onClick={() => applyTransitionDuration(sec)}
                  >
                    {sec}s
                  </Button>
                ))
              : null}
            <Button
              variant="run"
              disabled={disabled}
              onClick={() => {
                onUpdateSceneTransition(
                  editingScene.id,
                  {
                    type: activeTransition.type,
                    seconds: activeTransitionMeta.hasDuration
                      ? activeTransition.seconds || activeTransitionMeta.defaultSeconds
                      : 0,
                  },
                  true,
                );
                setEditingTransitionSceneId(null);
              }}
            >
              Apply to all
            </Button>
            <Button
              size="icon" icon={X}
              variant="quiet"
              onClick={() => setEditingTransitionSceneId(null)}
              aria-label="Close transition picker"
            ></Button>
          </div>
        </div>
      ) : null}

      {/* Time Ruler */}
      <div className="flex h-7 w-full shrink-0 items-center bg-ui-field px-3">
        <div className="flex w-28 shrink-0 items-center justify-between pr-2 whitespace-nowrap font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Timeline</span>
        </div>
        <div className="relative flex flex-1 items-center justify-between tabular-nums text-muted-foreground">
          {ticks.map((t) => (
            <span key={t}>{t}s</span>
          ))}
        </div>
      </div>

      {/* Multi-Track Body */}
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 overflow-x-auto px-3 py-2">
        {!plan ? (
          <div className="flex flex-1 items-center justify-center gap-3 bg-ui-field/40 text-muted-foreground">
            <span>Scene filmstrip and audio tracks appear here as soon as the Director writes the scene plan.</span>
            {onAddVideoClips ? (
              <Button
                variant="run"
                disabled={disabled}
                onClick={() => clipInputRef.current?.click()}
              >
                <Plus className="h-4 w-4" aria-hidden />
                <span>Add video clip to timeline</span>
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            {/* Track 1: VIDEO 1 Filmstrip */}
            <div className="flex h-28 w-full items-stretch gap-1">
              <div className="flex w-28 shrink-0 flex-col justify-between bg-ui-field px-2.5 py-2 text-muted-foreground">
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <Film className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="font-medium text-white">VIDEO 1</span>
                </div>
                {onAddVideoClips ? (
                  <Button
                    variant="run"
                    disabled={disabled}
                    onClick={() => clipInputRef.current?.click()}
                    title="Upload and insert a video clip into the timeline"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>Add Clip</span>
                  </Button>
                ) : null}
              </div>

              <div className="flex min-w-0 flex-1 items-stretch gap-1">
                {plan.scenes.map((scene, idx) => {
                  const frame = frames.find((f) => f.sceneId === scene.id);
                  const clip = renderScenes?.find((s) => s.sceneId === scene.id);
                  const selected = scene.id === selectedSceneId;
                  const spinning =
                    frame?.status === "generating" ||
                    frame?.status === "waiting" ||
                    frame?.environmentStatus === "generating" ||
                    clip?.status === "generating";
                  const clipGenerating = clip?.status === "generating";
                  const showTileSplash = spinning && !scene.customClipUrl;
                  const failed = frame?.status === "failed" || clip?.status === "failed";
                  const joinLabel = scene.transitionIn ? formatTransitionBadge(scene.transitionIn) : null;
                  const isEditingThisJoin = editingTransitionSceneId === scene.id;

                  return (
                    <Fragment key={scene.id}>
                      {/* Instagram-Style Between-Scene Transition Junction Button */}
                      {idx > 0 ? (
                        <Button
                          size="icon" icon={Sparkles}
                          pressed={Boolean(isEditingThisJoin)}
                          variant="quiet"
                          disabled={disabled}
                          onClick={() => {
                            onSelectScene(scene.id);
                            setEditingTransitionSceneId((prev) => (prev === scene.id ? null : scene.id));
                          }}
                          title={`Change transition into Scene ${scene.order} (${joinLabel ?? "Cut"})`}
                          aria-label={`Edit transition into scene ${scene.order}`}
                        ></Button>
                      ) : null}

                      <div
                        style={{ flexGrow: scene.durationSeconds, flexBasis: 0 }}
                        className={cn(
                          "group relative flex min-w-[9rem] flex-col justify-between overflow-hidden bg-ui-field transition-all",
                          selected ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-white/30",
                        )}
                      >
                        {/* Repeating filmstrip thumbnails across the clip block */}
                        {showTileSplash ? (
                          <VideoStudioPlaceholderSplash
                            title={`Scene ${scene.order}`}
                            breathing
                            variant="tile"
                          />
                        ) : null}

                        {frame?.imageDataUrl && !spinning ? (
                          <div
                            onClick={() => {
                              onSelectScene(scene.id);
                              onPreviewClip?.(scene.id);
                            }}
                            className={cn(
                              "absolute inset-0 grid cursor-pointer grid-cols-3 opacity-65 transition-opacity group-hover:opacity-80",
                              clipGenerating ? "animate-video-product-splash-breathe" : "",
                            )}
                          >
                            <img
                              src={frame.imageDataUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                            <img
                              src={frame.imageDataUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                            <img
                              src={frame.imageDataUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : scene.customClipUrl ? (
                          <video
                            src={scene.customClipUrl}
                            muted
                            playsInline
                            onClick={() => {
                              onSelectScene(scene.id);
                              onPreviewClip?.(scene.id);
                            }}
                            className="absolute inset-0 h-full w-full cursor-pointer object-cover opacity-65 transition-opacity group-hover:opacity-80"
                          />
                        ) : null}

                        {clip?.status === "done" || scene.customClipUrl ? (
                          <div
                            onClick={() => {
                              onSelectScene(scene.id);
                              onPreviewClip?.(scene.id);
                            }}
                            title={`Preview scene ${scene.order} clip`}
                            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/80 text-primary shadow-lg ring-1 ring-primary/40 backdrop-blur-sm">
                              <Play className="h-4 w-4 translate-x-0.5 fill-current" aria-hidden />
                            </div>
                          </div>
                        ) : null}

                        {/* Top overlay row: Scene number + title + reorder/remove/regenerate controls */}
                        <div className="relative z-10 flex items-center justify-between gap-1 bg-gradient-to-b from-black/85 to-transparent px-2 py-1">
                          <Button
                            variant="quiet"
                            onClick={() => {
                              onSelectScene(scene.id);
                              onPreviewClip?.(scene.id);
                            }}
                          >
                            <span className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center bg-primary px-1 font-semibold tabular-nums text-black">
                              {scene.order}
                            </span>
                            <span className="break-words font-medium text-white">{scene.title}</span>
                          </Button>

                          <div className="flex shrink-0 items-center gap-0.5">
                            {onMoveScene && idx > 0 ? (
                              <Button
                                size="icon" icon={ChevronLeft}
                                variant="run"
                                disabled={disabled}
                                title="Move clip earlier in timeline"
                                aria-label={`Move scene ${scene.order} left`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onMoveScene(scene.id, -1);
                                }}
                              ></Button>
                            ) : null}

                            {onMoveScene && idx < plan.scenes.length - 1 ? (
                              <Button
                                size="icon" icon={ChevronRight}
                                variant="run"
                                disabled={disabled}
                                title="Move clip later in timeline"
                                aria-label={`Move scene ${scene.order} right`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onMoveScene(scene.id, 1);
                                }}
                              ></Button>
                            ) : null}

                            {onOpenPostCutForScene ? (
                              <Button
                                size="icon" icon={SlidersHorizontal}
                                variant="run"
                                title={`Open Post-Cut AI for scene ${scene.order}`}
                                aria-label={`Open Post-Cut AI for scene ${scene.order}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectScene(scene.id);
                                  onOpenPostCutForScene(scene.id);
                                }}
                              ></Button>
                            ) : null}

                            {!scene.customClipFile ? (
                              <Button
                                size="icon" icon={RefreshCw}
                                variant="run"
                                disabled={disabled || spinning}
                                title={
                                  renderScenes && onRerenderSceneClip
                                    ? `Re-render scene ${scene.order} clip`
                                    : plan.referenceStillsFlythrough || scene.postCutReferenceDataUrl
                                      ? `Restore scene ${scene.order} real video still`
                                      : `Redraw scene ${scene.order} keyframe`
                                }
                                aria-label={`Regenerate scene ${scene.order}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (renderScenes && onRerenderSceneClip) {
                                    onRerenderSceneClip(scene.id);
                                  } else {
                                    onRegenerateFrame(scene.id);
                                  }
                                }}
                              ></Button>
                            ) : null}

                            {onRemoveScene && plan.scenes.length > 1 ? (
                              <Button
                                size="icon" icon={Trash2}
                                variant="danger"
                                disabled={disabled}
                                title={`Remove scene ${scene.order} from timeline`}
                                aria-label={`Remove scene ${scene.order}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveScene(scene.id);
                                }}
                              ></Button>
                            ) : null}
                          </div>
                        </div>

                        {/* Bottom overlay row: Join badge + revision count + status + duration */}
                        <div className="relative z-10 flex items-center justify-between gap-1.5 bg-gradient-to-t from-black/90 to-transparent px-2 py-1 text-left">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {spinning && !frame?.imageDataUrl && !scene.customClipUrl ? (
                              <span
                                className="h-2 w-2 shrink-0 animate-video-product-splash-breathe bg-primary"
                                aria-hidden
                              />
                            ) : failed ? (
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-ui-danger-hover" />
                            ) : clip?.status === "done" || frame?.status === "done" || scene.customClipFile ? (
                              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                            ) : null}
                            {joinLabel ? (
                              <Button
                                variant="run"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectScene(scene.id);
                                  if (idx > 0 && onUpdateSceneTransition) {
                                    setEditingTransitionSceneId((prev) => (prev === scene.id ? null : scene.id));
                                  }
                                }}
                              >
                                {joinLabel}
                              </Button>
                            ) : null}
                            {scene.customClipFile ? (
                              <span className="bg-primary/20 px-1.5 text-primary">
                                Clip
                              </span>
                            ) : null}
                            {scene.revisionNotes && scene.revisionNotes.length > 0 ? (
                              <span className="bg-primary/20 px-1.5 text-primary">
                                {scene.revisionNotes.length} edit{scene.revisionNotes.length === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </div>
                          <Button
                            variant="quiet"
                            onClick={() => onSelectScene(scene.id)}
                          >
                            {scene.durationSeconds}s
                          </Button>
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>

            {/* Track 2: VOICE 1 Audio/Narration Track */}
            <div className="flex h-9 w-full items-stretch gap-1.5">
              <div className="flex w-28 shrink-0 items-center gap-2 whitespace-nowrap bg-ui-field px-3 text-muted-foreground">
                <Mic className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="font-medium text-white">VOICE 1</span>
              </div>

              <div className="flex min-w-0 flex-1 items-stretch gap-1.5">
                {plan.scenes.map((scene) => {
                  const selected = scene.id === selectedSceneId;
                  return (
                    // eslint-disable-next-line no-restricted-syntax -- Pulse UI exception: timeline segment sized by scene duration
                    <button
                      key={`voice-${scene.id}`}
                      type="button"
                      style={{ flexGrow: scene.durationSeconds, flexBasis: 0 }}
                      onClick={() => onSelectScene(scene.id)}
                      className={cn(
                        "flex min-w-[9rem] items-center gap-2 overflow-hidden bg-ui-field/80 px-2.5 text-left transition-colors",
                        selected ? "bg-ui-field-hover text-white" : "text-muted-foreground hover:text-white",
                      )}
                    >
                      <span className="break-words">
                        {plan.voice === "none"
                          ? "No narration track"
                          : scene.narration || `(${plan.voice})`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {plan.audio && plan.audio.backingTrack !== "none" ? (
              <div className="flex h-9 w-full items-stretch gap-1.5">
                <div className="flex w-28 shrink-0 items-center gap-2 whitespace-nowrap bg-ui-field px-3 text-muted-foreground">
                  <Music className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="font-medium text-white">MUSIC</span>
                </div>
                <div className="flex min-w-0 flex-1 items-center overflow-hidden bg-ui-field/80 px-3 text-muted-foreground">
                  <span className="break-words">{formatVideoPlanAudioSummary(plan.audio)}</span>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
