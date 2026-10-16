import { formatTransitionBadge, type VideoPlan } from "@/lib/video-generator/video-generator-types";
import { cn } from "@/lib/utils";

/**
 * Compact Scene Plan Inspector for the Video Editor Left Sidebar.
 * Clicking a scene selects it in the Center Stage Monitor and Timeline, and shows its clean summary.
 */
export function VideoPlanPanel({
  plan,
  selectedSceneId,
  onSelectScene,
  referenceNames,
}: {
  plan: VideoPlan;
  selectedSceneId?: string | null;
  onSelectScene?: (sceneId: string) => void;
  referenceNames: string[];
}) {
  const total = plan.scenes.reduce((s, sc) => s + sc.durationSeconds, 0);
  const c = plan.continuity;
  const activeSceneId = selectedSceneId ?? plan.scenes[0]?.id ?? null;

  return (
    <div className="flex flex-col gap-2.5 text-base">
      {/* Plan Header & Continuity Summary */}
      <div className="flex flex-col gap-1.5 bg-zinc-900 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-semibold text-white">{plan.title}</p>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {plan.scenes.length} scenes · {total}s
          </span>
        </div>
        <p className="text-muted-foreground">{plan.logline}</p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="bg-zinc-950 px-2 py-0.5 text-muted-foreground">
            {c.screenDirection.replace(/_/g, " ")}
          </span>
          <span className="bg-zinc-950 px-2 py-0.5 text-muted-foreground">
            {c.cameraSide}
          </span>
          {plan.voice !== "none" ? (
            <span className="bg-zinc-950 px-2 py-0.5 text-primary">
              Voice: {plan.voice}
            </span>
          ) : null}
        </div>
      </div>

      {/* Compact Selectable Scene Inspector Cards */}
      <div className="flex flex-col gap-1.5">
        <span className="font-semibold text-white">Scenes</span>
        {plan.scenes.map((scene) => {
          const isSelected = scene.id === activeSceneId;
          const joinBadge = formatTransitionBadge(scene.transitionIn);

          return (
            <div
              key={scene.id}
              className={cn(
                "flex flex-col bg-zinc-900 transition-colors",
                isSelected ? "ring-1 ring-primary" : "hover:bg-zinc-800/80",
              )}
            >
              <button
                type="button"
                onClick={() => onSelectScene?.(scene.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center px-1 font-semibold tabular-nums",
                      isSelected ? "bg-primary text-black" : "bg-zinc-950 text-white",
                    )}
                  >
                    {scene.order}
                  </span>
                  <span className="truncate font-medium text-white">{scene.title}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="bg-zinc-950 px-1.5 py-0.5 text-muted-foreground">
                    {joinBadge}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{scene.durationSeconds}s</span>
                </div>
              </button>

              {isSelected ? (
                <div className="flex flex-col gap-2 border-t border-white/10 px-3 py-2.5">
                  <p className="text-foreground">{scene.sceneInstructions}</p>
                  {scene.revisionNotes && scene.revisionNotes.length > 0 ? (
                    <div className="flex flex-col gap-1 bg-zinc-950 p-2.5 text-primary">
                      {scene.revisionNotes.map((n, i) => (
                        <p key={`${i}-${n}`}>{i + 1}. {n}</p>
                      ))}
                    </div>
                  ) : null}
                  {scene.narration ? (
                    <p className="text-muted-foreground">{scene.narration}</p>
                  ) : null}
                  {scene.referenceIndexes.length > 0 ? (
                    <p className="text-muted-foreground">
                      <span className="font-medium text-white">Beat Ref:</span>{" "}
                      {scene.referenceIndexes
                        .map((n) => referenceNames[n - 1] ?? `Image ${n}`)
                        .join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
