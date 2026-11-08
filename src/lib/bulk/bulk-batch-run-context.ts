import { notify } from "@/lib/app-notifications";
import { NOTIFY_A_BULK_RUN_IS_ALREADY_IN_PROGRESS, NOTIFY_INTERNAL_ERROR_ROW_INDEX_MAPPING_DOES_NO, NOTIFY_INVALID_TARGET_SITE_EXAMPLE_COM_IS_NOT_A, NOTIFY_LOADING_WORDPRESS_SITE_INVENTORY_ONE_REQ, NOTIFY_PROCESSING_CANCELLED_BY_USER, notifyBulkProcessingCompleteXFilesGenerat, notifyBulkProcessingFailedX, notifyLoadedXLinkableUrlsFromSiteInvento, notifyRowXFailedX, notifyRowXXCompletedXFilesGenerated, notifyWordpressFetchFailedX, notifyWordpressSiteNotFoundX } from "@/lib/notify-messages";
import { buildSitesToPostFromPosting, prefetchBulkWordPressLinkValidationForRun, clearBulkUploadValidationCache, type CSVRow, type BulkProcessingOptions, type WordPressPostingOptions, type WordPressPostDestination } from '@/lib/bulk-auto-generate';
import { BULK_PROCESSING_CANCELLED_MESSAGE, runBulkRowsInParallel } from '@/lib/bulk/bulk-row-concurrency';
import { BulkFileManager, type BulkGeneratedFile } from '@/lib/bulk-file-manager';
import { PROMPT_LOG_FILE_TYPE, beginPromptTrace, buildPromptTraceMarkdown, endPromptTrace, type PromptTrace } from '@/lib/openrouter-prompt-trace';
import { savePromptTraceToHub } from '@/lib/wordpress-api/prompt-trace-api';
import { ensureBulkGenerationWpInventory, loadBlogPlayLinkablesForSite } from '@/lib/bulk/bulk-generation-wp-inventory';
import { getStoredSites } from '@/components/integrations/storage';
import { buildPortfolioBlockedHosts } from '@/lib/portfolio-link-blocklist';
import type { ConnectedSiteSummary } from '@/components/integrations/types';
import { clearGoogleMapsImageSessionCache } from '@/lib/content-generation/google-maps-image-api';
import { createPeerFeaturedImageReportCollector, formatPeerFeaturedImageReportMarkdown, peerFeaturedImageReportHasContent, PEER_FEATURED_IMAGE_REPORT_FILENAME } from '@/lib/bulk/peer-featured-image-report';
import type { PeerFeaturedLibraryCsvFile } from '@/lib/overview/sap-peer-featured-image-search';
import { applyRowSitemapToPosting, defaultBulkSitemapMode, resolveRowSitemapType, resolveSiteSitemapMode, type BulkRowSitemapType } from '@/lib/bulk/bulk-sitemap-mode';
import { countSapMapsRowsByEntity, createSapMapsMediaBank } from '@/lib/bulk/sap-maps-media-bank';
import { resolveOpenRouterApiKeyForHarness } from '@/lib/openrouter-api-key-resolve';
import { loadDataForSEOApiKey } from '@/lib/api';
import { setRuntimeDataForSeoApiKey } from '@/lib/integration-api-keys-runtime';
import type { Dispatch, SetStateAction } from 'react';
import type { BulkHarnessSectionUi } from '@/lib/bulk/bulk-single-row-processor';
import { logger } from "@/lib/logger";
import { logBulkRunStep } from "@/lib/bulk/bulk-run-step-log";

