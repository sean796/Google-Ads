import { Check } from "lucide-react";
import {
  URL_OPTIMIZER_STEPS,
  urlOptimizerActiveStepSublines,
  urlOptimizerOverallPct,
  urlOptimizerPhaseIndeterminate,
  urlOptimizerPhasePct,
  urlOptimizerStepStatus,
  type UrlOptimizerStepId,
} from "@/lib/url-optimizer/url-optimizer-progress-display";
import type { UrlOptimizerProgress } from "@/lib/url-optimizer/types";
import { cn } from "@/lib/utils";

type Props = {
  progress: UrlOptimizerProgress;
};

export function UrlOptimizerProgressSteps({
  progress,
  embedded = false,
}: {
  progress: UrlOptimizerProgress;
  embedded?: boolean;
}) {
  const overallPct = urlOptimizerOverallPct(progress);
  const indeterminate = urlOptimizerPhaseIndeterminate(progress);
  const phasePct = urlOptimizerPhasePct(progress);
  const barPct = phasePct ?? overallPct;

  if (embedded) {
    return (
      <ol className="flex flex-col gap-2">
        {URL_OPTIMIZER_STEPS.map((step, index) => (
          <StepRow
            key={step.id}
            stepId={step.id}
            stepNumber={index + 1}
            label={step.label}
            progress={progress}
            phasePct={phasePct}
          />
        ))}
      </ol>
    );
  }

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(barPct)}
      aria-label="URL optimizer progress"
      aria-busy={indeterminate}
    >
      <div className="neo-pulse-competitor-progress-track h-5">
        {indeterminate ? (
          <div className="neo-pulse-competitor-progress-indeterminate" aria-hidden />
        ) : (
          <div
            className="neo-pulse-competitor-progress-fill h-full transition-[width] duration-300 ease-out"
            style={{ width: `${barPct}%` }}
            aria-hidden
          />
        )}
      </div>
      <ol className="mt-4 flex flex-col gap-2">
        {URL_OPTIMIZER_STEPS.map((step, index) => (
          <StepRow
            key={step.id}
            stepId={step.id}
            stepNumber={index + 1}
            label={step.label}
            progress={progress}
            phasePct={phasePct}
          />
        ))}
      </ol>
    </div>
  );
}

export function UrlOptimizerProgressPanel({ progress }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-8">
      <p className="text-center text-base font-semibold text-foreground">URL Optimizer</p>
      <UrlOptimizerProgressSteps progress={progress} />
    </div>
  );
}

function StepRow({
  stepId,
  stepNumber,
  label,
  progress,
  phasePct,
}: {
  stepId: UrlOptimizerStepId;
  stepNumber: number;
  label: string;
  progress: UrlOptimizerProgress;
  phasePct: number | null;
}) {
  const status = urlOptimizerStepStatus(stepId, progress.phase);
  const sublines = urlOptimizerActiveStepSublines(stepId, progress, status, phasePct);

  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        status === "active" && "border-[hsl(var(--semantic-data)/0.55)] bg-[hsl(var(--semantic-data)/0.08)]",
        status === "done" && "border-border/50 bg-black/20 opacity-90",
        status === "pending" && "border-border/30 bg-black/10 opacity-60",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
          status === "active" && "border-primary bg-primary/15 text-primary",
          status === "done" && "border-primary/50 bg-primary/25 text-primary",
          status === "pending" && "border-border bg-black/30 text-muted-foreground",
        )}
        aria-hidden
      >
        {status === "done" ? (
          <Check className="h-4 w-4" />
        ) : status === "active" ? (
          null
        ) : (
          <span className="text-base font-semibold">{stepNumber}</span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-foreground">{label}</p>
        {status === "active" && sublines.length > 0 ? (
          <ul className="mt-1 flex flex-col gap-0.5">
            {sublines.map((line) => (
              <li key={line} className="break-words text-base tabular-nums text-muted-foreground">
                {line}
              </li>
            ))}
          </ul>
        ) : status === "pending" ? (
          <p className="mt-1 text-base text-muted-foreground">Waiting</p>
        ) : status === "done" ? (
          <p className="mt-1 text-base text-muted-foreground">Done</p>
        ) : null}
      </div>
    </li>
  );
}
