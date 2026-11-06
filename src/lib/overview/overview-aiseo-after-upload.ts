import { harnessStepProgress } from "@/lib/overview/overview-harness-progress";
import {
  buildOverviewBulkSeoItem,
  resolveOverviewBindingForRow,
  type OverviewBulkSeoApiItem,
} from "@/lib/overview/overview-bulk-seo-payload";
import { bulkUpdateOverviewSeo } from "@/lib/wordpress-api/meta";
import { chunkWpUploadItems } from "@/lib/overview/overview-batch-pipeline-progress";
import { isAnswerOnlyHarnessBody } from "@/lib/overview/overview-blog-overview-prepend";
import { buildOverviewRowWpUploadProofFiles } from "@/lib/overview/overview-wp-upload-harness-artifacts";
import { attachAiseoUploadGeneratedFiles } from "@/lib/overview/overview-aiseo-upload-files";
import { uploadOverviewAiseoRowToWordPress } from "@/lib/overview/overview-aiseo-row-upload";
import {
  rowUrlMatchesWordPressSite,
  type OverviewAiseoGeneratedFile,
  type UploadOverviewAiseoWrittenRowsParams,
} from "@/lib/overview/overview-aiseo-after-upload-types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";

export {
  rowUrlHostname,
  rowUrlMatchesWordPressSite,
  type AiseoAfterRowWriteFn,
  type AiseoAfterRowWriteParams,
  type OverviewAiseoGeneratedFile,
  type OverviewAiseoRowWpUploadResult,
  type UploadAiseoRowAfterWriteDeps,
  type UploadOverviewAiseoRowParams,
  type UploadOverviewAiseoWrittenRowsParams,
} from "@/lib/overview/overview-aiseo-after-upload-types";
export { attachAiseoUploadGeneratedFiles } from "@/lib/overview/overview-aiseo-upload-files";
export {
  uploadAiseoRowAfterWrite,
  uploadOverviewAiseoRowToWordPress,
} from "@/lib/overview/overview-aiseo-row-upload";


