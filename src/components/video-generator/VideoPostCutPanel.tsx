import { useState } from "react";
import { RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MY_SITES_FIELD, MY_SITES_POPOVER } from "@/components/hosting/my-sites/my-sites-theme";
import {
  VIDEO_FADE_DURATIONS,
  VIDEO_TRANSITION_DURATIONS,
  VIDEO_TRANSITION_OPTIONS,
  type StoryboardFrame,
  type VideoPlan,
  type VideoRenderSnapshot,
  type VideoTransition,
  type VideoTransitionType,
} from "@/lib/video-generator/video-generator-types";
import { cn } from "@/lib/utils";

export type VideoPostCutPanelProps = {
  plan: VideoPlan | null;
  frames: StoryboardFrame[];
  render: VideoRenderSnapshot | null;
  selectedSceneId: string | null;
  disabled: boolean;
  onSelectScene: (sceneId: string) => void;
  onSendSceneInstruction: (sceneId: string, instruction: string) => void;
  onRegenerateEnvironmentPlate: (sceneId: string) => void;
  onRegenerateFrame: (sceneId: string) => void;
  onRerenderSceneClip: (sceneId: string) => void;
  onUpdateSceneTransition: (sceneId: string, transition: VideoTransition, applyToAll?: boolean) => void;
  onUpdatePlanFades: (fadeInSeconds: number, fadeOutSeconds: number) => void;
  onUpdateScenePrompts?: (
    sceneId: string,
    patch: {
      environmentPrompt?: string;
      storyboardPrompt?: string;
      motionPrompt?: string;
      videoPrompt?: string;
    },
    action?: "save" | "redraw" | "rerender",
  ) => void;
  onRestitch: () => void;
};

const SELECT_TRIGGER_CLASS = `${MY_SITES_FIELD} h-9 w-full bg-zinc-950 px-2.5 text-base whitespace-nowrap [&>span]:line-clamp-none [&>svg]:text-muted-foreground`;

