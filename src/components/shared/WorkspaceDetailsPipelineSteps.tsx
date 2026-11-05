import { Check } from "lucide-react";
import type { MetaPipelineStepUi } from "@/components/overview/overview-tab-constants";
import { cn } from "@/lib/utils";
import { contentOptimizerRowStripeClass } from "@/components/overview/overview-tab/overview-tab-content-constants";
import type { ReactNode } from "react";

export function WorkspaceDetailsPipelineStepRow({
  step,
  stripeIndex,
  trailing,
}: {
  step: MetaPipelineStepUi;
  stripeIndex: number;
  trailing?: ReactNode;
}) {
  const isRunning = step.status === "running";

  return (
    <li
      className={cn(
        "flex items-center gap-2 px-2.5 py-1.5 sm:px-3",
        contentOptimizerRowStripeClass(stripeIndex),
        isRunning && "relative z-10 border border-[hsl(var(--semantic-data)/0.55)]",
      )}
    >
      <span
        className="min-w-0 flex-1 break-words text-base font-medium text-white"
        title={step.label}
      >
        {step.label}
      </span>
      {trailing}
      {step.status === "done" ? (
        <Check className="h-4 w-4 shrink-0 text-primary" aria-label="Complete" />
      ) : null}
      {step.status === "error" ? (
        <span className="shrink-0 text-base text-destructive">Failed</span>
      ) : null}
    </li>
  );
}

export function WorkspaceDetailsPipelineSteps({
  steps,
  renderTrailing,
}: {
  steps: MetaPipelineStepUi[];
  renderTrailing?: (step: MetaPipelineStepUi) => ReactNode;
}) {
  if (steps.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0">
      {steps.map((step, index) => (
        <WorkspaceDetailsPipelineStepRow
          key={step.id}
          step={step}
          stripeIndex={index}
          trailing={renderTrailing?.(step)}
        />
      ))}
    </ul>
  );
}
