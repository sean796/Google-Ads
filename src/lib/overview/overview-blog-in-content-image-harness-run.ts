import type { Dispatch, SetStateAction } from "react";
import { harnessStepProgress, mergeOverviewHarnessProgress, mergeOverviewHarnessProgressSiteAndBatch } from "@/lib/overview/overview-harness-progress";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { AiseoCacheWriteAccumulator } from "@/lib/overview/overview-aiseo-cache-write";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";

import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import { ensureMasterInstructionsInMemory } from "@/lib/master-instructions-storage";
import {
  initOverviewBulkHarnessPagination,
  setOverviewBulkHarnessPageState,
} from "@/lib/overview/overview-bulk-page-state";
import { mapOverviewAiCopyWithConcurrency } from "@/lib/overview/overview-ai-copy-concurrency";
import { overviewBulkPageRanges } from "@/lib/overview/overview-bulk-page-size";
import { extractH2TextsFromHtml } from "@/lib/overview/overview-blog-headers-extract";
import { resolveOverviewSourceHtml } from "@/lib/overview/overview-blog-overview-prepend";
import type { OverviewHarnessSetters } from "@/lib/overview/overview-blog-overview-harness-mutations";
import { reduceHarnessSectionList } from "@/lib/bulk/harness-sections-reducer";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import { generateInContentImageFromHtml } from "@/lib/in-content-image-generator";
import { generateLocalInContentImageFromHtml } from "@/lib/overview/overview-blog-local-image-generate";
import {
  buildPeerSitesPlanFile,
  formatPeerSitesChecklistStatus,
  mergeGeneratedFilesByName,
} from "@/lib/overview/overview-peer-csv-details";
import {
  aiseoRowFilesForUpload,
  buildAiseoElementTextFile,
  mergeAiseoRowFinishFiles,
} from "@/lib/overview/overview-aiseo-row-artifacts";
import {
  generatedFilesForUrl,
  storageKeyForUrlGeneratedFiles,
} from "@/lib/content-optimization/content-optimizer-bulk-generator-bindings";
import { resolveLocalImagePlaceEntity } from "@/lib/overview/overview-local-image-dfs-normalize";
import {
  extractPreferredBodyImageFromHtml,
  htmlHasLocalInContentImage,
  prewarmSapPeerSiteInventories,
  stripPreferredBodyImageFromHtml,
} from "@/lib/overview/sap-cross-site-image-search";
import {
  gateLocalImageExistingScope,
  type LocalImageExistingScope,
} from "@/lib/overview/local-image-existing-scope";
import {
  formatInContentAnalyzeMarkdown,
  formatInContentImageResultMarkdown,
  formatLocalImageChecklistMarkdown,
  formatPeerLocalImageLibraryChecklistMarkdown,
  appendLocalImagePhaseLog,
  formatLocalImagePhaseLine,
  rebuildLocalImageBatchSummaryFile,
  IN_CONTENT_IMAGE_HARNESS_SECTION_TITLES,
  IN_CONTENT_STEP_ANALYZE,
  IN_CONTENT_STEP_CHECKLIST,
  IN_CONTENT_STEP_GENERATE,
  IN_CONTENT_STEP_INSERT,
  makeInContentImageHarnessDonePayload,
  makeInContentImageHarnessProgressPayload,
  makeInContentImageHarnessStartPayload,
} from "@/lib/overview/overview-blog-in-content-image-harness-sections";

type SetBulkState = Dispatch<SetStateAction<Record<string, BulkOptimizationState>>>;
type SetOptProgress = Dispatch<SetStateAction<Record<string, unknown>>>;
type SetIsOptimizing = Dispatch<SetStateAction<Record<string, boolean>>>;

export type BlogInContentImageCatalogRow = {
  index: number;
  url: string;
  title: string;
  focusKeyword: string;
  pageHeading?: string;
  html: string;
  /** When set, skip auto heading pick. */
  forcedSectionHeader?: string;
  imageKind?: "photo" | "local";
  /** Local: both modes search peer caches first; find errors on miss, generate falls through to AI. */
  localImageMode?: "find" | "generate";
  /** Generate Local: new (default) / old (replace) / all. */
  localImageExistingScope?: LocalImageExistingScope;
};

