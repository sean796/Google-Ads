import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { ContentOptimizerSectionId } from "@/components/content-optimizer/content-optimizer-sections";
import type { ContentOptimizerGeneratorChrome } from "@/components/content-optimizer/content-optimizer-generator-chrome";

export type OverviewStudioRowSource = "sitemap" | "bulk-generator";

export interface OverviewTabContentProps {
  site: WordPressSite;
  apiKey: string;
  selectedModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  optimizerSection: ContentOptimizerSectionId;
  onOptimizerSectionChange: (id: ContentOptimizerSectionId) => void;
  /** Shared max row count for pagination slot width (single + multi). */
  paginationLayoutTotal: number;
  generatorChrome?: ContentOptimizerGeneratorChrome;
  /** When bulk-generator, skip sitemap session row hydrate (rows come from Generator bindings). */
  studioRowSource?: OverviewStudioRowSource;
  /** Called after updateRow when studioRowSource is bulk-generator. */
  onBulkGeneratorOverviewRowPatched?: (displayIndex: number, patch: Partial<OverviewRow>) => void;
}
