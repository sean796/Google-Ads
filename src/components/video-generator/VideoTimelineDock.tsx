import { Fragment, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Film,
  Loader2,
  Mic,
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
  type StoryboardFrame,
  type VideoPlan,
  type VideoRenderScene,
  type VideoTransition,
  type VideoTransitionType,
} from "@/lib/video-generator/video-generator-types";
import { cn } from "@/lib/utils";

export type VideoTimelineDockProps = {
  plan: VideoPlan | null;
  totalSeconds: number;
  frames: StoryboardFrame[];
  renderScenes: VideoRenderScene[] | null;
  selectedSceneId: string | null;
  disabled: boolean;
  onSelectScene: (sceneId: string) => void;
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
      className="relative flex h-52 w-full shrink-0 flex-col bg-zinc-950 text-base select-none"
    >
      {onAddVideoClips ? (
        <input
          ref={clipInputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
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
          className="absolute inset-x-3 top-1 z-30 flex flex-wrap items-center justify-between gap-2 bg-zinc-900 px-3 py-1.5 shadow-lg ring-1 ring-primary"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-primary">
              Cut {editingScene.order - 1}→{editingScene.order}:
            </span>
            {VIDEO_TRANSITION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                onClick={() => applyTransitionType(opt.value)}
                className={cn(
                  "px-2 py-0.5 text-base transition-colors",
                  activeTransition.type === opt.value
                    ? "bg-primary font-semibold text-black"
                    : "bg-zinc-950 text-muted-foreground hover:text-white",
                )}
              >
                {opt.shortLabel}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {activeTransitionMeta.hasDuration
              ? VIDEO_TRANSITION_DURATIONS.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    disabled={disabled}
                    onClick={() => applyTransitionDuration(sec)}
                    className={cn(
                      "px-2 py-0.5 tabular-nums transition-colors",
                      (activeTransition.seconds || activeTransitionMeta.defaultSeconds) === sec
                        ? "bg-white font-semibold text-black"
                        : "bg-zinc-950 text-muted-foreground hover:text-white",
                    )}
                  >
                    {sec}s
                  </button>
                ))
              : null}
            <button
              type="button"
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
              className="bg-zinc-950 px-2.5 py-0.5 text-primary hover:bg-primary hover:text-black"
            >
              Apply to all
            </button>
            <button
              type="button"
              onClick={() => setEditingTransitionSceneId(null)}
              aria-label="Close transition picker"
              className="flex h-6 w-6 items-center justify-center bg-zinc-950 text-muted-foreground hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}

      {/* Time Ruler */}
      <div className="flex h-7 w-full shrink-0 items-center bg-zinc-900 px-3">
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
          <div className="flex flex-1 items-center justify-center gap-3 bg-zinc-900/40 text-muted-foreground">
            <span>Scene filmstrip and audio tracks appear here as soon as the Director writes the scene plan.</span>
            {onAddVideoClips ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => clipInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 bg-zinc-900 px-3 py-1 font-medium text-primary hover:bg-primary hover:text-black disabled:opacity-40"
              >
                <Plus className="h-4 w-4" aria-hidden />
                <span>Add video clip to timeline</span>
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {/* Track 1: VIDEO 1 Filmstrip */}
            <div className="flex h-28 w-full items-stretch gap-1">
              <div className="flex w-28 shrink-0 flex-col justify-between bg-zinc-900 px-2.5 py-2 text-muted-foreground">
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <Film className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="font-medium text-white">VIDEO 1</span>
                </div>
                {onAddVideoClips ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => clipInputRef.current?.click()}
                    title="Upload and insert a video clip into the timeline"
                    className="inline-flex items-center justify-center gap-1 bg-zinc-950 px-2 py-1 text-primary hover:bg-primary hover:text-black disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>Add Clip</span>
                  </button>
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
                  const failed = frame?.status === "failed" || clip?.status === "failed";
                  const joinLabel = scene.transitionIn ? formatTransitionBadge(scene.transitionIn) : null;
                  const isEditingThisJoin = editingTransitionSceneId === scene.id;

                  return (
                    <Fragment key={scene.id}>
                      {/* Instagram-Style Between-Scene Transition Junction Button */}
                      {idx > 0 ? (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            onSelectScene(scene.id);
                            setEditingTransitionSceneId((prev) => (prev === scene.id ? null : scene.id));
                          }}
                          title={`Change transition into Scene ${scene.order} (${joinLabel ?? "Cut"})`}
                          aria-label={`Edit transition into scene ${scene.order}`}
                          className={cn(
                            "flex w-6 shrink-0 flex-col items-center justify-center bg-zinc-900 px-0.5 text-muted-foreground transition-colors hover:bg-primary hover:text-black",
                            isEditingThisJoin && "bg-primary font-semibold text-black",
                          )}
                        >
                          <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        </button>
                      ) : null}

                      <div
                        style={{ flexGrow: scene.durationSeconds, flexBasis: 0 }}
                        className={cn(
                          "group relative flex min-w-[9rem] flex-col justify-between overflow-hidden bg-zinc-900 transition-all",
                          selected ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-white/30",
                        )}
                      >
                        {/* Repeating filmstrip thumbnails across the clip block */}
                        {frame?.imageDataUrl ? (
                          <div
                            onClick={() => onSelectScene(scene.id)}
                            className="absolute inset-0 grid cursor-pointer grid-cols-3 opacity-65 transition-opacity group-hover:opacity-80"
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
                            onClick={() => onSelectScene(scene.id)}
                            className="absolute inset-0 h-full w-full cursor-pointer object-cover opacity-65 transition-opacity group-hover:opacity-80"
                          />
                        ) : null}

                        {/* Top overlay row: Scene number + title + reorder/remove/regenerate controls */}
                        <div className="relative z-10 flex items-center justify-between gap-1 bg-gradient-to-b from-black/85 to-transparent px-2 py-1">
                          <button
                            type="button"
                            onClick={() => onSelectScene(scene.id)}
                            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                          >
                            <span className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center bg-primary px-1 font-semibold tabular-nums text-black">
                              {scene.order}
                            </span>
                            <span className="truncate font-medium text-white">{scene.title}</span>
                          </button>

                          <div className="flex shrink-0 items-center gap-0.5">
                            {onMoveScene && idx > 0 ? (
                              <button
                                type="button"
                                disabled={disabled}
                                title="Move clip earlier in timeline"
                                aria-label={`Move scene ${scene.order} left`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onMoveScene(scene.id, -1);
                                }}
                                className="flex h-6 w-5 items-center justify-center bg-black/80 text-white opacity-0 transition-opacity hover:bg-primary hover:text-black group-hover:opacity-90"
                              >
                                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            ) : null}

                            {onMoveScene && idx < plan.scenes.length - 1 ? (
                              <button
                                type="button"
                                disabled={disabled}
                                title="Move clip later in timeline"
                                aria-label={`Move scene ${scene.order} right`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onMoveScene(scene.id, 1);
                                }}
                                className="flex h-6 w-5 items-center justify-center bg-black/80 text-white opacity-0 transition-opacity hover:bg-primary hover:text-black group-hover:opacity-90"
                              >
                                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            ) : null}

                            {onOpenPostCutForScene ? (
                              <button
                                type="button"
                                title={`Open Post-Cut AI for scene ${scene.order}`}
                                aria-label={`Open Post-Cut AI for scene ${scene.order}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectScene(scene.id);
                                  onOpenPostCutForScene(scene.id);
                                }}
                                className="flex h-6 w-6 shrink-0 items-center justify-center bg-black/80 text-primary opacity-85 hover:bg-primary hover:text-black"
                              >
                                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            ) : null}

                            {!scene.customClipFile ? (
                              <button
                                type="button"
                                disabled={disabled || spinning}
                                title={
                                  renderScenes && onRerenderSceneClip
                                    ? `Re-render scene ${scene.order} clip`
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
                                className="flex h-6 w-6 shrink-0 items-center justify-center bg-black/80 text-white opacity-80 hover:bg-primary hover:text-black disabled:opacity-40"
                              >
                                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            ) : null}

                            {onRemoveScene && plan.scenes.length > 1 ? (
                              <button
                                type="button"
                                disabled={disabled}
                                title={`Remove scene ${scene.order} from timeline`}
                                aria-label={`Remove scene ${scene.order}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveScene(scene.id);
                                }}
                                className="flex h-6 w-6 shrink-0 items-center justify-center bg-black/80 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-90"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {/* Bottom overlay row: Join badge + revision count + status + duration */}
                        <div className="relative z-10 flex items-center justify-between gap-1.5 bg-gradient-to-t from-black/90 to-transparent px-2 py-1 text-left">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {spinning ? (
                              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                            ) : failed ? (
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                            ) : clip?.status === "done" || frame?.status === "done" || scene.customClipFile ? (
                              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                            ) : null}
                            {joinLabel ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectScene(scene.id);
                                  if (idx > 0 && onUpdateSceneTransition) {
                                    setEditingTransitionSceneId((prev) => (prev === scene.id ? null : scene.id));
                                  }
                                }}
                                className="truncate bg-zinc-800/90 px-1.5 py-0.2 text-muted-foreground hover:bg-primary hover:text-black"
                              >
                                {joinLabel}
                              </button>
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
                          <button
                            type="button"
                            onClick={() => onSelectScene(scene.id)}
                            className="shrink-0 bg-black/80 px-1.5 tabular-nums text-white"
                          >
                            {scene.durationSeconds}s
                          </button>
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>

            {/* Track 2: VOICE 1 Audio/Narration Track */}
            <div className="flex h-9 w-full items-stretch gap-1.5">
              <div className="flex w-28 shrink-0 items-center gap-2 whitespace-nowrap bg-zinc-900 px-3 text-muted-foreground">
                <Mic className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="font-medium text-white">VOICE 1</span>
              </div>

              <div className="flex min-w-0 flex-1 items-stretch gap-1.5">
                {plan.scenes.map((scene) => {
                  const selected = scene.id === selectedSceneId;
                  return (
                    <button
                      key={`voice-${scene.id}`}
                      type="button"
                      style={{ flexGrow: scene.durationSeconds, flexBasis: 0 }}
                      onClick={() => onSelectScene(scene.id)}
                      className={cn(
                        "flex min-w-[9rem] items-center gap-2 overflow-hidden bg-zinc-900/80 px-2.5 text-left transition-colors",
                        selected ? "bg-zinc-800 text-white" : "text-muted-foreground hover:text-white",
                      )}
                    >
                      <span className="truncate">
                        {plan.voice === "none"
                          ? "No narration track"
                          : scene.narration || `(${plan.voice})`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
