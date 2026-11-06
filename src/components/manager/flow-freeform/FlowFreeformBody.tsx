import { useCallback, useEffect, useMemo, useRef } from "react";
import { RefreshCw } from "lucide-react";

import { notify } from "@/lib/app-notifications";
import { NOTIFY_GOAL_PROMPT_UPDATED } from "@/lib/notify-messages";
import { cn } from "@/lib/utils";
import type { FlowFreeformClarifyQuestion, FlowFreeformSectionPlan } from "@/lib/flow-freeform/flow-freeform-types";
import {
  CLARIFY_MERGE_SEP,
  mergeClarifiedAnswer,
  parseStoredClarification,
} from "@/components/manager/flow-freeform/flow-freeform-clarify-utils";
import {
  WorkspaceNestedInput,
  WorkspaceNestedTextarea,
} from "@/components/seo/WorkspaceNestedField";
import { Button, TextareaField, RadioGroup, RadioGroupItem } from "@/ui";

export type FlowFreeformBodyProps = {
  flowTitle: string;
  setFlowTitle: (v: string) => void;
  userGoalPrompt: string;
  onUserGoalPromptChange: (v: string) => void;
  clarificationQuestions: FlowFreeformClarifyQuestion[] | null;
  clarificationAnswers: Record<string, string>;
  onClarificationAnswersChange: (next: Record<string, string>) => void;
  sections: FlowFreeformSectionPlan[];
  onSectionsChange: React.Dispatch<React.SetStateAction<FlowFreeformSectionPlan[]>>;
  activeKnowledgeBaseText: string;
  isGenerating: boolean;
  onEnhancePromptAuto?: () => Promise<boolean>;
  onRebuildSection: (plan: FlowFreeformSectionPlan) => void;
  onRebuildAll: () => void;
};

