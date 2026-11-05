import { Check } from "lucide-react";
import {
  sitemapOptimizerActiveStepLines,
  sitemapOptimizerDoneStepLines,
  sitemapOptimizerOverallPct,
  sitemapOptimizerPhaseIndeterminate,
  sitemapOptimizerPhasePct,
  sitemapOptimizerStepStatus,
  stepsForRunMode,
  type SitemapOptimizerStepId,
} from "@/lib/sitemap-optimizer/progress-display";
import type { SitemapOptimizerProgress } from "@/lib/sitemap-optimizer/types";
import { cn } from "@/lib/utils";

type Props = {
  progress: SitemapOptimizerProgress;
  embedded?: boolean;
};

export function SitemapOptimizerProgressSteps({ progress, embedded = false }: Props) {
  const steps = stepsForRunMode(progress.runMode, progress.entityPrimary);

  return (
    <ol className={cn("flex flex-col gap-2", embedded ? "" : "aria-live=polite")} aria-live="polite">
      {steps.map((step, index) => (
        <StepRow
          key={step.id}
          stepId={step.id}
          stepNumber={index + 1}
          label={step.label}
          progress={progress}
        />
      ))}
    </ol>
  );
}

export function SitemapOptimizerProgressPanel({ progress }: Props) {
  const overallPct = sitemapOptimizerOverallPct(progress);
  const indeterminate = sitemapOptimizerPhaseIndeterminate(progress);
  const phasePct = sitemapOptimizerPhasePct(progress);
  const isGrid = progress.runMode === "grid_csv";
  const barPct = phasePct ?? overallPct;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-8">
      <p className="text-center text-base font-semibold text-foreground">
        {isGrid
          ? "Grid CSV harness"
          : progress.entityPrimary
            ? "Analyzing service areas"
            : "Analyzing sitemap"}
      </p>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : Math.round(barPct)}
        aria-label="Analysis progress"
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
      </div>

      <SitemapOptimizerProgressSteps progress={progress} />
    </div>
  );
}

function StepRow({
  stepId,
  stepNumber,
  label,
  progress,
}: {
  stepId: SitemapOptimizerStepId;
  stepNumber: number;
  label: string;
  progress: SitemapOptimizerProgress;
}) {
  const status = sitemapOptimizerStepStatus(
    stepId,
    progress.phase,
    progress.runMode,
    progress.entityPrimary,
  );
  const lines =
    status === "active"
      ? sitemapOptimizerActiveStepLines(stepId, progress)
      : status === "done"
        ? sitemapOptimizerDoneStepLines(stepId, progress)
        : ["Waiting"];

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
        <ul className="mt-1 flex flex-col gap-0.5">
          {lines.map((line) => (
            <li
              key={line}
              className="break-words text-base tabular-nums text-muted-foreground"
            >
              {line}
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}
