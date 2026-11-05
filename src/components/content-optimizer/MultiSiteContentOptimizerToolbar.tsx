import { Sparkles } from "lucide-react";
import { Button, CheckField, FilterRow, FilterRowDivider, Pill } from "@/ui";
import type { MultiSiteUrlSource } from "@/lib/content-optimizer/multi-site-source-urls";

export type MultiSiteSelectAllControlProps = {
  actionsBlocked: boolean;
  propertySiteCount: number;
  allSitesSelected: boolean;
  someSitesSelected: boolean;
  onSelectAllChange: (selectAll: boolean) => void;
};

export function MultiSiteSelectAllControl({
  actionsBlocked,
  propertySiteCount,
  allSitesSelected,
  someSitesSelected,
  onSelectAllChange,
}: MultiSiteSelectAllControlProps) {
  return (
    <CheckField
      label="Select all"
      checked={allSitesSelected ? true : someSitesSelected ? "indeterminate" : false}
      disabled={actionsBlocked || propertySiteCount === 0}
      onCheckedChange={onSelectAllChange}
    />
  );
}

export type MultiSiteContentOptimizerToolbarProps = {
  actionsBlocked: boolean;
  optimizeMode: "update" | "draft";
  onOptimizeModeChange: (mode: "update" | "draft") => void;
  optimizeQueueBusy: boolean;
  runnableSelectedCount: number;
  propertySiteCount: number;
  allSitesSelected: boolean;
  someSitesSelected: boolean;
  universalSourceShared: MultiSiteUrlSource | null;
  onSelectAllChange: (selectAll: boolean) => void;
  onOptimizeSelected: () => void;
  onUniversalSitemapSelect: (source: MultiSiteUrlSource) => void;
};

export function MultiSiteContentOptimizerToolbar({
  actionsBlocked,
  optimizeMode,
  onOptimizeModeChange,
  optimizeQueueBusy,
  runnableSelectedCount,
  onOptimizeSelected,
}: MultiSiteContentOptimizerToolbarProps) {
  const countLabel = runnableSelectedCount > 0 ? ` (${runnableSelectedCount})` : "";
  return (
    <>
      <FilterRow aria-label="Multi-site bulk run">
        <Button
          variant="run"
          icon={Sparkles}
          disabled={actionsBlocked || optimizeQueueBusy || runnableSelectedCount === 0}
          onClick={onOptimizeSelected}
          aria-label={optimizeQueueBusy ? "Optimizing selected sites" : `Optimize selected${countLabel}`}
        >
          Selected{countLabel}
        </Button>
      </FilterRow>

      <FilterRowDivider />

      <FilterRow align="end" aria-label="Publish mode">
        <Pill
          label="Live"
          square
          active={optimizeMode === "update"}
          disabled={actionsBlocked}
          onClick={() => onOptimizeModeChange("update")}
        />
        <Pill
          label="Draft"
          square
          active={optimizeMode === "draft"}
          disabled={actionsBlocked}
          onClick={() => onOptimizeModeChange("draft")}
        />
      </FilterRow>
    </>
  );
}