/** Push AISEO-written rows to WordPress after batch; attach wordpress.json proof per row. */
export async function uploadOverviewAiseoWrittenRows(
  params: UploadOverviewAiseoWrittenRowsParams,
): Promise<{ uploaded: number; failed: number; skipped: number }> {
  const { site, rows, indices } = params;
  let uploaded = 0;
  let failed = 0;
  let skipped = 0;
  if (!site.username?.trim() || !site.appPassword?.trim()) return { uploaded, failed, skipped };

  const urls = indices.map((index) => rows[index]?.url).filter(Boolean) as string[];
  const extra = await params.resolveBindings(urls, site, undefined, { inventoryOnly: true });
  const bindings = { ...params.bindings, ...extra };

  if (indices.length <= 1) {
    for (const index of indices) {
      const row = rows[index];
      if (!row) continue;
      const url = row.url?.trim() ?? "";
      try {
        const result = await uploadOverviewAiseoRowToWordPress({
          site,
          row,
          bindings,
          getInventoryMatchForUrl: (s, u) => params.getInventoryMatchForUrl(s, u),
        });
        if (params.batchKey && params.setBulkOptimizationState && url && result.generatedFiles.length) {
          attachAiseoUploadGeneratedFiles(
            params.batchKey,
            params.setBulkOptimizationState,
            url,
            result.generatedFiles,
            result.ok,
          );
        }
        if (result.skipped) skipped += 1;
        else if (result.ok) uploaded += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
  } else {
    type PreparedAiseoUpload = {
      row: OverviewRow;
      url: string;
      binding: OverviewBinding;
      inventoryContent: string;
      item: OverviewBulkSeoApiItem;
    };
    const prepared: PreparedAiseoUpload[] = [];
    const uploadedAt = new Date().toISOString();

    for (const index of indices) {
      const row = rows[index];
      if (!row) continue;
      const url = row.url?.trim() ?? "";
      const invMatch = url ? params.getInventoryMatchForUrl(site, url) : undefined;
      const inventoryContent = invMatch?.row?.fields?.content?.trim() ?? "";
      const invHit =
        invMatch?.row?.id != null && Number.isFinite(invMatch.row.id)
          ? {
              row: { id: invMatch.row.id, date_gmt: invMatch.row.date_gmt ?? null },
              subtype: invMatch.subtype,
            }
          : undefined;
      const binding = resolveOverviewBindingForRow(row, bindings, invHit);

      const skipWithProof = (error: string) => {
        skipped += 1;
        const files = buildOverviewRowWpUploadProofFiles({
          site,
          row,
          binding,
          inventoryContent,
          ok: false,
          skipped: true,
          error,
          uploadedAt,
        });
        if (params.batchKey && params.setBulkOptimizationState && url && files.length) {
          attachAiseoUploadGeneratedFiles(
            params.batchKey,
            params.setBulkOptimizationState,
            url,
            files,
            false,
          );
        }
      };

      if (!url || !rowUrlMatchesWordPressSite(url, site)) {
        const siteLabel = site.name?.trim() || site.siteUrl || site.id;
        skipWithProof(
          url
            ? `Row URL is not on connected site ${siteLabel}. Upload blocked.`
            : "Row URL missing. Upload blocked.",
        );
        continue;
      }
      if (!binding?.postId) {
        skipWithProof("No WordPress post binding for this row.");
        continue;
      }
      const bodyForUpload =
        row.postContentOptimized?.trim() || row.postContent?.trim() || inventoryContent.trim();
      if (bodyForUpload && isAnswerOnlyHarnessBody(bodyForUpload)) {
        skipWithProof(
          "Post body missing in cache; skipped upload so the live post is not replaced with Answer only.",
        );
        continue;
      }
      const item = buildOverviewBulkSeoItem(row, binding, {
        forWordPressUpload: true,
        inventoryContent,
      });
      if (!item) {
        skipWithProof("Nothing to upload for this row.");
        continue;
      }
      prepared.push({ row, url, binding, inventoryContent, item });
    }

    const chunks = chunkWpUploadItems(prepared, (entry) =>
      Boolean(entry.item.postContent?.trim()),
    );

    for (const chunk of chunks) {
      try {
        const bulkRes = await bulkUpdateOverviewSeo(
          site.siteUrl,
          site.username!,
          site.appPassword!,
          chunk.map((c) => c.item),
        );
        const byIndex = new Map<number, (typeof bulkRes.results)[number]>();
        const byPostId = new Map<number, (typeof bulkRes.results)[number]>();
        for (const r of bulkRes.results ?? []) {
          if (typeof r.index === "number") byIndex.set(r.index, r);
          if (r.postId != null && Number.isFinite(r.postId)) byPostId.set(r.postId, r);
        }

        for (let i = 0; i < chunk.length; i += 1) {
          const entry = chunk[i]!;
          const apiRow = byIndex.get(i) ?? byPostId.get(entry.binding.postId);
          const ok = Boolean(apiRow?.ok);
          const error = ok ? undefined : apiRow?.error || "WordPress rejected the update.";
          const files = buildOverviewRowWpUploadProofFiles({
            site,
            row: entry.row,
            binding: entry.binding,
            inventoryContent: entry.inventoryContent,
            ok,
            skipped: false,
            error,
            link: apiRow?.link,
            uploadedAt,
            apiResult: apiRow
              ? {
                  ok,
                  error,
                  mergeError: apiRow.mergeError,
                  method: apiRow.method,
                  httpStatus: apiRow.httpStatus ?? undefined,
                  link: apiRow.link,
                }
              : undefined,
          });
          if (params.batchKey && params.setBulkOptimizationState && entry.url && files.length) {
            attachAiseoUploadGeneratedFiles(
              params.batchKey,
              params.setBulkOptimizationState,
              entry.url,
              files,
              ok,
            );
          }
          if (ok) uploaded += 1;
          else failed += 1;
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : "WordPress bulk update failed.";
        for (const entry of chunk) {
          failed += 1;
          const files = buildOverviewRowWpUploadProofFiles({
            site,
            row: entry.row,
            binding: entry.binding,
            inventoryContent: entry.inventoryContent,
            ok: false,
            skipped: false,
            error,
            uploadedAt,
          });
          if (params.batchKey && params.setBulkOptimizationState && entry.url && files.length) {
            attachAiseoUploadGeneratedFiles(
              params.batchKey,
              params.setBulkOptimizationState,
              entry.url,
              files,
              false,
            );
          }
        }
      }
    }
  }

  if (params.batchKey && params.setBulkOptimizationState && (uploaded > 0 || failed > 0 || skipped > 0)) {
    params.setBulkOptimizationState((prev) => {
      const current = prev[params.batchKey!];
      if (!current) return prev;
      return {
        ...prev,
        [params.batchKey!]: {
          ...current,
          currentStep: "Upload to WordPress",
          currentStepProgress: harnessStepProgress(current.currentStepProgress, {
            step: "Upload to WordPress",
            progress: 100,
            message: `WordPress upload: ${uploaded} ok, ${failed} failed, ${skipped} skipped`,
          }),
        },
      };
    });
  }

  return { uploaded, failed, skipped };
}
