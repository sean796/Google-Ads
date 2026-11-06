import type { Dispatch, SetStateAction } from "react";
import { Plus, Upload, Download, RotateCcw } from "lucide-react";
import { OPTIMIZATION_TILE_COUNTS_ENABLED } from "@/lib/wordpress-optimization-tile-counts";
import { Button, SelectField } from "@/ui";

export interface WordPressFeatureToolbarActionsProps {
  editorialPackageFilter: "all" | "standard" | "lite" | "unassigned";
  setEditorialPackageFilter: Dispatch<SetStateAction<"all" | "standard" | "lite" | "unassigned">>;
  editorialMonthOptions: Array<{ key: string; label: string }>;
  editorialSelectedMonthKey: string;
  setEditorialSelectedMonthKey: Dispatch<SetStateAction<string>>;
  credentialedSiteCount: number;
  isRefreshingAllQuarterCounts: boolean;
  isRefreshingAllOptimizationCounts: boolean;
  refreshAllQuarterCounts: () => Promise<unknown>;
  refreshAllOptimizationCounts: () => Promise<unknown>;
  handleExportAllSitesCsv: () => void;
  sitesCount: number;
  handleAddSite: () => void;
  setBulkImportDialogOpen: Dispatch<SetStateAction<boolean>>;
}

export function WordPressFeatureToolbarActions({
  editorialPackageFilter,
  setEditorialPackageFilter,
  editorialMonthOptions,
  editorialSelectedMonthKey,
  setEditorialSelectedMonthKey,
  credentialedSiteCount,
  isRefreshingAllQuarterCounts,
  isRefreshingAllOptimizationCounts,
  refreshAllQuarterCounts,
  refreshAllOptimizationCounts,
  handleExportAllSitesCsv,
  sitesCount,
  handleAddSite,
  setBulkImportDialogOpen,
}: WordPressFeatureToolbarActionsProps) {
  return (
      <>
        <SelectField tone="data" placeholder="Editorial tier" value={editorialPackageFilter} onValueChange={(v) =>
            setEditorialPackageFilter(v as "all" | "standard" | "lite" | "unassigned")
          } options={[{ value: "all", label: "All tiers" }, { value: "standard", label: "Standard" }, { value: "lite", label: "Lite" }, { value: "unassigned", label: "Unassigned" }]} />
        {editorialMonthOptions.length > 0 && editorialSelectedMonthKey ? (
          <SelectField tone="data" placeholder="Month" value={editorialSelectedMonthKey} onValueChange={setEditorialSelectedMonthKey} options={editorialMonthOptions.map((opt) => ({ value: opt.key, label: opt.label }))} />
        ) : null}
        <Button
          variant="quiet"
          type="button"
          disabled={
            credentialedSiteCount === 0 ||
            isRefreshingAllQuarterCounts ||
            (OPTIMIZATION_TILE_COUNTS_ENABLED && isRefreshingAllOptimizationCounts)
          }
          onClick={() =>
            void (OPTIMIZATION_TILE_COUNTS_ENABLED
              ? Promise.all([refreshAllQuarterCounts(), refreshAllOptimizationCounts()])
              : refreshAllQuarterCounts())
          }
          title={
            OPTIMIZATION_TILE_COUNTS_ENABLED
              ? "Refresh editorial and optimization counts for all properties"
              : "Refresh editorial counts for all properties"
          }
          aria-label={
            OPTIMIZATION_TILE_COUNTS_ENABLED
              ? "Refresh editorial and optimization counts for all properties"
              : "Refresh editorial counts for all properties"
          }
          aria-busy={
            isRefreshingAllQuarterCounts ||
            (OPTIMIZATION_TILE_COUNTS_ENABLED && isRefreshingAllOptimizationCounts)
          }
        >
          <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            {isRefreshingAllQuarterCounts ||
            (OPTIMIZATION_TILE_COUNTS_ENABLED && isRefreshingAllOptimizationCounts)
              ? "Counting"
              : "Counts"}
          </span>
        </Button>
        <Button
          variant="quiet"
          type="button"
          onClick={handleExportAllSitesCsv}
          disabled={sitesCount === 0}
          title="Download all properties as a CSV spreadsheet (includes credentials - store securely)"
          aria-label="Export all properties"
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden />
          all
        </Button>
        <Button
          variant="quiet"
          onClick={() => setBulkImportDialogOpen(true)}
          title="Bulk import properties from CSV"
          aria-label="Bulk import all properties"
        >
          <Upload className="h-4 w-4 shrink-0" aria-hidden />
          all
        </Button>
        <Button
          variant="run"
          onClick={handleAddSite}
          title="Add Site"
          aria-label="Add Site"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Add Site
        </Button>
      </>
  );
}
