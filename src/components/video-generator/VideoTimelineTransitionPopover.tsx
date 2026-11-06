import { X } from "lucide-react";
import {
  VIDEO_TRANSITION_DURATIONS,
  VIDEO_TRANSITION_OPTIONS,
  type VideoPlan,
  type VideoTransition,
  type VideoTransitionType,
} from "@/lib/video-generator/video-generator-types";
import { Button } from "@/ui";

export function VideoTimelineTransitionPopover({
  editingScene,
  activeTransition,
  activeTransitionMeta,
  disabled,
  applyTransitionType,
  applyTransitionDuration,
  onUpdateSceneTransition,
  setEditingTransitionSceneId,
}: {
  editingScene: VideoPlan["scenes"][number];
  activeTransition: VideoTransition;
  activeTransitionMeta: (typeof VIDEO_TRANSITION_OPTIONS)[number];
  disabled: boolean;
  applyTransitionType: (type: VideoTransitionType) => void;
  applyTransitionDuration: (seconds: number) => void;
  onUpdateSceneTransition: (sceneId: string, transition: VideoTransition, applyToAll?: boolean) => void;
  setEditingTransitionSceneId: (value: string | null) => void;
}) {
  return (
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
  );
}
