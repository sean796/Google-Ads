import {
  buildOverviewBulkSeoItem,
  resolveOverviewBindingForRow,
  uploadOverviewSeoApiItemAvoidingBatchV1,
} from "@/lib/overview/overview-bulk-seo-payload";
import { isAnswerOnlyHarnessBody } from "@/lib/overview/overview-blog-overview-prepend";
import { buildOverviewRowWpUploadProofFiles } from "@/lib/overview/overview-wp-upload-harness-artifacts";
import { mergeGeneratedFilesByName } from "@/lib/overview/overview-peer-csv-details";
import { applyAiseoHtmlToRowsRef } from "@/lib/overview/overview-aiseo-cache-write";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { attachAiseoUploadGeneratedFiles } from "@/lib/overview/overview-aiseo-upload-files";
import {
  rowUrlMatchesWordPressSite,
  type AiseoAfterRowWriteParams,
  type OverviewAiseoRowWpUploadResult,
  type UploadAiseoRowAfterWriteDeps,
  type UploadOverviewAiseoRowParams,
} from "@/lib/overview/overview-aiseo-after-upload-types";

/** Apply HTML to the row and upload to WordPress immediately (per-row, before next row). */
export async function uploadAiseoRowAfterWrite(
  deps: UploadAiseoRowAfterWriteDeps,
  params: AiseoAfterRowWriteParams,
): Promise<OverviewAiseoRowWpUploadResult> {
  const url = params.url.trim();
  if (!url) {
    return { ok: false, skipped: true, generatedFiles: [] };
  }
  applyAiseoHtmlToRowsRef(deps.rowsRef, url, params.html);
  const urlKey = normalizePageUrlKey(url);
  const row =
    deps.rowsRef.current.find(
      (candidate) => normalizePageUrlKey(candidate.url) === urlKey,
    ) ??
    (params.index >= 0 ? deps.rowsRef.current[params.index] : undefined);
  if (!row) {
    return { ok: false, skipped: true, generatedFiles: [] };
  }

  const extra = await deps.resolveBindings([url], deps.site, undefined, { inventoryOnly: true });
  const bindings = { ...deps.bindings, ...extra };
  const result = await uploadOverviewAiseoRowToWordPress({
    site: deps.site,
    row,
    bindings,
    getInventoryMatchForUrl: (s, u) => deps.getInventoryMatchForUrl(s, u),
  });
  const files = mergeGeneratedFilesByName(params.rowFiles ?? [], result.generatedFiles);
  attachAiseoUploadGeneratedFiles(
    deps.batchKey,
    deps.setBulkOptimizationState,
    url,
    files,
    result.ok,
  );
  return result;
}

/** Upload one AISEO row to WordPress and produce wordpress.json + upload-payload JSON proof. */
export async function uploadOverviewAiseoRowToWordPress(
  params: UploadOverviewAiseoRowParams,
): Promise<OverviewAiseoRowWpUploadResult> {
  const uploadedAt = new Date().toISOString();
  const url = params.row.url?.trim() ?? "";
  const invMatch = url ? params.getInventoryMatchForUrl(params.site, url) : undefined;
  const inventoryContent = invMatch?.row?.fields?.content?.trim() ?? "";
  const invHit =
    invMatch?.row?.id != null && Number.isFinite(invMatch.row.id)
      ? {
          row: { id: invMatch.row.id, date_gmt: invMatch.row.date_gmt ?? null },
          subtype: invMatch.subtype,
        }
      : undefined;
  const binding = resolveOverviewBindingForRow(params.row, params.bindings, invHit);

  if (!url || !rowUrlMatchesWordPressSite(url, params.site)) {
    const siteLabel = params.site.name?.trim() || params.site.siteUrl || params.site.id;
    const error = url
      ? `Row URL is not on connected site ${siteLabel}. Upload blocked.`
      : "Row URL missing. Upload blocked.";
    return {
      ok: false,
      skipped: true,
      error,
      generatedFiles: buildOverviewRowWpUploadProofFiles({
        site: params.site,
        row: params.row,
        binding,
        inventoryContent,
        ok: false,
        skipped: true,
        error,
        uploadedAt,
      }),
    };
  }

  if (!binding?.postId) {
    const error = "No WordPress post binding for this row.";
    return {
      ok: false,
      skipped: true,
      error,
      generatedFiles: buildOverviewRowWpUploadProofFiles({
        site: params.site,
        row: params.row,
        binding,
        inventoryContent,
        ok: false,
        skipped: true,
        error,
        uploadedAt,
      }),
    };
  }

  const bodyForUpload =
    params.row.postContentOptimized?.trim() ||
    params.row.postContent?.trim() ||
    inventoryContent.trim();
  if (bodyForUpload && isAnswerOnlyHarnessBody(bodyForUpload)) {
    const error =
      "Post body missing in cache; skipped upload so the live post is not replaced with Answer only.";
    return {
      ok: false,
      skipped: true,
      error,
      postId: binding.postId,
      generatedFiles: buildOverviewRowWpUploadProofFiles({
        site: params.site,
        row: params.row,
        binding,
        inventoryContent,
        ok: false,
        skipped: true,
        error,
        uploadedAt,
      }),
    };
  }

  try {
    const item = buildOverviewBulkSeoItem(params.row, binding, {
      forWordPressUpload: true,
      inventoryContent,
    });
    if (!item) {
      const error = "Nothing to upload for this row.";
      return {
        ok: false,
        skipped: true,
        error,
        postId: binding.postId,
        generatedFiles: buildOverviewRowWpUploadProofFiles({
          site: params.site,
          row: params.row,
          binding,
          inventoryContent,
          ok: false,
          skipped: true,
          error,
          uploadedAt,
        }),
      };
    }

    const rowRes = await uploadOverviewSeoApiItemAvoidingBatchV1(params.site, item);
    const generatedFiles = buildOverviewRowWpUploadProofFiles({
      site: params.site,
      row: params.row,
      binding,
      inventoryContent,
      ok: Boolean(rowRes.ok),
      skipped: false,
      error: rowRes.ok ? undefined : rowRes.error || "WordPress rejected the update.",
      link: rowRes.link,
      uploadedAt,
      apiResult: rowRes,
    });

    if (!rowRes.ok) {
      return {
        ok: false,
        skipped: false,
        error: rowRes.error || "WordPress rejected the update.",
        postId: binding.postId,
        generatedFiles,
      };
    }
    return {
      ok: true,
      skipped: false,
      postId: binding.postId,
      link: rowRes.link,
      generatedFiles,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "WordPress update failed.";
    return {
      ok: false,
      skipped: false,
      error,
      postId: binding.postId,
      generatedFiles: buildOverviewRowWpUploadProofFiles({
        site: params.site,
        row: params.row,
        binding,
        inventoryContent,
        ok: false,
        skipped: false,
        error,
        uploadedAt,
      }),
    };
  }
}