function setInContentImageHarnessMessage(
  setters: OverviewHarnessSetters,
  message: string,
  progress?: number,
): void {
  const pct = progress ?? 5;
  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: "In Content Image",
          progress: pct,
          message,
        }),
      },
    };
  });
  setters.setOptimizationProgress((prev) => {
    const next = { ...(prev as Record<string, unknown>) };
    mergeOverviewHarnessProgressSiteAndBatch(next, setters.siteId, {
      step: "In Content Image",
      progress: pct,
      message,
    });
    return next;
  });
}

function writeInContentImageRowFiles(
  url: string,
  setters: OverviewHarnessSetters,
  reportMd: string,
  postHtml: string,
): void {
  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    const storageKey = storageKeyForUrlGeneratedFiles(
      current.urlGeneratedFiles,
      url,
      current.urls,
    );
    const existingFiles = generatedFilesForUrl(current.urlGeneratedFiles, url);
    const elementFile = buildAiseoElementTextFile("in-content-image.md", reportMd);
    const rowSlotFiles = mergeAiseoRowFinishFiles({
      runKind: "aiInContentImage",
      url,
      existingFiles,
      elementFiles: elementFile ? [elementFile] : [],
      postHtml,
    });
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        urlGeneratedFiles: {
          ...(current.urlGeneratedFiles || {}),
          [storageKey]: rowSlotFiles,
        },
      },
    };
  });
}

function emitInContentImageHarnessPayload(
  url: string,
  setters: OverviewHarnessSetters,
  payload: BulkHarnessSectionPayload,
): void {
  const progressLine =
    payload.phase === "progress" && payload.markdownSlice?.trim()
      ? payload.markdownSlice.trim().split("\n").pop() || payload.title
      : payload.title;
  const message =
    payload.phase === "progress"
      ? `In Content Image: ${progressLine}`
      : `In Content Image ${payload.sectionIndex + 1}/${payload.totalSections}: ${payload.title}${payload.phase === "start" ? "…" : ""}`;
  const progress =
    10 +
    Math.round(
      ((payload.sectionIndex +
        (payload.phase === "done" ? 1 : payload.phase === "progress" ? 0.65 : 0.5)) /
        Math.max(payload.totalSections, 1)) *
        80,
    );

  setters.setBulkOptimizationState((prev) => {
    const current = prev[setters.batchKey];
    if (!current) return prev;
    const prevSections = current.urlHarnessSections?.[url] ?? [];
    const nextUrlSections = reduceHarnessSectionList(prevSections, payload);
    return {
      ...prev,
      [setters.batchKey]: {
        ...current,
        currentUrl: url,
        urlHarnessSections: {
          ...(current.urlHarnessSections || {}),
          [url]: nextUrlSections,
        },
        currentStepProgress: harnessStepProgress(current.currentStepProgress, {
          step: "In Content Image",
          progress,
          message,
          harnessPlannedSectionCount: IN_CONTENT_IMAGE_HARNESS_SECTION_TITLES.length,
        }),
      },
    };
  });

  setters.setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgressSiteAndBatch(prev as Record<string, unknown>, setters.siteId, {
      step: "In Content Image",
      progress,
      message,
      harnessPlannedSectionCount: IN_CONTENT_IMAGE_HARNESS_SECTION_TITLES.length,
    }),
  );
}

