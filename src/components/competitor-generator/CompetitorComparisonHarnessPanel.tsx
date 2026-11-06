import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, MinusCircle } from "lucide-react";

import {
  type CompetitorComparisonHarnessGroup,
} from "@/lib/competitor-research/competitor-comparison-harness-state";
import { BULK_ACTIVE_SEMANTIC_BORDER_CLASS } from "@/lib/bulk/bulk-active-semantic-border";
import { cn } from "@/lib/utils";
import { RowButton, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui";

export type CompetitorComparisonHarnessPanelProps = {
  phase: string;
  harnessGroups: CompetitorComparisonHarnessGroup[];
};

export function CompetitorComparisonHarnessPanel({
  phase,
  harnessGroups,
}: CompetitorComparisonHarnessPanelProps) {
  const defaultExpandedKeys = useMemo(
    () => new Set(harnessGroups.map((g) => g.competitorKey)),
    [harnessGroups],
  );
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => defaultExpandedKeys);

  useEffect(() => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      for (const key of defaultExpandedKeys) next.add(key);
      return next;
    });
  }, [defaultExpandedKeys]);

  useEffect(() => {
    const generating = harnessGroups.find((g) => g.status === "generating");
    if (!generating) return;
    setExpandedKeys((prev) => {
      if (prev.has(generating.competitorKey)) return prev;
      const next = new Set(prev);
      next.add(generating.competitorKey);
      return next;
    });
  }, [harnessGroups]);

  return (
    <div className="space-y-3 p-3 text-base font-normal">
      <p className="text-foreground">{phase}</p>

      <ul className="space-y-2" aria-label="Competitor comparison steps">
        {harnessGroups.map((group) => {
          const groupDone = group.steps.filter(
            (s) => s.status === "done" || s.status === "skipped",
          ).length;
          const groupTotal = group.steps.length;
          const isExpanded = expandedKeys.has(group.competitorKey);
          const isGenerating = group.status === "generating";

          return (
            <li key={group.competitorKey}>
              <Collapsible
                open={isExpanded}
                onOpenChange={(open) => {
                  setExpandedKeys((prev) => {
                    const next = new Set(prev);
                    if (open) next.add(group.competitorKey);
                    else next.delete(group.competitorKey);
                    return next;
                  });
                }}
                className={cn(
                  "rounded-md bg-black/20",
                  isGenerating && "border",
                  isGenerating && BULK_ACTIVE_SEMANTIC_BORDER_CLASS,
                  group.status === "done" && "opacity-95",
                  group.status === "skipped" && "opacity-80",
                )}
              >
                <CollapsibleTrigger asChild>
                  <RowButton
                    type="button"
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        isExpanded && "rotate-180",
                      )}
                      aria-hidden
                    />
                    {group.status === "done" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    ) : group.status === "skipped" ? (
                      <MinusCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    ) : (
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          isGenerating ? "bg-primary" : "bg-muted-foreground/50",
                        )}
                        aria-hidden
                      />
                    )}
                    <span
                      className={cn(
                        "min-w-0 flex-1 break-words font-medium",
                        isGenerating ? "text-primary" : "text-foreground",
                      )}
                      title={group.competitorName}
                    >
                      {group.competitorName}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {groupDone}/{groupTotal}
                    </span>
                  </RowButton>
                </CollapsibleTrigger>

                <CollapsibleContent className="space-y-1 px-3 pb-3 data-[state=closed]:animate-none">
                  <ul className="space-y-1">
                    {group.steps.map((step) => {
                      const stepGenerating = step.status === "generating";
                      return (
                        <li
                          key={step.id}
                          className={cn(
                            "flex items-start gap-2 rounded-md bg-black/20 px-2 py-1.5",
                            stepGenerating && "border",
                            stepGenerating && BULK_ACTIVE_SEMANTIC_BORDER_CLASS,
                          )}
                        >
                          {step.status === "done" ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                          ) : step.status === "skipped" ? (
                            <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                          ) : (
                            <span
                              className={cn(
                                "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                                stepGenerating ? "bg-primary" : "bg-muted-foreground/50",
                              )}
                              aria-hidden
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "text-base",
                                stepGenerating ? "font-semibold text-primary" : "text-foreground",
                              )}
                            >
                              {step.label}
                            </p>
                            {step.detail ? (
                              <p className="mt-0.5 text-base text-muted-foreground">{step.detail}</p>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {group.generatedTitle ? (
                    <p className="mt-2 text-base text-muted-foreground">{group.generatedTitle}</p>
                  ) : null}
                </CollapsibleContent>
              </Collapsible>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
