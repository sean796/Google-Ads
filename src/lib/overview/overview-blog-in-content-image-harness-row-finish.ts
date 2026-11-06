import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import {
  emitInContentImageHarnessPayload,
  setInContentImageHarnessMessage,
  writeInContentImageRowFiles,
  type BlogInContentImageCatalogRow,
  type InContentImageHarnessResult,
} from "@/lib/overview/overview-blog-in-content-image-harness-batch";
import { extractH2TextsFromHtml } from "@/lib/overview/overview-blog-headers-extract";
import type { OverviewHarnessSetters } from "@/lib/overview/overview-blog-overview-harness-mutations";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import {
  aiseoRowFilesForUpload,
  buildAiseoElementTextFile,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import type { AiseoCacheWriteAccumulator } from "@/lib/overview/overview-aiseo-cache-write";
import {
  IN_CONTENT_STEP_CHECKLIST,
  IN_CONTENT_STEP_GENERATE,
  IN_CONTENT_STEP_INSERT,
  formatInContentImageResultMarkdown,
  formatLocalImageChecklistMarkdown,
  formatPeerLocalImageLibraryChecklistMarkdown,
  makeInContentImageHarnessDonePayload,
  makeInContentImageHarnessStartPayload,
  rebuildLocalImageBatchSummaryFile,
} from "@/lib/overview/overview-blog-in-content-image-harness-sections";
import { mergeGeneratedFilesByName } from "@/lib/overview/overview-peer-csv-details";

export async function finishInContentImageHarnessRowSuccess(params: {
  url: string;
  row: BlogInContentImageCatalogRow;
  result: InContentImageHarnessResult;
  imageKind: "photo" | "local";
  localPhaseLog: string;
  harnessSetters: OverviewHarnessSetters;
  cacheWrite: AiseoCacheWriteAccumulator;
  updateRow: (index: number, patch: Partial<OverviewRow>) => void;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
}): Promise<void> {
  const {
    url,
    row,
    result,
    imageKind,
    localPhaseLog,
    harnessSetters,
    cacheWrite,
    updateRow,
    uploadAfterRowWrite,
  } = params;
  emitInContentImageHarnessPayload(
    url,
    harnessSetters,
    makeInContentImageHarnessDonePayload(
      row.index,
      IN_CONTENT_STEP_CHECKLIST,
      imageKind === "local"
        ? [
            formatPeerLocalImageLibraryChecklistMarkdown({
              entity: result.entity || "",
              peerFileNames: (result.peerCsvFiles ?? []).map((f) => f.name),
              reusedFrom: result.reusedFromCrossSite
                ? result.sharedFromSiteName
                : undefined,
            }),
            result.referenceImageUrl
              ? result.reusedFromCrossSite
                ? `\n\nReused from ${result.sharedFromSiteName || "peer site"} SAP page.\n\n${formatLocalImageChecklistMarkdown({
                    entity: result.entity || "",
                    referenceImageUrl: result.referenceImageUrl,
                    referenceSourceUrl:
                      result.sharedFromPageUrl || result.referenceSourceUrl,
                  })}`
                : `\n\n${formatLocalImageChecklistMarkdown({
                    entity: result.entity || "",
                    referenceImageUrl: result.referenceImageUrl,
                    referenceSourceUrl: result.referenceSourceUrl,
                  })}`
              : "",
          ].join("")
        : "Checklist built and image generated.",
    ),
  );
  emitInContentImageHarnessPayload(
    url,
    harnessSetters,
    makeInContentImageHarnessDonePayload(
      row.index,
      IN_CONTENT_STEP_GENERATE,
      [
        imageKind === "local" && localPhaseLog.trim()
          ? `${localPhaseLog.trim()}\n\n`
          : "",
        formatInContentImageResultMarkdown({
          sectionHeader: result.sectionHeader,
          imageUrl: result.imageUrl,
          alt: result.alt,
          referenceImageUrl: result.referenceImageUrl,
          referenceSourceUrl:
            result.sharedFromPageUrl || result.referenceSourceUrl,
          action: result.reusedFromCrossSite
            ? "Reused peer image"
            : "Generated from reference",
          entity: result.entity,
          sourceSiteName: result.sharedFromSiteName,
          sourcePageUrl: result.sharedFromPageUrl,
        }),
      ].join(""),
    ),
  );

  emitInContentImageHarnessPayload(
    url,
    harnessSetters,
    makeInContentImageHarnessStartPayload(row.index, IN_CONTENT_STEP_INSERT),
  );
  emitInContentImageHarnessPayload(
    url,
    harnessSetters,
    makeInContentImageHarnessDonePayload(
      row.index,
      IN_CONTENT_STEP_INSERT,
      `Inserted under H2: ${result.sectionHeader}`,
    ),
  );

  const blogH2List = extractH2TextsFromHtml(result.html);
  cacheWrite.push(url, result.html);
  const reportMd = formatInContentImageResultMarkdown({
    sectionHeader: result.sectionHeader,
    imageUrl: result.imageUrl,
    alt: result.alt,
    referenceImageUrl: result.referenceImageUrl,
    referenceSourceUrl: result.sharedFromPageUrl || result.referenceSourceUrl,
    action: result.reusedFromCrossSite ? "Reused peer image" : "Generated from reference",
    entity: result.entity,
    sourceSiteName: result.sharedFromSiteName,
    sourcePageUrl: result.sharedFromPageUrl,
  });
  writeInContentImageRowFiles(url, harnessSetters, reportMd, result.html);
  const rowFiles = aiseoRowFilesForUpload({
    runKind: "aiInContentImage",
    url,
    elementFiles: (() => {
      const elementFile = buildAiseoElementTextFile("in-content-image.md", reportMd);
      return elementFile ? [elementFile] : [];
    })(),
    postHtml: result.html,
  });
  if (uploadAfterRowWrite) {
    await uploadAfterRowWrite({
      index: row.index,
      url,
      html: result.html,
      rowFiles: rowFiles.length ? rowFiles : undefined,
    });
  }
  updateRow(row.index, {
    status: "idle",
    blogH2List,
    blogInContentImageUrl: result.imageUrl,
    blogInContentImageAlt: result.alt,
    blogInContentImageSection: result.sectionHeader,
    blogInContentImageMediaId: result.mediaId ?? null,
    blogInContentImageRanAtIso: new Date().toISOString(),
    blogInContentImageReferenceUrl: result.referenceImageUrl?.trim() || undefined,
    blogInContentImageReferenceSourceUrl:
      result.referenceSourceUrl?.trim() || undefined,
    blogInContentImageSharedFromSiteName:
      result.sharedFromSiteName?.trim() || undefined,
    blogInContentImageSharedFromPageUrl:
      result.sharedFromPageUrl?.trim() || undefined,
  });
  // #region agent log
  // #endregion
  harnessSetters.setBulkOptimizationState((prev) => {
    const current = prev[harnessSetters.batchKey];
    if (!current) return prev;
    const urlLocalImageOutcomes = {
      ...(current.urlLocalImageOutcomes || {}),
      [url]: result.reusedFromCrossSite
        ? ("found" as const)
        : ("generated" as const),
    };
    const summaryFile = rebuildLocalImageBatchSummaryFile({
      urls: current.urls || [],
      urlKeywords: current.urlKeywords,
      urlOutcomes: urlLocalImageOutcomes,
      urlSkipReasons: current.urlSkipReasons,
      urlGeneratedFiles: current.urlGeneratedFiles,
    });
    return {
      ...prev,
      [harnessSetters.batchKey]: {
        ...current,
        urlStatuses: { ...(current.urlStatuses || {}), [url]: "completed" },
        urlLocalImageOutcomes,
        batchPeerLibraryFiles: mergeGeneratedFilesByName(
          result.peerCsvFiles?.length
            ? mergeGeneratedFilesByName(
                current.batchPeerLibraryFiles || [],
                result.peerCsvFiles,
              )
            : current.batchPeerLibraryFiles || [],
          [summaryFile],
        ),
      },
    };
  });
}

export function handleInContentImageHarnessRowError(params: {
  url: string;
  row: BlogInContentImageCatalogRow;
  err: unknown;
  harnessSetters: OverviewHarnessSetters;
  updateRow: (index: number, patch: Partial<OverviewRow>) => void;
}): void {
  const { url, row, err, harnessSetters, updateRow } = params;
  const message = err instanceof Error ? err.message : String(err);
  const peerCsvFiles =
    err && typeof err === "object" && "peerCsvFiles" in err
      ? (
          err as {
            peerCsvFiles?: Array<{ name: string; content: string; mimeType: string }>;
          }
        ).peerCsvFiles
      : undefined;
  // #region agent log
  // #endregion
  updateRow(row.index, { status: "error" });
  harnessSetters.setBulkOptimizationState((prev) => {
    const current = prev[harnessSetters.batchKey];
    if (!current) return prev;
    const urlLocalImageOutcomes = {
      ...(current.urlLocalImageOutcomes || {}),
      [url]: "error" as const,
    };
    const urlSkipReasons = {
      ...(current.urlSkipReasons || {}),
      [url]: message,
    };
    const summaryFile = rebuildLocalImageBatchSummaryFile({
      urls: current.urls || [],
      urlKeywords: current.urlKeywords,
      urlOutcomes: urlLocalImageOutcomes,
      urlSkipReasons,
      urlGeneratedFiles: current.urlGeneratedFiles,
    });
    return {
      ...prev,
      [harnessSetters.batchKey]: {
        ...current,
        urlStatuses: { ...(current.urlStatuses || {}), [url]: "error" },
        urlLocalImageOutcomes,
        urlSkipReasons,
        batchPeerLibraryFiles: mergeGeneratedFilesByName(
          peerCsvFiles?.length
            ? mergeGeneratedFilesByName(
                current.batchPeerLibraryFiles || [],
                peerCsvFiles,
              )
            : current.batchPeerLibraryFiles || [],
          [summaryFile],
        ),
      },
    };
  });
  if (peerCsvFiles?.length) {
    emitInContentImageHarnessPayload(
      url,
      harnessSetters,
      makeInContentImageHarnessDonePayload(
        row.index,
        IN_CONTENT_STEP_CHECKLIST,
        formatPeerLocalImageLibraryChecklistMarkdown({
          entity: row.title || url,
          peerFileNames: peerCsvFiles.map((f) => f.name),
        }),
      ),
    );
  }
  setInContentImageHarnessMessage(harnessSetters, message);
}
