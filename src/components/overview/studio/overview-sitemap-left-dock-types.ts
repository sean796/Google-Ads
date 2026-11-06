import type { ContentOptimizerSectionId } from "@/components/content-optimizer/content-optimizer-sections";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { OverviewTabController } from "@/hooks/overview/use-overview-tab-controller";
import type { BulkGeneratorStudioVariant } from "@/lib/bulk/bulk-generator-studio-rows";

export type OverviewSitemapLeftDockBulkGeneratorDock = {
  variant: BulkGeneratorStudioVariant;
  csvLoading?: boolean;
  /** Title + URL slug agents running (CSV enrich). */
  csvEnrichingTitlesUrls?: boolean;
  importParsing?: boolean;
  importedFileName?: string | null;
  csvFileName?: string | null;
  onPickCsvFile?: (file: File | null) => void;
  onPickImportFiles?: (files: File[]) => void;
  promptSelection?: boolean;
  selectedBlogIndices: Set<number>;
  setSelectedBlogIndices: (
    value: Set<number> | ((prev: Set<number>) => Set<number>),
  ) => void;
};

/** @deprecated Use OverviewSitemapLeftDockBulkGeneratorDock */
export type OverviewSitemapLeftDockGeneratorDock = OverviewSitemapLeftDockBulkGeneratorDock;

export interface OverviewSitemapLeftDockProps {
  ctrl: OverviewTabController;
  activeUrl: string | null;
  optimizingRowUrl?: string | null;
  batchBulkState?: BulkOptimizationState;
  batchRunning?: boolean;
  onSelectUrl: (url: string) => void;
  bulkWorkspaceBusy: boolean;
  optimizerSection: ContentOptimizerSectionId;
  onOptimizerSectionChange: (id: ContentOptimizerSectionId) => void;
  bulkGeneratorDock?: OverviewSitemapLeftDockBulkGeneratorDock;
}