export interface BulkBatchRunContext {
  apiKey?: string;
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  flowPurpose?: string;
  featuredImageType?: 'ai-generated' | 'google-maps';
  fileManager: BulkFileManager;
  processRow: (rowIndex: number, row: CSVRow, options: BulkProcessingOptions) => Promise<BulkGeneratedFile[]>;
  connectedSite?: ConnectedSiteSummary;
  wordPressPosting?: WordPressPostingOptions;
  siteConfigs: Record<string, { sitemapType: 'post' | 'entity' | 'custom' }>;
  selectedWordPressSites: Set<string>;
  blogImportSourceFile?: File | null;
  blogImportForm?: { focusKeyword: string; titleOverride: string; featuredImageMode: "y" | "n" | "google-maps"; entity: string };
  bulkPostDestination?: WordPressPostDestination;
  recordRunStatus: (message: string) => void;
  appendProcessingStep: (message: string) => void;
  processingInFlightRef: { current: boolean };
  abortControllerRef: { current: AbortController | null };
  harnessRowSectionsRef: { current: Map<number, BulkHarnessSectionUi[]> };
  setIsProcessing: Dispatch<SetStateAction<boolean>>;
  setCurrentRow: Dispatch<SetStateAction<number>>;
  setTotalRows: Dispatch<SetStateAction<number>>;
  setRows: Dispatch<SetStateAction<CSVRow[]>>;
  setHarnessSections: Dispatch<SetStateAction<BulkHarnessSectionUi[]>>;
  setHarnessPlannedSectionCount: Dispatch<SetStateAction<number | null>>;
  setHarnessByRow: Dispatch<SetStateAction<Map<number, BulkHarnessSectionUi[]>>>;
  setProcessingStepLog: Dispatch<SetStateAction<string[]>>;
  setFailedRowIndices: Dispatch<SetStateAction<Set<number>>>;
  setFailedRowMessages: Dispatch<SetStateAction<Record<number, string>>>;
}

