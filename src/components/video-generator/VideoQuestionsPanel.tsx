import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MY_SITES_FIELD } from "@/components/hosting/my-sites/my-sites-theme";
import type { VideoClarifyQuestion } from "@/lib/video-generator/video-generator-types";
import { cn } from "@/lib/utils";

type VideoQuestionsPanelProps = {
  questions: VideoClarifyQuestion[] | null;
  answers: Record<string, string>;
  disabled: boolean;
  collapsedByDefault?: boolean;
  onAnswer: (id: string, value: string) => void;
};

/** Director's multiple-choice questions for the Video Editor Left Sidebar. Collapses into a 1-row summary once a scene plan exists. */
export function VideoQuestionsPanel({
  questions,
  answers,
  disabled,
  collapsedByDefault = false,
  onAnswer,
}: VideoQuestionsPanelProps) {
  const [collapsed, setCollapsed] = useState(collapsedByDefault);

  useEffect(() => {
    setCollapsed(collapsedByDefault);
  }, [collapsedByDefault]);

  if (!questions) {
    return (
      <div className="bg-zinc-900 p-3 text-base text-muted-foreground">
        Director is reading the brief…
      </div>
    );
  }

  const answeredCount = questions.filter((q) => Boolean(answers[q.id]?.trim())).length;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="flex w-full items-center justify-between bg-zinc-900 px-3 py-2.5 text-left text-base transition-colors hover:bg-zinc-800"
      >
        <span className="font-semibold text-white">Director Q&A</span>
        <span className="inline-flex items-center gap-1.5 tabular-nums text-muted-foreground">
          {answeredCount}/{questions.length} answered
          <ChevronDown className="h-4 w-4 text-primary" aria-hidden />
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 text-base">
      {collapsedByDefault ? (
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="flex w-full items-center justify-between bg-zinc-900 px-3 py-2 text-left transition-colors hover:bg-zinc-800"
        >
          <span className="font-semibold text-white">Director Q&A</span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            Hide
            <ChevronUp className="h-4 w-4 text-primary" aria-hidden />
          </span>
        </button>
      ) : null}

      {questions.map((q, qi) => {
        const answer = answers[q.id] ?? "";
        const custom = answer !== "" && !q.options.includes(answer) ? answer : "";
        return (
          <div key={q.id} className="flex flex-col gap-2 bg-zinc-900 p-3">
            <p className="font-semibold leading-snug text-white">
              <span className="tabular-nums text-muted-foreground">{qi + 1}.</span> {q.text}
            </p>
            <RadioGroup
              value={answer}
              onValueChange={(v) => onAnswer(q.id, v)}
              disabled={disabled}
              className="gap-1.5"
            >
              {q.options.map((opt, oi) => {
                const id = `${q.id}-${oi}`;
                return (
                  <div key={id} className="flex items-start gap-2.5 bg-zinc-950 px-2.5 py-2">
                    <RadioGroupItem id={id} value={opt} className="mt-1 shrink-0" />
                    <Label htmlFor={id} className="cursor-pointer text-base font-normal leading-snug text-foreground">
                      {opt}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
            <Input
              value={custom}
              onChange={(e) => onAnswer(q.id, e.target.value)}
              disabled={disabled}
              aria-label={`Your own answer to question ${qi + 1}`}
              placeholder="Your own answer"
              className={cn(MY_SITES_FIELD, "w-full bg-zinc-950 text-base", custom && "ring-1 ring-primary/60")}
            />
          </div>
        );
      })}
    </div>
  );
}
