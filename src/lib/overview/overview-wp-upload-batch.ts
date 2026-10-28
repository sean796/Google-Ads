import { flushSync } from "react-dom";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";
import {
  buildOverviewUploadPayloadBundle,
  overviewBindingForRow,
  type BuildOverviewBulkSeoItemOptions,
  type OverviewUploadPayloadBundle,
  type SemrushUploadScope,
} from "@/lib/overview/overview-bulk-seo-payload";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import {
  bulkUpdateOverviewSeo,
  type BulkOverviewSeoResultRow,
  type BulkOverviewSeoResponse,
} from "@/lib/wordpress-api/meta";
import {
  applyWpUploadBatchProgress,
  finalizeWpUploadHarnessSections,
  setWpUploadBatchPrepMessage,
  type WpUploadHarnessSetters,
} from "@/lib/overview/overview-wp-upload-harness-run";
import type { OverviewWordPressUploadFailureRow } from "@/lib/overview/overview-wordpress-export-csv";
import { overviewRowInBulkScope } from "@/lib/overview/overview-bulk-row-scope";
import { semrushIssueLabelFromFilename } from "@/lib/overview/parse-semrush-error-csv";
import {
  buildWpUploadBatchPipelineSteps,
  chunkWpUploadItems,
  setBatchStepStatus,
} from "@/lib/overview/overview-batch-pipeline-progress";
import { initOverviewBulkHarnessPagination } from "@/lib/overview/overview-bulk-page-state";
import {
  buildOverviewRowPatchFromInventory,
  type OverviewInventoryUrlMatch,
} from "@/lib/overview/overview-row-scrape";
import { isAnswerOnlyHarnessBody } from "@/lib/overview/overview-blog-overview-prepend";
import {
  attachAiseoUploadGeneratedFiles,
  rowUrlMatchesWordPressSite,
} from "@/lib/overview/overview-aiseo-after-upload";
import { buildOverviewRowWpUploadProofFiles } from "@/lib/overview/overview-wp-upload-harness-artifacts";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

export type WpUploadEligibleRow = {
  index: number;
  row: OverviewRow;
  binding: OverviewBinding;
  inventoryContent: string;
  bundle: OverviewUploadPayloadBundle;
};

export type WpUploadRowResult = {
  index: number;
  url: string;
  ok: boolean;
  error?: string;
  mergeError?: string;
  postId: number | null;
  link?: string;
};

export type RunOverviewWpUploadBatchParams = {
  site: WordPressSite;
  eligible: WpUploadEligibleRow[];
  harnessSetters: WpUploadHarnessSetters;
  batchKey: string;
  onRowStart?: (index: number, row: OverviewRow) => void;
  onRowComplete?: (result: WpUploadRowResult) => void;
};

export type BuildWpUploadEligibleRowsOptions = {
  resolveBinding?: (row: OverviewRow) => OverviewBinding | undefined;
  selectedUrlKeys?: ReadonlySet<string>;
  getInventoryMatchForUrl?: (url: string) => OverviewInventoryUrlMatch | undefined;
  site?: WordPressSite;
};

export function isOverviewRowDirtyForWpUpload(
  row: OverviewRow,
  invMatch?: OverviewInventoryUrlMatch,
): boolean {
  if (
    row.aiTitle?.trim() ||
    row.aiMeta?.trim() ||
    row.postContentOptimized?.trim() ||
    row.elementorDataJson?.trim() ||
    row.aiSuggestedPath?.trim()
  ) {
    return true;
  }

  if (invMatch?.row) {
    const baseline = buildOverviewRowPatchFromInventory(row, invMatch);
    if (!baseline) return false;
    const curTitle = (row.title ?? "").trim();
    const curMeta = (row.metaDescription ?? "").trim();
    const curFocus = (row.focusKeyword ?? "").trim();
    const curFaq = (row.faq ?? "").trim();
    const curSeo = (row.seoResearch ?? "").trim();

    if (curTitle && curTitle !== (baseline.title ?? "").trim()) return true;
    if (curMeta && curMeta !== (baseline.metaDescription ?? "").trim()) return true;
    if (curFocus && curFocus !== (baseline.focusKeyword ?? "").trim()) return true;
    if (curFaq && curFaq !== (baseline.faq ?? "").trim()) return true;
    if (curSeo && curSeo !== (baseline.seoResearch ?? "").trim()) return true;
    return false;
  }

  return rowHasUploadableGridFields(row);
}

