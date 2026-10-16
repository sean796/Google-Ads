import type {
  BulkProgressSlice,
  MetaPipelineStepUi,
  PipelineStepStatus,
} from "@/components/overview/overview-tab-constants";
import { CONTENT_OPTIMIZER_BULK_PAGE_SIZE } from "@/lib/content-optimizer/content-optimizer-bulk-page-size";

/** Max items per Pulse request when uploading meta/ACF only (matches WP batch/v1 limit). */
export const OVERVIEW_WP_API_META_BATCH_SIZE = 25;

/** Max items per Pulse request when any item includes full postContent HTML. */
export const OVERVIEW_WP_API_HTML_BATCH_SIZE = 8;

/** Default WordPress bulk upload batch size. */
export const OVERVIEW_WP_API_BATCH_SIZE = OVERVIEW_WP_API_META_BATCH_SIZE;

export function chunkWpUploadItems<T>(
  items: readonly T[],
  hasHtml: (item: T) => boolean,
): T[][] {
  if (!items.length) return [];
  const chunks: T[][] = [];
  let current: T[] = [];
  let chunkHasHtml = false;

  for (const item of items) {
    const itemHasHtml = hasHtml(item);
    const nextHasHtml = chunkHasHtml || itemHasHtml;
    const maxForChunk = nextHasHtml
      ? OVERVIEW_WP_API_HTML_BATCH_SIZE
      : OVERVIEW_WP_API_META_BATCH_SIZE;

    if (current.length > 0 && current.length >= maxForChunk) {
      chunks.push(current);
      current = [item];
      chunkHasHtml = itemHasHtml;
    } else {
      current.push(item);
      chunkHasHtml = nextHasHtml;
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

export function overviewWpApiBatchCount(total: number): number {
  if (total <= 0) return 0;
  return Math.ceil(total / OVERVIEW_WP_API_BATCH_SIZE);
}

export function overviewUiBatchCount(total: number, batchSize = CONTENT_OPTIMIZER_BULK_PAGE_SIZE): number {
  if (total <= 0) return 0;
  return Math.ceil(total / batchSize);
}

export function rowCountForBatch(
  batchIndex: number,
  batchSize: number,
  total: number,
): number {
  const start = batchIndex * batchSize;
  return Math.min(batchSize, total - start);
}

export function buildBatchPipelineSteps(
  batchCount: number,
  batchSize: number,
  total: number,
  labelForBatch: (batchIndex: number, batchCount: number, rowCount: number) => string,
): MetaPipelineStepUi[] {
  return Array.from({ length: batchCount }, (_, batchIndex) => ({
    id: `batch-${batchIndex}`,
    label: labelForBatch(batchIndex, batchCount, rowCountForBatch(batchIndex, batchSize, total)),
    status: "waiting" as PipelineStepStatus,
  }));
}

export function setBatchStepStatus(
  steps: MetaPipelineStepUi[],
  batchIndex: number,
  status: PipelineStepStatus,
): MetaPipelineStepUi[] {
  return steps.map((step, i) => {
    if (i < batchIndex) {
      return step.status === "done" ? step : { ...step, status: "done" as const };
    }
    if (i === batchIndex) {
      return { ...step, status };
    }
    return step;
  });
}

export function buildKeywordBatchPipelineSteps(
  batchCount: number,
  batchSize: number,
  total: number,
  statusLabel: string,
): MetaPipelineStepUi[] {
  return buildBatchPipelineSteps(batchCount, batchSize, total, (batchIndex, count, rowCount) => {
    const prefix = count > 1 ? `${statusLabel} batch ${batchIndex + 1}/${count}` : statusLabel;
    return `${prefix} (${rowCount} rows)`;
  });
}

export function buildWpUploadBatchPipelineSteps(
  totalOrChunkLengths: number | readonly number[],
): MetaPipelineStepUi[] {
  if (Array.isArray(totalOrChunkLengths)) {
    const count = totalOrChunkLengths.length;
    return totalOrChunkLengths.map((rowCount, batchIndex) => ({
      id: `batch-${batchIndex}`,
      label:
        rowCount === 1 && count === totalOrChunkLengths.reduce((a, b) => a + b, 0)
          ? `WP post ${batchIndex + 1}/${count}`
          : `WP batch ${batchIndex + 1}/${count} (${rowCount} ${rowCount === 1 ? "post" : "posts"})`,
      status: "waiting" as PipelineStepStatus,
    }));
  }
  const total = totalOrChunkLengths as number;
  const batchSize = OVERVIEW_WP_API_BATCH_SIZE;
  const batchCount = overviewWpApiBatchCount(total);
  return buildBatchPipelineSteps(batchCount, batchSize, total, (batchIndex, count, rowCount) => {
    if (batchSize === 1) {
      return `WP post ${batchIndex + 1}/${count}`;
    }
    return `WP batch ${batchIndex + 1}/${count} (${rowCount} ${rowCount === 1 ? "post" : "posts"})`;
  });
}

export function wpUploadBatchStepsAfterProgress(
  steps: MetaPipelineStepUi[],
  wpBatch: number,
  wpBatchCount: number,
  phase: "start" | "done" = "done",
): MetaPipelineStepUi[] {
  if (phase === "start") {
    return setBatchStepStatus(steps, Math.max(0, wpBatch - 1), "running");
  }
  if (wpBatch >= wpBatchCount) {
    return steps.map((s) => ({ ...s, status: "done" as const }));
  }
  return setBatchStepStatus(steps, wpBatch, "running");
}

/** 1-based batch in flight (1/4), or last finished batch when the run is done. */
export function wpUploadBatchDisplayCount(
  steps: MetaPipelineStepUi[] | undefined,
): { current: number; total: number } | null {
  if (!steps?.length) return null;
  const total = steps.length;
  const done = steps.filter((s) => s.status === "done").length;
  const runningIdx = steps.findIndex((s) => s.status === "running");
  const current =
    runningIdx >= 0 ? runningIdx + 1 : done >= total ? total : Math.min(total, done + 1);
  return { current, total };
}

export function initBulkSliceBatchHarness(
  slice: BulkProgressSlice,
  total: number,
  actionLabel: string,
  batchSize = CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
): BulkProgressSlice {
  const batchCount = overviewUiBatchCount(total, batchSize);
  const pipelineSteps = setBatchStepStatus(
    buildBatchPipelineSteps(batchCount, batchSize, total, (batchIndex, count, rowCount) => {
      const prefix = count > 1 ? `${actionLabel} batch ${batchIndex + 1}/${count}` : actionLabel;
      return `${prefix} (${rowCount} rows)`;
    }),
    0,
    "running",
  );
  return { ...slice, totalRows: batchCount, pipelineSteps };
}

export function advanceBulkSliceBatchProgress(
  slice: BulkProgressSlice,
  completed: number,
  total: number,
  batchSize = CONTENT_OPTIMIZER_BULK_PAGE_SIZE,
): BulkProgressSlice {
  const steps = slice.pipelineSteps;
  if (!steps?.length) {
    return { ...slice, completed };
  }
  const batchCount = steps.length;
  const allDone = completed >= total;
  const doneBatches = allDone ? batchCount : Math.min(batchCount - 1, Math.floor(completed / batchSize));
  const runningBatch = allDone ? -1 : Math.min(batchCount - 1, doneBatches);

  const pipelineSteps = steps.map((step, i) => {
    if (allDone || i < doneBatches) {
      return { ...step, status: "done" as const };
    }
    if (i === runningBatch) {
      return { ...step, status: "running" as const };
    }
    return { ...step, status: "waiting" as const };
  });

  return { ...slice, completed, pipelineSteps };
}

/** @deprecated Use setBatchStepStatus */
export const setKeywordBatchStepStatus = setBatchStepStatus;
