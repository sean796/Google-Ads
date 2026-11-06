import type { Dispatch, SetStateAction } from "react";
import { Check, Send } from "lucide-react";
import type { VideoPlan } from "@/lib/video-generator/video-generator-types";
import { DecisionAuditRowBadge } from "@/components/keyword-research/bulk/DecisionAuditRowBadge";
import { cn } from "@/lib/utils";
import { Button, Field } from "@/ui";

type VideoStagePreSceneApprovalProps = {
  plan: VideoPlan;
  selectedSceneId: string | null;
  sceneDrafts: Record<string, string>;
  setSceneDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  disabled?: boolean;
  onSelectScene?: (sceneId: string) => void;
  onToggleSceneApproved?: (sceneId: string) => void;
  onSendSceneInstruction?: (
    sceneId: string,
    instruction: string,
    postCutReference?: { dataUrl: string; fileName: string },
  ) => void;
};

export function VideoStagePreSceneApproval({
  plan,
  selectedSceneId,
  sceneDrafts,
  setSceneDrafts,
  disabled = false,
  onSelectScene,
  onToggleSceneApproved,
  onSendSceneInstruction,
}: VideoStagePreSceneApprovalProps) {
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