export function buildWpUploadEligibleRows(
  rows: OverviewRow[],
  bindings: Record<string, OverviewBinding | undefined>,
  bulkScopeUrlKeys: Set<string>,
  semrushCsvFileName: string | null = null,
  options?: BuildWpUploadEligibleRowsOptions,
): WpUploadEligibleRow[] {
  const baseOptions: BuildOverviewBulkSeoItemOptions = semrushCsvFileName
    ? { semrushScope: semrushIssueLabelFromFilename(semrushCsvFileName) as SemrushUploadScope }
    : { forWordPressUpload: true };
  const hasExplicitSelection = Boolean(options?.selectedUrlKeys && options.selectedUrlKeys.size > 0);
  const eligible: WpUploadEligibleRow[] = [];

  rows.forEach((row, index) => {
    const url = row.url?.trim() ?? "";
    if (!url || !overviewRowInBulkScope(url, bulkScopeUrlKeys)) {
      return;
    }
    if (options?.site && !rowUrlMatchesWordPressSite(url, options.site)) {
      return;
    }
    const invMatch = options?.getInventoryMatchForUrl?.(url);
    if (!hasExplicitSelection && !semrushCsvFileName) {
      const explicitlySelected = options?.selectedUrlKeys?.has(normalizePageUrlKey(url)) ?? false;
      if (!explicitlySelected && !isOverviewRowDirtyForWpUpload(row, invMatch)) {
        return;
      }
    }
    const binding =
      options?.resolveBinding?.(row) ?? overviewBindingForRow(row, bindings);
    if (!binding?.postId) return;

    const inventoryContent = invMatch?.row?.fields?.content?.trim() ?? "";
    const candidateBody =
      row.postContentOptimized?.trim() || row.postContent?.trim() || inventoryContent;
    if (candidateBody && isAnswerOnlyHarnessBody(candidateBody)) {
      return;
    }

    const bundle = buildOverviewUploadPayloadBundle(row, binding, {
      ...baseOptions,
      inventoryContent: row.postContentOptimized?.trim() || row.postContent?.trim()
        ? inventoryContent
        : undefined,
    });
    if (!bundle) return;
    eligible.push({ index, row, binding, inventoryContent, bundle });
  });
  return eligible;
}

export function rowHasUploadableGridFields(row: OverviewRow): boolean {
  const title = (row.aiTitle || row.title || "").trim();
  const meta = (row.aiMeta || row.metaDescription || "").trim();
  const focus = (row.focusKeyword ?? "").trim();
  const faq = (row.faq ?? "").trim();
  const date = (row.dateModifier ?? "").trim();
  const seo = (row.seoResearch ?? "").trim();
  return Boolean(title || meta || focus || faq || date || seo);
}

export function urlsMissingPostIdWithGridData(
  rows: OverviewRow[],
  bindings: Record<string, OverviewBinding | undefined>,
): string[] {
  const urls: string[] = [];
  for (const row of rows) {
    const url = row.url?.trim();
    if (!url) continue;
    if (overviewBindingForRow(row, bindings)?.postId) continue;
    if (!rowHasUploadableGridFields(row)) continue;
    urls.push(url);
  }
  return urls;
}