export async function runBulkBatchRows(
  context: BulkBatchRunContext,
  csvRows: CSVRow[],
  wordPressPostingOverride?: WordPressPostingOptions,
  rowDisplayIndices?: number[],
): Promise<void> {
  const { apiKey, selectedModel, temperature, maxTokens, topP, flowPurpose, featuredImageType, fileManager, processRow, connectedSite, wordPressPosting, siteConfigs, selectedWordPressSites, blogImportSourceFile, blogImportForm, bulkPostDestination, recordRunStatus, appendProcessingStep, processingInFlightRef, abortControllerRef, harnessRowSectionsRef, setIsProcessing, setCurrentRow, setTotalRows, setRows, setHarnessSections, setHarnessPlannedSectionCount, setHarnessByRow, setProcessingStepLog, setFailedRowIndices, setFailedRowMessages } = context;
    if (processingInFlightRef.current) {
      logger.warn("[Bulk] post generation skipped: previous batch still marked in-flight");
      setIsProcessing(false);
      notify.error(NOTIFY_A_BULK_RUN_IS_ALREADY_IN_PROGRESS);
      return;
    }

    const effectiveOpenRouterKey = (await resolveOpenRouterApiKeyForHarness()).trim();

    const effectiveDataForSeoKey = apiKey?.trim() || loadDataForSEOApiKey()?.trim() || "";
    setRuntimeDataForSeoApiKey(effectiveDataForSeoKey);

    const displayIndices =
      rowDisplayIndices ?? csvRows.map((_, idx) => idx);
    if (displayIndices.length !== csvRows.length) {
      notify.error(NOTIFY_INTERNAL_ERROR_ROW_INDEX_MAPPING_DOES_NO);
      return;
    }

    processingInFlightRef.current = true;
    setIsProcessing(true);
    logBulkRunStep("post generation started", { rows: csvRows.length });
    recordRunStatus("Creating posts...");
    setRows(csvRows);
    setCurrentRow(0);
    setTotalRows(csvRows.length);
    setHarnessSections([]);
    setHarnessPlannedSectionCount(null);
    setHarnessByRow(new Map());
    harnessRowSectionsRef.current.clear();
    setProcessingStepLog([]);
    setFailedRowIndices(new Set());
    setFailedRowMessages({});
    fileManager.clear();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const storedSitesForPortfolio = getStoredSites();
    const normalizeSite = (url: string) =>
      url.trim().toLowerCase().replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '');
    const matchedWpSite = connectedSite
      ? storedSitesForPortfolio.find((s) => normalizeSite(s.siteUrl) === normalizeSite(connectedSite.siteUrl))
      : undefined;
    const portfolioBlockedHostsList = buildPortfolioBlockedHosts(storedSitesForPortfolio, {
      excludeSiteId: matchedWpSite?.id,
      excludeSiteUrl: connectedSite?.siteUrl,
    });
    const portfolioBlockedHostsOpt =
      portfolioBlockedHostsList.length > 0 ? portfolioBlockedHostsList : undefined;

    const postingBase = wordPressPostingOverride || wordPressPosting;

    const postingForLoop = postingBase;

    const selectedSiteId = Array.from(selectedWordPressSites)[0];
    const entitySitemapAvailable = Boolean(matchedWpSite?.entitySitemapUrl?.trim());
    const siteSitemapMode = resolveSiteSitemapMode(
      siteConfigs,
      selectedWordPressSites,
      entitySitemapAvailable,
    );
    const rowSitemapFallback: BulkRowSitemapType = defaultBulkSitemapMode();

    const wordPressPostsByKeyword = new Map<string, Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string; collection?: string; postType?: string }>>();

    let wordPressSiteForRun: ReturnType<typeof getStoredSites>[number] | undefined;
    if (connectedSite) {
      const normalizeDomain = (url: string): string =>
        url.trim().toLowerCase().replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
      const connectedDomain = normalizeDomain(connectedSite.siteUrl);
      if (connectedDomain === 'example.com' || connectedDomain.endsWith('.example.com')) {
        notify.error(NOTIFY_INVALID_TARGET_SITE_EXAMPLE_COM_IS_NOT_A);
        processingInFlightRef.current = false;
        setIsProcessing(false);
        return;
      }
      const sites = getStoredSites();
      wordPressSiteForRun = sites.find((s) => {
        const normalize = (url: string) =>
          url.trim().toLowerCase().replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '');
        return normalize(s.siteUrl) === normalize(connectedSite.siteUrl);
      });
      if (!wordPressSiteForRun) {
        notify.warning(notifyWordpressSiteNotFoundX(connectedSite.siteUrl));
      }
    }

    clearGoogleMapsImageSessionCache();
    const sapMapsMediaBank = createSapMapsMediaBank();
    const sapMapsEntityRowCounts = countSapMapsRowsByEntity(csvRows);

    const peerFeaturedReport = createPeerFeaturedImageReportCollector();
    const peerFeaturedCsvByName = new Map<string, string>();
    const mergePeerFeaturedCsv = (file: PeerFeaturedLibraryCsvFile) => {
      const existing = peerFeaturedCsvByName.get(file.name);
      if (!existing) {
        peerFeaturedCsvByName.set(file.name, file.content);
        return;
      }
      const merged = existing.split('\n');
      const seen = new Set(merged);
      const incoming = file.content.split('\n');
      for (let li = 1; li < incoming.length; li += 1) {
        const line = incoming[li]!;
        if (line && !seen.has(line)) {
          seen.add(line);
          merged.push(line);
        }
      }
      peerFeaturedCsvByName.set(file.name, merged.join('\n'));
    };

    let linkPrefetchPromise: Promise<void> | undefined;
    if (postingForLoop?.enabled) {
      const sitesToPost = buildSitesToPostFromPosting(postingForLoop);
      if (sitesToPost.length > 0) {
        logBulkRunStep("WordPress link validation prefetch started", {
          sites: sitesToPost.length,
        });
        linkPrefetchPromise = prefetchBulkWordPressLinkValidationForRun(sitesToPost).then(() => {
          logBulkRunStep("WordPress link validation prefetch finished");
        });
      }
    }

    try {
      let runHadFailure = false;

      if (wordPressSiteForRun?.username && wordPressSiteForRun.appPassword) {
        try {
          logBulkRunStep("WordPress site inventory load started", {
            siteUrl: wordPressSiteForRun.siteUrl,
          });
          notify.info(NOTIFY_LOADING_WORDPRESS_SITE_INVENTORY_ONE_REQ);
          const inv = await ensureBulkGenerationWpInventory(wordPressSiteForRun, (msg) => {
            logBulkRunStep(msg);
            notify.info(msg);
          });
          if (inv.error?.trim()) {
            notify.warning(inv.error.trim());
          }
          const allLinkables = await loadBlogPlayLinkablesForSite(
            wordPressSiteForRun,
            inv.rows ?? [],
          );
          const uniqueKeywords = new Set(csvRows.map((r) => r.keyword.toLowerCase().trim()));
          for (const keyword of uniqueKeywords) {
            wordPressPostsByKeyword.set(keyword, allLinkables);
          }
          logBulkRunStep("WordPress site inventory load finished", {
            linkables: allLinkables.length,
            keywords: uniqueKeywords.size,
          });
          notify.success(
            notifyLoadedXLinkableUrlsFromSiteInvento(allLinkables.length, uniqueKeywords.size),
          );
        } catch (error) {
          logger.error('[WordPress] Inventory fetch error:', error);
          logBulkRunStep("WordPress site inventory load failed", {
            error: error instanceof Error ? error.message : String(error),
          });
          notify.warning(
            notifyWordpressFetchFailedX(error instanceof Error ? error.message : 'Unknown error'),
          );
        }
      } else {
        logBulkRunStep("WordPress site inventory skipped", {
          hasSite: Boolean(wordPressSiteForRun),
          hasCredentials: Boolean(
            wordPressSiteForRun?.username && wordPressSiteForRun?.appPassword,
          ),
        });
      }

      const runRow = async (i: number): Promise<void> => {
        logBulkRunStep(`row ${i + 1}/${csvRows.length} pipeline started`, {
          keyword: csvRows[i]?.keyword,
          title: csvRows[i]?.title,
        });
        setCurrentRow(i);

        const rowSitemapType = resolveRowSitemapType(
          siteSitemapMode,
          csvRows[i]!,
          rowSitemapFallback,
        );
        const rowWordPressPosting = applyRowSitemapToPosting(postingForLoop, rowSitemapType);

        const options: BulkProcessingOptions = {
          apiKey: effectiveDataForSeoKey,
          openRouterApiKey: effectiveOpenRouterKey,
          blogImportSourceFile,
          blogImportForm,
          selectedModel,
          temperature,
          maxTokens,
          topP,
          flowPurpose,
          featuredImageType,
          wordPressPosting: rowWordPressPosting,
          headerPostDestination: bulkPostDestination,
          wordPressPostsByKeyword: wordPressPostsByKeyword.size > 0 ? wordPressPostsByKeyword : undefined,
          portfolioBlockedHosts: portfolioBlockedHostsOpt,
          bulkScheduleSlotIndex: i,
          sapMapsMediaBank,
          sapMapsEntityRowCounts,
          peerFeaturedReport,
          onPeerFeaturedCsv: mergePeerFeaturedCsv,
          linkPrefetchPromise,
          // Inner pipeline passes the *storage* row index (displayRows index). Progress UI must stay batch-based (i).
          onProgress: (_storageRowIndex, _total, statusText) => {
            setCurrentRow(i);
            recordRunStatus(statusText);
          },
          onRowComplete: (_rowIndex, files) => {
            notify.success(notifyRowXXCompletedXFilesGenerated(i + 1, csvRows.length, files.length));
          },
          onError: (_rowIndex, error) => {
            logger.warn(`Row ${i + 1} step error (row may still complete):`, error.message);
          },
        };

        try {
          const files = await processRow(i, csvRows[i], options);
          // Only mark as complete if we got files back (all generation succeeded)
          if (files && files.length > 0) {
            options.onRowComplete?.(i, files);
          }
        } catch (error) {
          setFailedRowIndices((prev) => new Set(prev).add(i));
          runHadFailure = true;
          const msg = error instanceof Error ? error.message : String(error);
          setFailedRowMessages((prev) => ({ ...prev, [i]: msg }));
          recordRunStatus(`Failed: ${msg}`);
          notify.error(notifyRowXFailedX(i + 1, msg));
          logger.error(`Error processing row ${i + 1}:`, error);
        }
      };

      let endedTrace: PromptTrace | null = null;
      logBulkRunStep("parallel row runner starting", { rowCount: csvRows.length });
      beginPromptTrace(`Bulk run, ${csvRows.length} row${csvRows.length === 1 ? '' : 's'} in parallel`);
      try {
        await runBulkRowsInParallel({ rowCount: csvRows.length, signal: controller.signal, runRow });
        logBulkRunStep("parallel row runner finished");
      } finally {
        const trace = endPromptTrace();
        endedTrace = trace;
        if (trace && trace.calls.length > 0) {
          const timestamp = Date.now();
          const content = buildPromptTraceMarkdown(trace, {
            title: connectedSite?.siteUrl ?? 'Bulk run',
            path: 'all rows',
          });
          csvRows.forEach((row, rowIndex) => {
            fileManager.addFile({
              id: BulkFileManager.createFileId(rowIndex, PROMPT_LOG_FILE_TYPE, timestamp),
              rowIndex,
              fileName: `${PROMPT_LOG_FILE_TYPE}-${timestamp}.md`,
              content,
              mimeType: 'text/markdown',
              status: 'completed',
              timestamp,
              rowData: row,
            });
          });
        }
      }

      if (!runHadFailure) {
        recordRunStatus("All rows processed");
        notify.success(notifyBulkProcessingCompleteXFilesGenerat(fileManager.getStats().completed, ""));
      } else {
        recordRunStatus("Bulk run finished with row errors");
      }

      if (endedTrace && endedTrace.calls.length > 0) {
        try {
          await savePromptTraceToHub({
            siteUrl: connectedSite?.siteUrl ?? '',
            runLabel: endedTrace.label,
            trace: endedTrace,
          });
        } catch (traceError) {
          const msg = traceError instanceof Error ? traceError.message : String(traceError);
          appendProcessingStep(`Warning: prompt log was not saved to the hub: ${msg}`);
          recordRunStatus(`Warning: prompt log was not saved to the hub: ${msg}`);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === BULK_PROCESSING_CANCELLED_MESSAGE) {
        notify.warning(NOTIFY_PROCESSING_CANCELLED_BY_USER);
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        recordRunStatus(`Failed: ${errorMessage}`);
        notify.error(notifyBulkProcessingFailedX(errorMessage));
      }
    } finally {
      // Surface the searched peer libraries and the featured image source report as run files.
      const runFileTimestamp = Date.now();
      for (const [name, content] of peerFeaturedCsvByName) {
        fileManager.addFile({
          id: `bulk-peer-featured-csv-${name}`,
          rowIndex: 0,
          fileName: name,
          content,
          mimeType: 'text/csv;charset=utf-8',
          status: 'completed',
          timestamp: runFileTimestamp,
          rowData: { keyword: 'peer featured library', title: 'Peer featured library' },
        });
      }
      if (peerFeaturedImageReportHasContent(peerFeaturedReport)) {
        fileManager.addFile({
          id: 'bulk-peer-featured-report',
          rowIndex: 0,
          fileName: PEER_FEATURED_IMAGE_REPORT_FILENAME,
          content: formatPeerFeaturedImageReportMarkdown(peerFeaturedReport),
          mimeType: 'text/markdown',
          status: 'completed',
          timestamp: runFileTimestamp,
          rowData: { keyword: 'featured image sources', title: 'Featured image sources' },
        });
      }
      clearGoogleMapsImageSessionCache();
      if (postingForLoop?.enabled) {
        const siteIds: string[] = postingForLoop.sites?.map((s) => s.site.id).filter(Boolean) ?? [];
        if (siteIds.length === 0 && postingForLoop.site?.id) siteIds.push(postingForLoop.site.id);
        if (siteIds.length > 0) clearBulkUploadValidationCache(siteIds);
      }
      setIsProcessing(false);
      setCurrentRow(0);
      abortControllerRef.current = null;
      processingInFlightRef.current = false;
    }
}
