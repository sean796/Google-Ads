import {
  pickMetaBulkMicroSnapshot,
  type MetaBulkMicroSnapshot,
} from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";

const MULTI_SITE_LABEL = "Multi-site";

export function buildMultiSiteHeaderMicroSnapshot(args: {
  optimizeQueueBusy: boolean;
  optimizeBusySiteId?: string | null;
  isBatchRunning: boolean;
  batchBulkState: BulkOptimizationState | null | undefined;
  batchSiteName?: string;
}): MetaBulkMicroSnapshot | null {
  const { optimizeQueueBusy, optimizeBusySiteId, isBatchRunning, batchBulkState, batchSiteName } = args;

  if (isBatchRunning || batchBulkState?.urls?.length) {
    return pickMetaBulkMicroSnapshot({}, batchBulkState, isBatchRunning, batchSiteName, {
      runLabelOverride: MULTI_SITE_LABEL,
    });
  }

  if (optimizeQueueBusy) {
    return {
      label: MULTI_SITE_LABEL,
      completed: 0,
      total: 1,
      statusMessage: "Queue…",
    };
  }

  if (args.optimizeBusySiteId) {
    return {
      label: MULTI_SITE_LABEL,
      completed: 0,
      total: 1,
      statusMessage: "Working…",
    };
  }

  return null;
}