function mapBulkResults(
  bulkRes: BulkOverviewSeoResponse,
): {
  resultByIndex: Map<number, BulkOverviewSeoResultRow>;
  resultByPostId: Map<number, BulkOverviewSeoResultRow>;
} {
  const resultByIndex = new Map<number, BulkOverviewSeoResultRow>();
  const resultByPostId = new Map<number, BulkOverviewSeoResultRow>();
  for (const row of bulkRes.results ?? []) {
    if (typeof row.index === "number") {
      resultByIndex.set(row.index, row);
    }
    if (row.postId != null && Number.isFinite(row.postId)) {
      resultByPostId.set(row.postId, row);
    }
  }
  return { resultByIndex, resultByPostId };
}

function rowResultFromBulk(
  entry: WpUploadEligibleRow,
  localIdx: number,
  uploadResult: BulkOverviewSeoResultRow | undefined,
  fallbackError?: string,
): WpUploadRowResult {
  const url = entry.row.url?.trim() ?? "";
  const postId = entry.bundle.item.postId;
  const res: BulkOverviewSeoResultRow = uploadResult ?? {
    postId,
    ok: false,
    error: fallbackError ?? "No result returned for this row.",
  };
  if (res.ok) {
    return { index: entry.index, url, ok: true, postId, link: res.link };
  }
  const error = res.error?.trim() || fallbackError || "WordPress rejected the update.";
  return {
    index: entry.index,
    url,
    ok: false,
    postId,
    error,
    mergeError: res.mergeError,
    link: res.link,
  };
}

async function uploadPreparedChunk(
  site: WordPressSite,
  chunkPrepared: Array<{ entry: WpUploadEligibleRow; url: string }>,
  harnessSetters: WpUploadHarnessSetters,
  onRowStart: RunOverviewWpUploadBatchParams["onRowStart"],
  onRowComplete: RunOverviewWpUploadBatchParams["onRowComplete"],
  wpBatch: number,
  wpBatchCount: number,
): Promise<{ results: WpUploadRowResult[]; failures: OverviewWordPressUploadFailureRow[] }> {
  const localIndexToUrl: Record<number, string> = {};
  for (let localIdx = 0; localIdx < chunkPrepared.length; localIdx += 1) {
    localIndexToUrl[localIdx] = chunkPrepared[localIdx]!.url;
  }

  flushSync(() => {
    for (const { entry } of chunkPrepared) {
      onRowStart?.(entry.index, entry.row);
    }
  });

  const items = chunkPrepared.map(({ entry }) => entry.bundle.item);
  const first = chunkPrepared[0];
  console.info("[WP upload] POST", `${wpBatch}/${wpBatchCount}`, {
    count: items.length,
    postId: first?.entry.bundle.item.postId ?? null,
    url: first?.url ?? "",
  });
  applyWpUploadBatchProgress(harnessSetters, {
    done: wpBatch - 1,
    total: wpBatchCount,
    wpBatch,
    wpBatchCount,
    batchResults: [],
    localIndexToUrl,
    phase: "start",
  });
  const bulkRes = await bulkUpdateOverviewSeo(
    site.siteUrl,
    site.username!,
    site.appPassword!,
    items,
  );

  const mergedResults = bulkRes.results ?? [];

  const { resultByIndex, resultByPostId } = mapBulkResults(bulkRes);
  const results: WpUploadRowResult[] = [];
  const failures: OverviewWordPressUploadFailureRow[] = [];
  const uploadedAt = new Date().toISOString();

  for (let localIdx = 0; localIdx < chunkPrepared.length; localIdx += 1) {
    const { entry, url } = chunkPrepared[localIdx]!;
    const uploadResult =
      resultByIndex.get(localIdx) ?? resultByPostId.get(entry.bundle.item.postId);
    const rowResult = rowResultFromBulk(entry, localIdx, uploadResult);
    results.push(rowResult);

    const proofFiles = buildOverviewRowWpUploadProofFiles({
      site,
      row: entry.row,
      binding: entry.binding,
      inventoryContent: entry.inventoryContent,
      ok: rowResult.ok,
      skipped: false,
      error: rowResult.ok ? undefined : rowResult.error,
      link: rowResult.link,
      uploadedAt,
      apiResult: {
        ok: rowResult.ok,
        error: rowResult.error,
        mergeError: rowResult.mergeError,
        method: uploadResult?.method,
        httpStatus: uploadResult?.httpStatus ?? undefined,
        link: rowResult.link,
      },
    });
    if (url && proofFiles.length) {
      attachAiseoUploadGeneratedFiles(
        harnessSetters.batchKey,
        harnessSetters.setBulkOptimizationState,
        url,
        proofFiles,
        rowResult.ok,
      );
    }

    if (!rowResult.ok) {
      failures.push({
        postId: rowResult.postId,
        url: entry.row.url,
        error: rowResult.error ?? "WordPress rejected the update.",
        mergeError: rowResult.mergeError,
      });
    }
  }

  applyWpUploadBatchProgress(harnessSetters, {
    done: wpBatch,
    total: wpBatchCount,
    wpBatch,
    wpBatchCount,
    batchResults: mergedResults,
    localIndexToUrl,
    phase: "done",
  });

  flushSync(() => {
    for (let localIdx = 0; localIdx < results.length; localIdx += 1) {
      onRowComplete?.(results[localIdx]!);
    }
  });

  return { results, failures };
}

