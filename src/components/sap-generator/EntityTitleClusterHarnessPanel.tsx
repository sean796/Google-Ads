import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Circle } from "lucide-react";

import {
  countEntityHarnessSteps,
  type EntityTitleHarnessClusterGroup,
} from "@/lib/local-analysis/entity-title-harness-state";
import { cn } from "@/lib/utils";
import { RowButton, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui";

export type EntityTitleClusterHarnessPanelProps = {
  phase: string;
  clusterGroups: EntityTitleHarnessClusterGroup[];
  plannedEntityCount: number;
  isProcessing: boolean;
};

function progressCaption(phase: string): string {
  const norm = phase.trim().toLowerCase();
  if (norm.startsWith("writing titles")) {
    return "entity titles complete";
  }
  if (norm.includes("generating sap rows") || norm.includes("linked")) {
    return "entity locations assigned";
  }
  return "entity locations planned";
}

export function EntityTitleClusterHarnessPanel({
  phase,
  clusterGroups,
  plannedEntityCount,
  isProcessing,
}: EntityTitleClusterHarnessPanelProps) {
  const defaultExpandedKeys = useMemo(
    () => new Set(clusterGroups.map((g) => g.clusterKey)),
    [clusterGroups],
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
    const generating = clusterGroups.find((g) => g.status === "generating");
    if (!generating) return;
    setExpandedKeys((prev) => {
      if (prev.has(generating.clusterKey)) return prev;
      const next = new Set(prev);
      next.add(generating.clusterKey);
      return next;
    });
  }, [clusterGroups]);

  const { done: doneEntities, total: totalEntities } = countEntityHarnessSteps(clusterGroups);
  const sectionTotal = plannedEntityCount > 0 ? plannedEntityCount : totalEntities;
  const pct = Math.round((doneEntities / Math.max(sectionTotal, 1)) * 100);
  const caption = progressCaption(phase);

  const toggleExpanded = (key: string, open: boolean) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  return (
    <div className="space-y-3 p-3 text-base font-normal">
      <p className="text-foreground">{phase}</p>

      {isProcessing ? (
        <div className="space-y-1.5">
          <div className="neo-pulse-competitor-progress-track rounded-sm">
            <div
              className="neo-pulse-competitor-progress-fill h-2 rounded-sm transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <p className="text-base text-muted-foreground">
            {doneEntities}/{sectionTotal} {caption}
          </p>
        </div>
      ) : null}

      <ul className="space-y-2" aria-label="Title clusters">
        {clusterGroups.map((group) => {
          const clusterDone = group.entities.filter((e) => e.status === "done").length;
          const clusterTotal = group.entities.length;
          const isExpanded = expandedKeys.has(group.clusterKey);
          const isGenerating = group.status === "generating";

          return (
            <li key={group.clusterKey}>
              <Collapsible
                open={isExpanded}
                onOpenChange={(open) => toggleExpanded(group.clusterKey, open)}
                className={cn(
                  "rounded-md bg-black/20",
                  isGenerating && "ring-1 ring-primary/20",
                  group.status === "done" && "opacity-95",
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
                    {group.status === "generating" ? (
                      null
                    ) : group.status === "done" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 break-words font-medium text-foreground" title={group.seedKeyword}>
                      {group.seedKeyword}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {clusterDone}/{clusterTotal}
                    </span>
                  </RowButton>
                </CollapsibleTrigger>

                <CollapsibleContent className="space-y-1 px-3 pb-3 data-[state=closed]:animate-none">
                  <ul className="space-y-1">
                    {group.entities.map((step, stepIndex) => (
                      <li
                        key={`${group.clusterKey}-${step.rowIndex}`}
                        className="flex items-start gap-2 rounded-md bg-black/20 px-2 py-1.5"
                      >
                        {step.status === "generating" ? (
                          null
                        ) : step.status === "done" ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                        ) : (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-base text-foreground">
                            <span className="text-muted-foreground">{stepIndex + 1}. </span>
                            {step.entity}
                          </p>
                          {step.title ? (
                            <p className="mt-0.5 text-base text-muted-foreground">{step.title}</p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
