import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { generateInContentImageFromHtml } from "@/lib/in-content-image-generator";
import { ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import type { AiseoCacheWriteAccumulator } from "@/lib/overview/overview-aiseo-cache-write";
import { mapOverviewAiCopyWithConcurrency } from "@/lib/overview/overview-ai-copy-concurrency";
import {
  emitInContentImageHarnessPayload,
  setInContentImageHarnessMessage,
  type BlogInContentImageCatalogRow,
  type InContentImageHarnessResult,
} from "@/lib/overview/overview-blog-in-content-image-harness-batch";
import {
  createLocalImageHarnessPeerCallbacks,
  handleLocalImageHarnessSkip,
} from "@/lib/overview/overview-blog-in-content-image-harness-local";
import { generateLocalInContentImageFromHtml } from "@/lib/overview/overview-blog-local-image-generate";
import { resolveLocalImagePlaceEntity } from "@/lib/overview/overview-local-image-dfs-normalize";
import {
  finishInContentImageHarnessRowSuccess,
  handleInContentImageHarnessRowError,
} from "@/lib/overview/overview-blog-in-content-image-harness-row-finish";
import { extractH2TextsFromHtml } from "@/lib/overview/overview-blog-headers-extract";
import {
  IN_CONTENT_STEP_ANALYZE,
  IN_CONTENT_STEP_CHECKLIST,
  IN_CONTENT_STEP_GENERATE,
  formatInContentAnalyzeMarkdown,
  makeInContentImageHarnessDonePayload,
  makeInContentImageHarnessStartPayload,
} from "@/lib/overview/overview-blog-in-content-image-harness-sections";
import { gateLocalImageExistingScope } from "@/lib/overview/local-image-existing-scope";
import { setOverviewBulkHarnessPageState } from "@/lib/overview/overview-bulk-page-state";
import { overviewBulkPageRanges } from "@/lib/overview/overview-bulk-page-size";
import type { OverviewHarnessSetters } from "@/lib/overview/overview-blog-overview-harness-mutations";
import { resolveOverviewSourceHtml } from "@/lib/overview/overview-blog-overview-prepend";
import {
  htmlHasLocalInContentImage,
  prewarmSapPeerSiteInventories,
  stripPreferredBodyImageFromHtml,
} from "@/lib/overview/sap-cross-site-image-search";
export {
  finalizeOverviewBlogInContentImageHarnessBatch,
  initOverviewBlogInContentImageHarnessBatchState,
} from "@/lib/overview/overview-blog-in-content-image-harness-batch";
export type { BlogInContentImageCatalogRow } from "@/lib/overview/overview-blog-in-content-image-harness-batch";

export type RunOverviewBlogInContentImageHarnessBatchParams = {
  catalog: BlogInContentImageCatalogRow[];
  site: WordPressSite;
  apiKey: string;
  model?: string;
  /** When false, local kind rows error (non-SAP). */
  allowLocalImage?: boolean;
  /** Connected Integration sites for Local Image cross-site reuse. */
  peerSites?: WordPressSite[];
  harnessSetters: OverviewHarnessSetters;
  cacheWrite: AiseoCacheWriteAccumulator;
  updateRow: (index: number, patch: Partial<OverviewRow>) => void;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
};

export async function runOverviewBlogInContentImageHarnessBatch(
  params: RunOverviewBlogInContentImageHarnessBatchParams,
): Promise<{ ok: number; failed: number }> {
  const {
    catalog,
    site,
    apiKey,
    model,
    allowLocalImage = false,
    peerSites,
    harnessSetters,
    cacheWrite,
    updateRow,
    uploadAfterRowWrite,
  } = params;
  if (!catalog.length) return { ok: 0, failed: 0 };

  await ensureMasterInstructionsInMemory(site.id ?? null);

  if (allowLocalImage && peerSites?.length) {
    await prewarmSapPeerSiteInventories(peerSites);
  }

  const pageRanges = overviewBulkPageRanges(catalog.length);
  let ok = 0;
  let failed = 0;

  for (const { start, end, page, pageCount } of pageRanges) {
    const pageCatalog = catalog.slice(start, end);
    setOverviewBulkHarnessPageState({
      batchKey: harnessSetters.batchKey,
      siteId: harnessSetters.siteId,
      page,
      pageCount,
      start,
      end,
      total: catalog.length,
      setBulkOptimizationState: harnessSetters.setBulkOptimizationState,
      setOptimizationProgress: harnessSetters.setOptimizationProgress,
      step: "In Content Image",
    });

    await mapOverviewAiCopyWithConcurrency(
      pageCatalog.map((row, localIndex) => ({
        row,
        globalRowNum: start + localIndex + 1,
      })),
      async ({ row, globalRowNum }) => {
      const url = row.url.trim();
      try {
        updateRow(row.index, { status: "ai-in-content-image" });
        harnessSetters.setBulkOptimizationState((prev) => {
          const current = prev[harnessSetters.batchKey];
          if (!current) return prev;
          return {
            ...prev,
            [harnessSetters.batchKey]: {
              ...current,
              currentUrl: url,
              currentIndex: globalRowNum - 1,
              urlStatuses: { ...(current.urlStatuses || {}), [url]: "optimizing" },
            },
          };
        });
        setInContentImageHarnessMessage(
          harnessSetters,
          `In Content Image ${globalRowNum}/${catalog.length}: ${row.title || url}`,
          10 + Math.round(((globalRowNum - 1) / Math.max(catalog.length, 1)) * 85),
        );

        const sourceHtml = resolveOverviewSourceHtml(
          { postContentOptimized: row.html },
          row.html,
        );
        if (!sourceHtml.trim()) {
          failed += 1;
          updateRow(row.index, { status: "error" });
          harnessSetters.setBulkOptimizationState((prev) => {
            const current = prev[harnessSetters.batchKey];
            if (!current) return prev;
            return {
              ...prev,
              [harnessSetters.batchKey]: {
                ...current,
                urlStatuses: { ...(current.urlStatuses || {}), [url]: "error" },
              },
            };
          });
          setInContentImageHarnessMessage(
            harnessSetters,
            "No HTML body for in-content image",
          );
          return;
        }

        const bodyH2Titles = extractH2TextsFromHtml(sourceHtml).filter(
          (t) => t.trim().toLowerCase() !== "overview",
        );
        emitInContentImageHarnessPayload(
          url,
          harnessSetters,
          makeInContentImageHarnessStartPayload(row.index, IN_CONTENT_STEP_ANALYZE),
        );
        emitInContentImageHarnessPayload(
          url,
          harnessSetters,
          makeInContentImageHarnessDonePayload(
            row.index,
            IN_CONTENT_STEP_ANALYZE,
            formatInContentAnalyzeMarkdown(bodyH2Titles),
          ),
        );

        if (!bodyH2Titles.length) {
          failed += 1;
          updateRow(row.index, { status: "error" });
          harnessSetters.setBulkOptimizationState((prev) => {
            const current = prev[harnessSetters.batchKey];
            if (!current) return prev;
            return {
              ...prev,
              [harnessSetters.batchKey]: {
                ...current,
                urlStatuses: { ...(current.urlStatuses || {}), [url]: "error" },
              },
            };
          });
          setInContentImageHarnessMessage(harnessSetters, "No H2 sections for image placement");
          return;
        }

        emitInContentImageHarnessPayload(
          url,
          harnessSetters,
          makeInContentImageHarnessStartPayload(row.index, IN_CONTENT_STEP_CHECKLIST),
        );
        emitInContentImageHarnessPayload(
          url,
          harnessSetters,
          makeInContentImageHarnessStartPayload(row.index, IN_CONTENT_STEP_GENERATE),
        );

        const imageKind = row.imageKind === "local" ? "local" : "photo";
        let localPhaseLog = "";
        let result: InContentImageHarnessResult;

        if (imageKind === "local") {
          if (!allowLocalImage) {
            throw new Error("Local Image is only available on SAP (entity) rows");
          }
          const resolvedLocalMode = row.localImageMode === "find" ? "find" : "generate";
          const existingScope =
            resolvedLocalMode === "generate"
              ? row.localImageExistingScope
              : undefined;
          const hasExisting = htmlHasLocalInContentImage(sourceHtml);
          const gate =
            resolvedLocalMode === "generate"
              ? gateLocalImageExistingScope(existingScope, hasExisting)
              : ({ action: "generate", stripExisting: false } as const);
          if (gate.action === "skip") {
            ok += 1;
            handleLocalImageHarnessSkip({
              url,
              row,
              sourceHtml,
              hasExisting,
              gate,
              harnessSetters,
              updateRow,
            });
            return;
          }

          const htmlForGenerate = gate.stripExisting
            ? stripPreferredBodyImageFromHtml(sourceHtml)
            : sourceHtml;

          const entity = await resolveLocalImagePlaceEntity({
            url,
            title: row.title,
            apiKey,
          });
          // #region agent log
          // #endregion
          const peerCallbacks = createLocalImageHarnessPeerCallbacks({
            url,
            row,
            entity,
            harnessSetters,
          });

          result = await generateLocalInContentImageFromHtml({
            html: htmlForGenerate,
            site,
            entity,
            pageUrl: url,
            focusKeyword: row.focusKeyword || entity,
            flowTitle: row.title || entity,
            forcedSectionHeader: row.forcedSectionHeader,
            apiKey,
            model,
            peerSites,
            localImageMode: resolvedLocalMode,
            onPeerPlanReady: peerCallbacks.onPeerPlanReady,
            onPeerCsvReady: peerCallbacks.onPeerCsvReady,
            onLocalImagePhase: peerCallbacks.onLocalImagePhase,
            onPeerLibrariesReady: peerCallbacks.onPeerLibrariesReady,
          });
          localPhaseLog = peerCallbacks.localPhaseLog();
        } else {
          result = await generateInContentImageFromHtml({
            html: sourceHtml,
            flowTitle: row.title || row.focusKeyword || url,
            focusKeyword: row.focusKeyword || row.title || "",
            site,
            imageType: "photo",
            apiKey,
            model,
            forcedSectionHeader: row.forcedSectionHeader,
          });
        }
        await finishInContentImageHarnessRowSuccess({
          url,
          row,
          result,
          imageKind,
          localPhaseLog,
          harnessSetters,
          cacheWrite,
          updateRow,
          uploadAfterRowWrite,
        });
        ok += 1;
      } catch (err) {
        failed += 1;
        handleInContentImageHarnessRowError({
          url,
          row,
          err,
          harnessSetters,
          updateRow,
        });
      }
    },
    );
  }

  setInContentImageHarnessMessage(
    harnessSetters,
    `In Content Image finished: ${ok} ok, ${failed} failed`,
    100,
  );

  return { ok, failed };
}
