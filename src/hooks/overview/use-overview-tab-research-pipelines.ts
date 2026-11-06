import type { MutableRefObject } from "react";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
import { useOverviewTabResearchAllBatch } from "@/hooks/overview/use-overview-tab-research-all-batch";
import { useOverviewTabAutoSeoOptimizeAll } from "@/hooks/overview/use-overview-tab-auto-seo-optimize-all";
import { useOverviewTabFeaturedImageBatch } from "@/hooks/overview/use-overview-tab-featured-image-batch";
import { useOverviewTabAllMetaAndExtraPipelines } from "@/hooks/overview/use-overview-tab-all-meta-and-extra-pipelines";

type Args = Pick<
  OverviewTabBase,
  | "rows"
  | "rowsRef"
  | "displayRowsRef"
  | "setExpandedPageUrl"
  | "updateRow"
  | "setBulkActionProgress"
  | "setGscQuickWinsFile"
  | "opt"
  | "bulkSeoExtraOptions"
  | "bindings"
  | "getInventoryMatchForUrl"
  | "prefetchOverviewInventory"
  | "runAiAllMetaBatchForCatalog"
  | "bulkAiFaqSeedCount"
  | "sitemapSource"
  | "optimizeFaq"
  | "optimizeFaqQuestion"
  | "optimizeFaqAnswer"
  | "getDfsSerpContext"
> & {
  site: WordPressSite | undefined;
  gscQuickWinsFile: string | null;
  serpDumpUrl: (filename: string) => string;
  handleDataForSeoResearch: (
    rowIndex: number,
    options?: { skipGsc?: boolean; silent?: boolean },
  ) => Promise<Partial<OverviewRow> | null>;
  ensureOverviewKeywordsForMissingRows: (options?: {
    progressKey?: "research" | "contentKw" | "entityKw";
    silent?: boolean;
    singleBatch?: boolean;
    preserveRowStatus?: boolean;
    skipProgressSlice?: boolean;
  }) => Promise<{ ensured: number; failed: number; keywordsByIndex: Map<number, string> }>;
  handleAiTitleRow: (
    index: number,
    rowOverride?: OverviewRow,
    options?: { skipOptimizeTitleLoading?: boolean },
  ) => Promise<{ title: string; aiTitle: string } | null>;
  handleAiMetaRow: (
    index: number,
    rowOverride?: OverviewRow,
    options?: { skipOptimizeMetaLoading?: boolean },
  ) => Promise<{ metaDescription: string; aiMeta: string } | null>;
  handleAiFaqRowAll: (
    rowIndex: number,
    rowOverride?: OverviewRow,
    options?: {
      silentToast?: boolean;
      skipFaqLoading?: boolean;
      onMicroStep?: () => void;
      seedQuestionCount?: number;
      skipUploadAfterRowWrite?: boolean;
    },
  ) => Promise<void>;
  bulkScopeUrlKeys: Set<string>;
  bulkScopeUrlKeysRef: MutableRefObject<Set<string>>;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
};

export function useOverviewTabResearchPipelines(args: Args) {
  const { handleResearchAll } = useOverviewTabResearchAllBatch(args);
  const { handleOptimizeAll } = useOverviewTabAutoSeoOptimizeAll(args);
  const { handleAiFeaturedImageAll } = useOverviewTabFeaturedImageBatch(args);
  const {
    handleBulkSeoExtraText,
    handleOptimizeAllSerpRow,
    handleAiAllMetaRow,
    handleAiAllMetaAll,
  } = useOverviewTabAllMetaAndExtraPipelines(args);

  return {
    handleResearchAll,
    handleOptimizeAll,
    handleAiFeaturedImageAll,
    handleBulkSeoExtraText,
    handleOptimizeAllSerpRow,
    handleAiAllMetaRow,
    handleAiAllMetaAll,
  };
}