export function initOverviewBlogInContentImageHarnessBatchState(params: {
  site: WordPressSite;
  catalog: BlogInContentImageCatalogRow[];
  setBulkOptimizationState: SetBulkState;
  setOptimizationProgress: SetOptProgress;
  setIsOptimizingContent: SetIsOptimizing;
  prepMessage?: string;
}): string {
  const {
    site,
    catalog,
    setBulkOptimizationState,
    setOptimizationProgress,
    setIsOptimizingContent,
    prepMessage = "Preparing In Content Image batch…",
  } = params;

  const batchKey = `${site.id}-batch`;
  const urls = catalog.map((c) => c.url.trim()).filter(Boolean);
  const urlKeywords: Record<string, string> = {};

  for (const entry of catalog) {
    const url = entry.url.trim();
    if (!url) continue;
    if (entry.focusKeyword) urlKeywords[url] = entry.focusKeyword;
  }

  setOptimizingState(setIsOptimizingContent, batchKey, true);
  setOptimizationProgress((prev) =>
    mergeOverviewHarnessProgress(prev as Record<string, unknown>, site.id, {
      step: "In Content Image",
      progress: 2,
      message: prepMessage,
      harnessSections: [],
      harnessPlannedSectionCount: IN_CONTENT_IMAGE_HARNESS_SECTION_TITLES.length,
    }),
  );
  setBulkOptimizationState((prev) => ({
    ...prev,
    [batchKey]: {
      urls,
      currentIndex: 0,
      urlStatuses: {},
      currentStep: "In Content Image",
      currentUrl: urls[0],
      urlKeywords,
      runKind: "aiInContentImage",
      harnessStartedAt: Date.now(),
      urlHarnessSections: {},
      urlGeneratedFiles: {},
      currentStepProgress: harnessStepProgress(undefined, {
        step: "In Content Image",
        progress: 2,
        message: prepMessage,
        harnessSections: [],
        harnessPlannedSectionCount: IN_CONTENT_IMAGE_HARNESS_SECTION_TITLES.length,
      }),
    },
  }));
  initOverviewBulkHarnessPagination(batchKey, urls.length, setBulkOptimizationState);

  return batchKey;
}