export function VideoPostCutPanel({
  plan,
  frames,
  render,
  selectedSceneId,
  disabled,
  onSelectScene,
  onSendSceneInstruction,
  onRegenerateEnvironmentPlate,
  onRegenerateFrame,
  onRerenderSceneClip,
  onUpdateSceneTransition,
  onUpdatePlanFades,
  onRestitch,
}: VideoPostCutPanelProps) {
  const scenes = plan?.scenes ?? [];
  const activeScene = scenes.find((s) => s.id === selectedSceneId) ?? scenes[0] ?? null;
  const frame = activeScene ? frames.find((f) => f.sceneId === activeScene.id) : undefined;
  const clip = activeScene && render ? render.scenes.find((s) => s.sceneId === activeScene.id) : undefined;

  const [chatText, setChatText] = useState("");

  if (!plan || !activeScene) {
    return (
      <div className="bg-zinc-900 p-4 text-base text-muted-foreground">
        Select any scene once the plan is ready to type changes or adjust transitions.
      </div>
    );
  }

  const transition = activeScene.transitionIn ?? { type: "dissolve" as const, seconds: 0.7 };
  const transitionMeta =
    VIDEO_TRANSITION_OPTIONS.find((o) => o.value === transition.type) ?? VIDEO_TRANSITION_OPTIONS[0];
  const fadeIn = plan.fadeInSeconds ?? 0.6;
  const fadeOut = plan.fadeOutSeconds ?? 0.8;

  const submitChat = () => {
    const trimmed = chatText.trim();
    if (!trimmed || disabled) return;
    onSendSceneInstruction(activeScene.id, trimmed);
    setChatText("");
  };

  return (
    <div className="flex flex-col gap-3.5 text-base">
      {/* Scene Switcher Strip */}
      <div className="flex flex-col gap-2 bg-zinc-900 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-white">Post-Cut Scene Studio</span>
          {activeScene.environmentId ? (
            <span className="bg-zinc-950 px-2 py-0.5 text-primary">
              Loc: {activeScene.environmentId}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {scenes.map((s) => {
            const isCurrent = s.id === activeScene.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectScene(s.id)}
                className={cn(
                  "px-2.5 py-1 tabular-nums transition-colors",
                  isCurrent
                    ? "bg-primary font-semibold text-black"
                    : "bg-zinc-950 text-muted-foreground hover:text-white",
                )}
              >
                S{s.order}
              </button>
            );
          })}
        </div>
        <p className="truncate font-medium text-white">
          Scene {activeScene.order}: {activeScene.title} ({activeScene.durationSeconds}s)
        </p>
      </div>

      {/* Single Empty Prompt Box (Cursor-style) */}
      <form
        className="flex flex-col gap-2 bg-zinc-900 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submitChat();
        }}
      >
        <Textarea
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submitChat();
            }
          }}
          disabled={disabled}
          rows={3}
          aria-label={`Prompt changes for Scene ${activeScene.order}`}
          placeholder={`Type what to change in Scene ${activeScene.order} and press Enter...`}
          className={cn(MY_SITES_FIELD, "h-auto min-h-[5rem] resize-y bg-zinc-950 p-2.5 text-base")}
        />
        <Button
          type="submit"
          disabled={disabled || !chatText.trim()}
          className="h-9 w-full rounded-none bg-primary font-semibold text-black hover:bg-primary/90"
        >
          <Send className="mr-2 h-4 w-4" aria-hidden />
          Apply change to Scene {activeScene.order}
        </Button>

        {activeScene.revisionNotes && activeScene.revisionNotes.length > 0 ? (
          <div className="flex flex-col gap-1 bg-zinc-950 p-2.5">
            {activeScene.revisionNotes.map((note, idx) => (
              <p key={`${idx}-${note}`} className="text-foreground">
                {idx + 1}. {note}
              </p>
            ))}
          </div>
        ) : null}
      </form>

      {/* Environment Plate & Keyframe Side-by-Side Inspector */}
      <div className="grid grid-cols-2 gap-2.5 bg-zinc-900 p-3">
        <div className="flex flex-col gap-1.5 bg-zinc-950 p-2">
          <div className="relative aspect-video w-full overflow-hidden bg-black">
            {frame?.environmentDataUrl ? (
              <img
                src={frame.environmentDataUrl}
                alt={`Scene ${activeScene.order} environment plate`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                Env plate
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            onClick={() => onRegenerateEnvironmentPlate(activeScene.id)}
            className="h-8 w-full bg-zinc-900 px-2 text-base text-white hover:bg-primary hover:text-black"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Redraw env
          </Button>
        </div>

        <div className="flex flex-col gap-1.5 bg-zinc-950 p-2">
          <div className="relative aspect-video w-full overflow-hidden bg-black">
            {frame?.imageDataUrl ? (
              <img
                src={frame.imageDataUrl}
                alt={`Scene ${activeScene.order} keyframe`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                Keyframe
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            onClick={() => onRegenerateFrame(activeScene.id)}
            className="h-8 w-full bg-zinc-900 px-2 text-base text-white hover:bg-primary hover:text-black"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Redraw frame
          </Button>
        </div>

        {render ? (
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || !frame?.imageDataUrl || !frame?.videoPrompt || clip?.status === "generating"}
            onClick={() => onRerenderSceneClip(activeScene.id)}
            className="col-span-2 h-9 w-full bg-primary font-semibold text-black hover:bg-primary/90"
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
            Re-render Scene {activeScene.order} Video Clip
          </Button>
        ) : null}
      </div>

      {/* Instagram-Style Scene Transition & Global Fade Controls */}
      <div className="flex flex-col gap-2.5 bg-zinc-900 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-white">Transitions & Fades</span>
          {render ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onRestitch}
              className="bg-zinc-950 px-2.5 py-1 text-primary hover:bg-primary hover:text-black disabled:opacity-40"
            >
              Re-stitch MP4
            </button>
          ) : null}
        </div>

        {activeScene.order > 1 ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={transition.type}
                disabled={disabled}
                onValueChange={(val) => {
                  const nextType = val as VideoTransitionType;
                  const meta = VIDEO_TRANSITION_OPTIONS.find((o) => o.value === nextType);
                  onUpdateSceneTransition(activeScene.id, {
                    type: nextType,
                    seconds: meta?.hasDuration ? (transition.seconds > 0 ? transition.seconds : meta.defaultSeconds) : 0,
                  });
                }}
              >
                <SelectTrigger className={SELECT_TRIGGER_CLASS} aria-label="Scene transition style">
                  <SelectValue placeholder="Transition style" />
                </SelectTrigger>
                <SelectContent className={MY_SITES_POPOVER}>
                  {VIDEO_TRANSITION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-base">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={String(transitionMeta.hasDuration ? (transition.seconds || transitionMeta.defaultSeconds) : 0)}
                disabled={disabled || !transitionMeta.hasDuration}
                onValueChange={(val) =>
                  onUpdateSceneTransition(activeScene.id, {
                    type: transition.type,
                    seconds: Number(val),
                  })
                }
              >
                <SelectTrigger className={SELECT_TRIGGER_CLASS} aria-label="Transition duration">
                  <SelectValue placeholder="Transition duration" />
                </SelectTrigger>
                <SelectContent className={MY_SITES_POPOVER}>
                  {transitionMeta.hasDuration ? (
                    VIDEO_TRANSITION_DURATIONS.map((sec) => (
                      <SelectItem key={sec} value={String(sec)} className="text-base">
                        {sec}s transition
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="0" className="text-base">
                      0s instant
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              variant="secondary"
              disabled={disabled}
              onClick={() =>
                onUpdateSceneTransition(
                  activeScene.id,
                  {
                    type: transition.type,
                    seconds: transitionMeta.hasDuration ? (transition.seconds || transitionMeta.defaultSeconds) : 0,
                  },
                  true,
                )
              }
              className="h-8 w-full bg-zinc-950 text-base text-muted-foreground hover:bg-primary hover:text-black"
            >
              Apply {transitionMeta.shortLabel} to all scene cuts
            </Button>
          </div>
        ) : (
          <p className="bg-zinc-950 px-2.5 py-2 text-muted-foreground">
            Scene 1 opens the video (use Fade In below). Select Scene 2..{scenes.length} to edit between-clip transitions.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Select
            value={String(fadeIn)}
            disabled={disabled}
            onValueChange={(val) => onUpdatePlanFades(Number(val), fadeOut)}
          >
            <SelectTrigger className={SELECT_TRIGGER_CLASS} aria-label="Video fade in">
              <SelectValue placeholder="Fade in" />
            </SelectTrigger>
            <SelectContent className={MY_SITES_POPOVER}>
              {VIDEO_FADE_DURATIONS.map((sec) => (
                <SelectItem key={sec} value={String(sec)} className="text-base">
                  Fade in: {sec === 0 ? "Off" : `${sec}s`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={String(fadeOut)}
            disabled={disabled}
            onValueChange={(val) => onUpdatePlanFades(fadeIn, Number(val))}
          >
            <SelectTrigger className={SELECT_TRIGGER_CLASS} aria-label="Video fade out">
              <SelectValue placeholder="Fade out" />
            </SelectTrigger>
            <SelectContent className={MY_SITES_POPOVER}>
              {VIDEO_FADE_DURATIONS.map((sec) => (
                <SelectItem key={sec} value={String(sec)} className="text-base">
                  Fade out: {sec === 0 ? "Off" : `${sec}s`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
