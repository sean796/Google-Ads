import { cn } from "@/lib/utils";
import { SCRAPER_STEPS, getScraperStepIndex } from "@/lib/knowledge-base/scraper-constants";

export type SiteScraperTargetingSequenceProps = {
  currentStepKey: string | null;
};

export function SiteScraperTargetingSequence({ currentStepKey }: SiteScraperTargetingSequenceProps) {
  const currentIndex = getScraperStepIndex(currentStepKey || "init");

  return (
    <div className="flex flex-wrap items-center gap-1">
      {SCRAPER_STEPS.map((step, index) => {
        const isCompleted = currentIndex > index;
        const isCurrent = currentIndex === index;
        const isPending = currentIndex < index;

        return (
          <span
            key={step.key}
            className={cn(
              "rounded px-1.5 py-0.5 font-mono text-base transition-all",
              isCompleted && "bg-primary/30 text-primary",
              isCurrent && "bg-primary/50 font-medium text-black",
              isPending && "bg-ui-field-hover text-muted-foreground",
            )}
          >
            {isCompleted && "✓ "}
            {isCurrent && "● "}
            {step.shortLabel}
          </span>
        );
      })}
    </div>
  );
}
