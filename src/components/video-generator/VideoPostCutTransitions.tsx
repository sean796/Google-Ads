import { Layers } from "lucide-react";
import {
  VIDEO_FADE_DURATIONS,
  VIDEO_TRANSITION_DURATIONS,
  VIDEO_TRANSITION_OPTIONS,
  type VideoTransitionType,
} from "@/lib/video-generator/video-generator-types";
import { Button, SelectField, Tooltip, TooltipContent, TooltipTrigger } from "@/ui";
import type { VideoPostCutTransitionsProps } from "./video-post-cut-panel-types";

export function VideoPostCutTransitions(props: VideoPostCutTransitionsProps) {
  const {
    activeScene,
    plan,
    render,
    disabled,
    onRestitch,
    onUpdateSceneTransition,
    onUpdatePlanFades,
  } = props;

  const transition = activeScene.transitionIn ?? { type: "dissolve" as const, seconds: 0.7 };
  const transitionMeta =
    VIDEO_TRANSITION_OPTIONS.find((o) => o.value === transition.type) ?? VIDEO_TRANSITION_OPTIONS[0];
  const fadeIn = plan.fadeInSeconds ?? 0.6;
  const fadeOut = plan.fadeOutSeconds ?? 0.8;
  return (
        <div className="flex flex-col gap-2.5 bg-ui-field p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm text-white">Transitions & Fades</span>
            {render ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="run"
                    disabled={disabled}
                    onClick={onRestitch}
                  >
                    Re-stitch MP4
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Re-stitch all finished scene clips into final MP4</TooltipContent>
              </Tooltip>
            ) : null}
          </div>

          {activeScene.order > 1 ? (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <SelectField placeholder="Transition style" value={transition.type} disabled={disabled} onValueChange={(val) => {
                    const nextType = val as VideoTransitionType;
                    const meta = VIDEO_TRANSITION_OPTIONS.find((o) => o.value === nextType);
                    onUpdateSceneTransition(activeScene.id, {
                      type: nextType,
                      seconds: meta?.hasDuration ? (transition.seconds > 0 ? transition.seconds : meta.defaultSeconds) : 0,
                    });
                  }} options={VIDEO_TRANSITION_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))} />

                <SelectField
                  placeholder="Transition duration"
                  value={String(transitionMeta.hasDuration ? (transition.seconds || transitionMeta.defaultSeconds) : 0)}
                  disabled={disabled || !transitionMeta.hasDuration}
                  onValueChange={(val) =>
                    onUpdateSceneTransition(activeScene.id, {
                      type: transition.type,
                      seconds: Number(val),
                    })
                  }
                  options={
                    transitionMeta.hasDuration
                      ? VIDEO_TRANSITION_DURATIONS.map((sec) => ({ value: String(sec), label: `${sec}s transition` }))
                      : [{ value: "0", label: "0s instant" }]
                  }
                  width="full"
                />
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
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
                  >
                    <Layers className="mr-1.5 h-3 w-3" aria-hidden />
                    Apply {transitionMeta.shortLabel} to all cuts
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Apply {transitionMeta.shortLabel} ({transition.seconds}s) to all scene cuts</TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <p className="bg-black px-2.5 py-1.5 text-xs text-muted-foreground">
              Scene 1 opens the video (use Fade In below). Select Scene 2+ for cuts.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <SelectField
              placeholder="Fade in"
              value={String(fadeIn)}
              disabled={disabled}
              onValueChange={(val) => onUpdatePlanFades(Number(val), fadeOut)}
              options={VIDEO_FADE_DURATIONS.map((sec) => ({ value: String(sec), label: `Fade in: ${sec === 0 ? "Off" : `${sec}s`}` }))}
              width="full"
            />

            <SelectField
              placeholder="Fade out"
              value={String(fadeOut)}
              disabled={disabled}
              onValueChange={(val) => onUpdatePlanFades(fadeIn, Number(val))}
              options={VIDEO_FADE_DURATIONS.map((sec) => ({ value: String(sec), label: `Fade out: ${sec === 0 ? "Off" : `${sec}s`}` }))}
              width="full"
            />
          </div>
        </div>
  );
}
