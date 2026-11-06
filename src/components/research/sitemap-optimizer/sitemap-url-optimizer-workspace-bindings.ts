import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { UrlOptimizerDetailsPanelProps } from "@/components/research/url-optimizer/UrlOptimizerDetailsPanel";
import type { UrlOptimizerToolbarProps } from "@/components/research/url-optimizer/UrlOptimizerToolbar";

export type SitemapUrlOptimizerWorkspaceBindings = {
  running: boolean;
  progressSnapshot: MetaBulkMicroSnapshot | null;
  canOpenDetails: boolean;
  toolbarProps: UrlOptimizerToolbarProps;
  detailsProps: UrlOptimizerDetailsPanelProps;
  onUploadClick: () => void;
};