export function finalizeOverviewBlogInContentImageHarnessBatch(
  batchKey: string,
  siteId: string,
  setIsOptimizingContent: SetIsOptimizing,
  setOptimizationProgress: SetOptProgress,
  setBulkOptimizationState?: SetBulkState,
): void {
  setOptimizingState(setIsOptimizingContent, batchKey, false);
  // Also clear leftover site-level optimizing from a prior Content Opt run.
  setIsOptimizingContent((prev) => {
    const updated = { ...prev };
    delete updated[siteId];
    return updated;
  });
  // Keep the batch state so the completed report stays visible in the Details drawer.
  // It is cleared only when the user explicitly closes the batch (resetBulkBatch).
  if (setBulkOptimizationState) {
    setBulkOptimizationState((prev) => {
      const current = prev[batchKey];
      if (!current) return prev;
      return { ...prev, [batchKey]: { ...current, currentStep: "Complete" } };
    });
  }
  setOptimizationProgress((prev) => {
    const next = { ...(prev as Record<string, unknown>) };
    delete next[batchKey];
    mergeOverviewHarnessProgressSiteAndBatch(next, siteId, {
      step: "Complete",
      progress: 100,
      message: "In Content Image batch finished",
    });
    return next;
  });
}

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
        let result: {
          html: string;
          imageUrl: string;
          mediaId?: number;
          alt: string;
          sectionHeader: string;
          referenceImageUrl?: string;
          referenceSourceUrl?: string;
          entity?: string;
          sharedFromSiteName?: string;
          sharedFromPageUrl?: string;
          reusedFromCrossSite?: boolean;
          peerCsvFiles?: Array<{ name: string; content: string; mimeType: string }>;
        };

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
            updateRow(row.index, { status: "idle" });
            // #region agent log
            // #endregion
            harnessSetters.setBulkOptimizationState((prev) => {
              const current = prev[harnessSetters.batchKey];
              if (!current) return prev;
              const urlLocalImageOutcomes = {
                ...(current.urlLocalImageOutcomes || {}),
                [url]: "skipped" as const,
              };
              const urlSkipReasons = {
                ...(current.urlSkipReasons || {}),
                [url]: gate.reason,
              };
              const urlGeneratedFiles = { ...(current.urlGeneratedFiles || {}) };
              const summaryFile = rebuildLocalImageBatchSummaryFile({
                urls: current.urls || [],
                urlKeywords: current.urlKeywords,
                urlOutcomes: urlLocalImageOutcomes,
                urlSkipReasons,
                urlGeneratedFiles,
              });
              return {
                ...prev,
                [harnessSetters.batchKey]: {
                  ...current,
                  urlStatuses: { ...(current.urlStatuses || {}), [url]: "skipped" },
                  urlSkipReasons,
                  urlLocalImageOutcomes,
                  batchPeerLibraryFiles: mergeGeneratedFilesByName(
                    current.batchPeerLibraryFiles || [],
                    [summaryFile],
                  ),
                },
              };
            });
            const existing = extractPreferredBodyImageFromHtml(sourceHtml);
            const checklistLabel = hasExisting
              ? "Already has Local Image"
              : "No Local Image to replace";
            emitInContentImageHarnessPayload(
              url,
              harnessSetters,
              makeInContentImageHarnessDonePayload(
                row.index,
                IN_CONTENT_STEP_CHECKLIST,
                checklistLabel,
              ),
            );
            emitInContentImageHarnessPayload(
              url,
              harnessSetters,
              makeInContentImageHarnessDonePayload(
                row.index,
                IN_CONTENT_STEP_GENERATE,
                existing?.url
                  ? `${gate.reason}\n${existing.url}`
                  : gate.reason,
              ),
            );
            emitInContentImageHarnessPayload(
              url,
              harnessSetters,
              makeInContentImageHarnessDonePayload(
                row.index,
                IN_CONTENT_STEP_INSERT,
                hasExisting
                  ? "No insert — Local Image already on page"
                  : "No insert — nothing to replace",
              ),
            );
            setInContentImageHarnessMessage(
              harnessSetters,
              `${gate.reason} ${row.title || url}`,
            );
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

          const publishPeerPlan = (
            peers: Array<{ name: string; siteUrl: string }>,
          ) => {
            // #region agent log
            // #endregion
            const planFile = buildPeerSitesPlanFile({ entity, peers });
            harnessSetters.setBulkOptimizationState((prev) => {
              const current = prev[harnessSetters.batchKey];
              if (!current) return prev;
              // One batch-level plan only (do not attach per keyword).
              if ((current.batchPeerLibraryFiles || []).some((f) => f.name === planFile.name)) {
                return prev;
              }
              return {
                ...prev,
                [harnessSetters.batchKey]: {
                  ...current,
                  batchPeerLibraryFiles: mergeGeneratedFilesByName(
                    current.batchPeerLibraryFiles || [],
                    [planFile],
                  ),
                },
              };
            });
            emitInContentImageHarnessPayload(
              url,
              harnessSetters,
              makeInContentImageHarnessDonePayload(
                row.index,
                IN_CONTENT_STEP_CHECKLIST,
                formatPeerSitesChecklistStatus({
                  entity,
                  peerCount: peers.length,
                }),
              ),
            );
          };

          const attachPeerCsv = (file: {
            name: string;
            content: string;
            mimeType: string;
          }) => {
            harnessSetters.setBulkOptimizationState((prev) => {
              const current = prev[harnessSetters.batchKey];
              if (!current) return prev;
              return {
                ...prev,
                [harnessSetters.batchKey]: {
                  ...current,
                  batchPeerLibraryFiles: mergeGeneratedFilesByName(
                    current.batchPeerLibraryFiles || [],
                    [file],
                  ),
                },
              };
            });
          };

          const publishLocalPhase = (info: {
            phase: "looking" | "found" | "not_found" | "reusing" | "generating";
            detail?: string;
          }) => {
            localPhaseLog = appendLocalImagePhaseLog(localPhaseLog, info);
            emitInContentImageHarnessPayload(
              url,
              harnessSetters,
              makeInContentImageHarnessProgressPayload(
                row.index,
                IN_CONTENT_STEP_GENERATE,
                localPhaseLog,
              ),
            );
            setInContentImageHarnessMessage(
              harnessSetters,
              formatLocalImagePhaseLine(info),
            );
          };

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
            onPeerPlanReady: publishPeerPlan,
            onPeerCsvReady: attachPeerCsv,
            onLocalImagePhase: publishLocalPhase,
            onPeerLibrariesReady: (peerCsvFiles) => {
              // #region agent log
              // #endregion
              harnessSetters.setBulkOptimizationState((prev) => {
                const current = prev[harnessSetters.batchKey];
                if (!current) return prev;
                return {
                  ...prev,
                  [harnessSetters.batchKey]: {
                    ...current,
                    batchPeerLibraryFiles: mergeGeneratedFilesByName(
                      current.batchPeerLibraryFiles || [],
                      peerCsvFiles,
                    ),
                  },
                };
              });
            },
          });
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

        ok += 1;
      } catch (err) {
        failed += 1;
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