export async function runOverviewWpUploadBatch(
  params: RunOverviewWpUploadBatchParams,
): Promise<{
  results: WpUploadRowResult[];
  stats: { okCount: number; failCount: number; failures: OverviewWordPressUploadFailureRow[] };
}> {
  const { site, eligible, harnessSetters, batchKey, onRowStart, onRowComplete } = params;
  const failures: OverviewWordPressUploadFailureRow[] = [];

  if (!eligible.length) {
    return { results: [], stats: { okCount: 0, failCount: 0, failures } };
  }

  const prepared = eligible.map((entry) => ({
    entry,
    url: entry.row.url?.trim() ?? "",
  }));
  const chunks = chunkWpUploadItems(prepared, ({ entry }) =>
    Boolean(entry.bundle.item.postContent?.trim()),
  );
  const total = prepared.length;
  const wpBatchCount = chunks.length;
  const chunkLengths = chunks.map((c) => c.length);
  const steps = setBatchStepStatus(buildWpUploadBatchPipelineSteps(chunkLengths), 0, "running");

  harnessSetters.setBulkOptimizationState((prev) => {
    const current = prev[batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [batchKey]: {
        ...current,
        batchPipelineSteps: steps,
      },
    };
  });

  initOverviewBulkHarnessPagination(batchKey, total, harnessSetters.setBulkOptimizationState);
  setWpUploadBatchPrepMessage(
    batchKey,
    harnessSetters.siteId,
    `Uploading ${total} row(s) to WordPress in ${wpBatchCount} batch(es)…`,
    harnessSetters,
  );

  const results: WpUploadRowResult[] = [];
  for (let batchIdx = 0; batchIdx < chunks.length; batchIdx += 1) {
    const chunk = chunks[batchIdx]!;
    const wpBatch = batchIdx + 1;
    const outcome = await uploadPreparedChunk(
      site,
      chunk,
      harnessSetters,
      onRowStart,
      onRowComplete,
      wpBatch,
      wpBatchCount,
    );
    const row = outcome.results[0];
    console.info("[WP upload]", `${wpBatch}/${wpBatchCount}`, {
      count: chunk.length,
      postId: row?.postId ?? null,
      url: row?.url ?? chunk[0]?.url ?? "",
    });
    results.push(...outcome.results);
    failures.push(...outcome.failures);
  }

  finalizeWpUploadHarnessSections(harnessSetters, failures);

  const sorted = results.slice().sort((a, b) => a.index - b.index);
  const okCount = sorted.filter((r) => r.ok).length;
  const failCount = sorted.filter((r) => !r.ok).length;

  return { results: sorted, stats: { okCount, failCount, failures } };
}