export function FlowFreeformBody({
  flowTitle,
  setFlowTitle,
  userGoalPrompt,
  onUserGoalPromptChange,
  clarificationQuestions,
  clarificationAnswers,
  onClarificationAnswersChange,
  sections,
  onSectionsChange,
  activeKnowledgeBaseText,
  isGenerating,
  onEnhancePromptAuto,
  onRebuildSection,
  onRebuildAll,
}: FlowFreeformBodyProps) {
  const pipelineBusy = isGenerating;
  const hasGoalPrompt = userGoalPrompt.trim().length > 0;
  const kbChars = activeKnowledgeBaseText.trim().length;

  const questionSetKey = useMemo(
    () => clarificationQuestions?.map((q) => q.id).join("\0") ?? "",
    [clarificationQuestions],
  );

  const clarifyAllAnswered = useMemo(() => {
    if (!clarificationQuestions?.length) return false;
    return clarificationQuestions.every((q) => Boolean(clarificationAnswers[q.id]?.trim()));
  }, [clarificationQuestions, clarificationAnswers]);

  const enhanceAutoRef = useRef(onEnhancePromptAuto);
  enhanceAutoRef.current = onEnhancePromptAuto;

  const lastSuccessfulClarifySig = useRef<string>("");
  const prevQuestionSetKey = useRef<string>("");

  useEffect(() => {
    if (questionSetKey !== prevQuestionSetKey.current) {
      prevQuestionSetKey.current = questionSetKey;
      lastSuccessfulClarifySig.current = "";
    }
  }, [questionSetKey]);

  useEffect(() => {
    if (!clarificationQuestions?.length || !clarifyAllAnswered || !hasGoalPrompt) {
      return;
    }
    const sig = clarificationQuestions.map((q) => `${q.id}:${clarificationAnswers[q.id] ?? ""}`).join("|");
    if (sig === lastSuccessfulClarifySig.current) return;

    const t = window.setTimeout(() => {
      void (async () => {
        const fn = enhanceAutoRef.current;
        if (!fn) return;
        const ok = await fn();
        if (ok) {
          lastSuccessfulClarifySig.current = sig;
          notify.success(NOTIFY_GOAL_PROMPT_UPDATED, { id: "freeflow-clarify-complete" });
        }
      })();
    }, 450);

    return () => clearTimeout(t);
  }, [clarifyAllAnswered, clarificationQuestions, clarificationAnswers, hasGoalPrompt]);

  const updateSectionWriterPrompt = useCallback(
    (id: string, writerPrompt: string) => {
      onSectionsChange((prev) => prev.map((s) => (s.id === id ? { ...s, writerPrompt } : s)));
    },
    [onSectionsChange],
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-3 py-4 sm:px-5 sm:py-5">
      <WorkspaceNestedInput
        label="Flow title (optional)"
        value={flowTitle}
        onChange={(e) => setFlowTitle(e.target.value)}
        placeholder="Leave blank to auto-generate from your goal"
      />

      <WorkspaceNestedTextarea
        label="Goal prompt"
        value={userGoalPrompt}
        onChange={(e) => onUserGoalPromptChange(e.target.value)}
        placeholder="Describe what you want the report to accomplish. Optional: use Clarify, then Outline or Report."
        rows={4}
      />
      <p className="text-sm text-muted-foreground">
        Knowledge base is optional -{" "}
        {kbChars > 0
          ? `${kbChars.toLocaleString()} characters of KB will ground sections when relevant.`
          : "add files or profiles in Manager → Knowledge for extra grounding."}
      </p>

      {clarificationQuestions && clarificationQuestions.length > 0 ? (
        <div className="space-y-2">
          <div>
            <p className="text-base font-semibold uppercase tracking-[0.2em] text-muted-foreground">Clarifications</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Pick options below; your goal refines when complete.
            </p>
          </div>
          <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-2 sm:gap-3 2xl:grid-cols-4">
            {clarificationQuestions.map((q, idx) => {
              const stored = clarificationAnswers[q.id] ?? "";
              const { radio: radioVal, custom: customVal } = parseStoredClarification(q, stored);
              const setMerged = (nextMerged: string) => {
                onClarificationAnswersChange({ ...clarificationAnswers, [q.id]: nextMerged });
              };
              return (
                <div
                  key={q.id}
                  className="flex flex-col rounded-xl border border-border/60 bg-gradient-to-b from-black/50 to-black/30 p-3 shadow-sm transition-colors hover:border-border"
                >
                  <div className="mb-2 border-b border-border/40 pb-1.5">
                    <span className="text-base font-semibold uppercase tracking-wider text-muted-foreground">
                      Q{idx + 1}
                    </span>
                  </div>
                  <p className="mb-2 text-sm font-medium leading-snug text-foreground">{q.text}</p>
                  <RadioGroup
                    value={radioVal}
                    onValueChange={(v) => {
                      const next = mergeClarifiedAnswer(v, customVal);
                      setMerged(next);
                    }}
                    className="flex flex-col gap-1.5"
                  >
                    {q.options.map((opt) => (
                      <label
                        key={opt}
                        className={cn(
                          "flex cursor-pointer items-start gap-2 rounded-lg border border-transparent px-2 py-1 text-sm leading-snug transition-colors",
                          radioVal === opt
                            ? "border-primary/40 bg-primary/10 text-foreground"
                            : "hover:bg-muted/20",
                        )}
                      >
                        <RadioGroupItem value={opt} id={`${q.id}-${opt}`} className="mt-0.5 shrink-0" />
                        <span className="text-foreground/95">{opt}</span>
                      </label>
                    ))}
                  </RadioGroup>
                  <label className="mt-2 text-base font-normal text-muted-foreground">Custom detail (optional)</label>
                  <TextareaField
                    value={customVal}
                    onChange={(e) => {
                      const next = mergeClarifiedAnswer(radioVal, e.target.value);
                      setMerged(next);
                    }}
                    placeholder="Your own words - overrides empty choice above"
                    rows={2}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {sections.length > 0 ? (
        <div className="neo-pulse-zone-tile--analysis space-y-3 rounded-md border border-border/50 px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-base font-semibold uppercase tracking-wide text-muted-foreground">Report sections</p>
            <Button
              type="button"
              disabled={pipelineBusy || sections.length === 0}
              onClick={() => void onRebuildAll()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Rebuild all sections
            </Button>
          </div>
          <div className="space-y-4">
            {sections.map((sec) => (
              <div key={sec.id} className="rounded-md border border-border/40 bg-black/25 p-3">
                <div className="mb-2 font-mono text-sm text-primary">{sec.h2Title}</div>
                
                <TextareaField
                  placeholder="Section writer prompt"
                  value={sec.writerPrompt}
                  onChange={(e) => updateSectionWriterPrompt(sec.id, e.target.value)}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={pipelineBusy}
                    onClick={() => void onRebuildSection(sec)}
                  >
                    Rebuild section
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}