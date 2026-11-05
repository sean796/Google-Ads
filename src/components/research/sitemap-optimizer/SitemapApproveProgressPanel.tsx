import { Check } from "lucide-react";
import {
  SITEMAP_APPROVE_STEPS,
  sitemapApproveActiveStepLines,
  sitemapApproveDoneStepLines,
  sitemapApproveOverallPct,
  sitemapApprovePhaseIndeterminate,
  sitemapApproveStepStatus,
  type SitemapApproveProgressView,
  type SitemapApproveStepId,
} from "@/lib/sitemap-optimizer/sitemap-approve-progress-display";
import { cn } from "@/lib/utils";

type Props = {
  progress: SitemapApproveProgressView;
};

export function SitemapApproveProgressPanel({ progress }: Props) {
  const overallPct = sitemapApproveOverallPct(progress);
  const indeterminate = sitemapApprovePhaseIndeterminate(progress);

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 px-2 py-4 sm:px-3">
      <p className="text-center text-base font-semibold text-foreground">
        Approving merge plan
      </p>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : Math.round(overallPct)}
        aria-label="Approve plan progress"
        aria-busy={indeterminate}
      >
        <div className="neo-pulse-competitor-progress-track h-5">
          {indeterminate ? (
            <div className="neo-pulse-competitor-progress-indeterminate" aria-hidden />
          ) : (
            <div
              className="neo-pulse-competitor-progress-fill h-full transition-[width] duration-300 ease-out"
              style={{ width: `${overallPct}%` }}
              aria-hidden
            />
          )}
        </div>
      </div>

      <ol className="flex flex-col gap-2" aria-live="polite">
        {SITEMAP_APPROVE_STEPS.map((step, index) => (
          <StepRow
            key={step.id}
            stepId={step.id}
            stepNumber={index + 1}
            label={step.label}
            progress={progress}
          />
        ))}
      </ol>
    </div>
  );
}

function StepRow({
  stepId,
  stepNumber,
  label,
  progress,
}: {
  stepId: SitemapApproveStepId;
  stepNumber: number;
  label: string;
  progress: SitemapApproveProgressView;
}) {
  const status = sitemapApproveStepStatus(stepId, progress);
  const lines =
    status === "active"
      ? sitemapApproveActiveStepLines(stepId, progress)
      : status === "done"
        ? sitemapApproveDoneStepLines(stepId, progress)
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
