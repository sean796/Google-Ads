import type { WordPressSite } from "@/components/integrations/types";
import { getStoredSites } from "@/components/integrations/storage";
import { loadDataForSEOApiKey } from "@/lib/api";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import type { LoadBulkSitemapInventoryResult } from "@/lib/bulk/bulk-sitemap-inventory-session";
import {
  getBulkGenerationWpInventoryIfReady,
  loadBlogPlayLinkablesForSite,
  inventoryRowsToWordPressPagesForOffer,
  type BulkGenerationLinkable,
} from "@/lib/bulk/bulk-generation-wp-inventory";
import {
  addKeywordResearchSnapshotToBulkFiles,
  buildSitesToPostFromPosting,
  generateBlueprintAndContent,
  generateRowOutputs,
  prefetchBulkWordPressLinkValidationForRun,
  type BulkHarnessSectionPayload,
  type BulkProcessingOptions,
  type WordPressPostingOptions,
} from "@/lib/bulk-auto-generate";
import { buildBlogImportKeywordResearchStub } from "@/lib/bulk/blog-import-parse";
import type { IntelligentKeywordResearchMergeResult } from "@/lib/bulk/intelligent-keyword-research-merge";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { BulkFileManager } from "@/lib/bulk-file-manager";
import { loadKnowledgeBaseForBulkIdeas } from "@/lib/kb-for-bulk-ideas";
import { buildPortfolioBlockedHosts } from "@/lib/portfolio-link-blocklist";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { PostCreatorUploadedPost } from "@/lib/post-creator/post-creator-agent-harness";
import type { KeywordAnalysisComplete, KeywordAnalysisOptions } from "@/lib/keyword-types";
import type { ResolvedPostCreatorSchedule } from "@/lib/post-creator/post-creator-schedule";
import { extractChecklistItemTitle } from "@/lib/post-creator/post-creator-checklist-post-process";
import { clearGoogleMapsImageSessionCache } from "@/lib/content-generation/google-maps-image-api";
import {
  countSapMapsRowsByEntity,
  createSapMapsMediaBank,
} from "@/lib/bulk/sap-maps-media-bank";

export type PostCreatorBulkProgress = {
  rowIndex: number;
  totalRows: number;
  message: string;
  intraRowPhase: IntraRowPhase;
  progress?: number;
  uploadedPosts?: PostCreatorUploadedPost[];
  harnessSectionIndex?: number;
};

type PostCreatorBulkOptions = BulkProcessingOptions & {
  postCreatorPhase: { current: IntraRowPhase };
  harnessSectionIndex?: number;
};

export type PostCreatorBulkRunResult = {
  created: number;
  failed: number;
  urls: string[];
  scheduledDates: string[];
  uploadedPosts: PostCreatorUploadedPost[];
};

async function stubAnalyzeKeyword(
  _keyword: string,
  _options: KeywordAnalysisOptions,
): Promise<KeywordAnalysisComplete | null> {
  return null;
}

type IntraRowPhase = "keyword" | "checklist" | "blueprint" | "content" | "upload" | "done";

export type PostCreatorIntraRowPhase = IntraRowPhase;

const INTRA_ROW_PHASE_ORDER: IntraRowPhase[] = ["keyword", "checklist", "blueprint", "content", "upload", "done"];

function phaseIndex(phase: IntraRowPhase): number {
  return INTRA_ROW_PHASE_ORDER.indexOf(phase);
}

function normalizePeerSiteUrl(url: string): string {
  return url.replace(/\/+$/, "").toLowerCase();
}

function shouldSkipPhase(resumePhase: IntraRowPhase | undefined, target: IntraRowPhase): boolean {
  if (!resumePhase) return false;
  return phaseIndex(resumePhase) > phaseIndex(target);
}

function reportPostPhaseProgress(
  options: BulkProcessingOptions,
  rowIndex: number,
  totalRows: number,
  phase: IntraRowPhase,
): void {
  const ext = options as PostCreatorBulkOptions;
  ext.postCreatorPhase.current = phase;
  ext.harnessSectionIndex = undefined;
  const labels: Record<IntraRowPhase, string> = {
    keyword: "keyword research",
    checklist: "checklist",
    blueprint: "blueprint",
    content: "content",
    upload: "WordPress upload",
    done: "complete",
  };
  options.onProgress?.(
    rowIndex,
    totalRows,
    `Post ${rowIndex + 1}/${totalRows}: ${labels[phase]}`,
  );
}

/** Keyword merge outputs passed into blueprint generation (hoisted out of block scope). */
export function postCreatorBlueprintMergeFields(
  mergeResult?: {
    merge: IntelligentKeywordResearchMergeResult;
    primaryExternalCitationUrl: string | null;
  } | null,
): {
  primaryExternalCitationUrl: string | null;
  intelligentMerge: IntelligentKeywordResearchMergeResult | null;
} {
  return {
    primaryExternalCitationUrl: mergeResult?.primaryExternalCitationUrl ?? null,
    intelligentMerge: mergeResult?.merge ?? null,
  };
}

async function processPostCreatorRow(
  rowIndex: number,
  totalRows: number,
  row: CSVRow,
  options: BulkProcessingOptions,
  fileManager: BulkFileManager,
  connectedSite: { name: string; siteUrl: string },
  wordPressPosts: BulkGenerationLinkable[],
  resumeFromPhase?: IntraRowPhase,
  onArtifact?: (input: {
    stepKey: string;
    stepLabel: string;
    name: string;
    mime: string;
    content: string;
    resumePayload?: Record<string, unknown>;
  }) => Promise<void>,
): Promise<void> {
  const openRouterApiKey = options.openRouterApiKey || (await resolveOpenRouterApiKeyForHarness());
  const selectedModel = options.selectedModel || getResearchModel();

  if (shouldSkipPhase(resumeFromPhase, "upload")) {
    return;
  }

  let keywordResearchFromRow: Awaited<ReturnType<typeof generateRowOutputs>>["research"] | null = null;
  if (!shouldSkipPhase(resumeFromPhase, "keyword")) {
    reportPostPhaseProgress(options, rowIndex, totalRows, "keyword");
    const { files: initialFiles, research } = await generateRowOutputs(
      rowIndex,
      row,
      options,
      fileManager,
      stubAnalyzeKeyword,
    );
    void initialFiles;
    keywordResearchFromRow = research;
  }

  const stub = buildBlogImportKeywordResearchStub(row);
  const finalKeywordData = keywordResearchFromRow?.result?.keywordData ?? stub.keywordData;
  const finalAiAnalysis = keywordResearchFromRow?.aiAnalysis ?? stub.aiAnalysis;

  if (!shouldSkipPhase(resumeFromPhase, "keyword")) {
    const volumeDataForSnapshot = keywordResearchFromRow?.keywordsVolumeData ?? [];
    addKeywordResearchSnapshotToBulkFiles(rowIndex, row, fileManager, options, Date.now(), {
      keywordData: finalKeywordData,
      aiAnalysis: finalAiAnalysis,
      keywordsVolumeData: volumeDataForSnapshot,
      paaRawResponse: keywordResearchFromRow?.paaRawResponse ?? null,
      primaryKeyword: row.keyword?.trim() || stub.primaryKeyword,
      semrush: null,
      intelligentMerge: null,
      primaryExternalCitationUrl: null,
    });
    const keywordJson = fileManager
      .getAllFiles()
      .find((f) => f.rowIndex === rowIndex && f.fileName.includes("keyword"));
    if (keywordJson && onArtifact) {
      await onArtifact({
        stepKey: `post.${rowIndex}.keyword`,
        stepLabel: "Keyword research ready",
        name: keywordJson.fileName,
        mime: "application/json",
        content: keywordJson.content,
        resumePayload: { phase: "bulk", rowIndex, intraRowPhase: "checklist" },
      });
    }
  }

  if (shouldSkipPhase(resumeFromPhase, "content")) {
    return;
  }

  reportPostPhaseProgress(options, rowIndex, totalRows, "blueprint");

  const volumeDataForBlueprint = keywordResearchFromRow?.keywordsVolumeData ?? [];

  const { activeKnowledgeBaseText } = loadKnowledgeBaseForBulkIdeas();
  const knowledgeFiles: Array<{ name: string; content: string }> = [];

  const optionsWithHarness: BulkProcessingOptions = {
    ...options,
    onHarnessSection: (payload: BulkHarnessSectionPayload) => {
      options.onHarnessSection?.(payload);
      if (payload.phase === "start") {
        const ext = options as PostCreatorBulkOptions;
        ext.postCreatorPhase.current = "content";
        ext.harnessSectionIndex = payload.sectionIndex;
        options.onProgress?.(
          rowIndex,
          totalRows,
          `Harness ${payload.sectionIndex + 1}/${payload.totalSections}: ${extractChecklistItemTitle(payload.title)}…`,
        );
        ext.harnessSectionIndex = undefined;
      }
    },
  };

  await generateBlueprintAndContent(
    rowIndex,
    row,
    finalKeywordData,
    finalAiAnalysis,
    volumeDataForBlueprint,
    keywordResearchFromRow?.paaRawResponse ?? null,
    optionsWithHarness,
    fileManager,
    knowledgeFiles,
    activeKnowledgeBaseText,
    connectedSite,
    wordPressPosts,
    null,
  );
}

function parseWordPressArtifact(content: string): PostCreatorUploadedPost | null {
  try {
    const parsed = JSON.parse(content) as {
      link?: string;
      post_url?: string;
      postId?: number;
      title?: string;
      scheduledDate?: string;
      date_gmt?: string;
      scheduled_date_gmt?: string;
    };
    const url = parsed.link?.trim() || parsed.post_url?.trim();
    if (!url) return null;
    return {
      url,
      postId: typeof parsed.postId === "number" ? parsed.postId : undefined,
      title: parsed.title?.trim() || undefined,
      scheduledFor:
        parsed.scheduledDate?.trim() ||
        parsed.date_gmt?.trim() ||
        parsed.scheduled_date_gmt?.trim() ||
        undefined,
    };
  } catch {
    return null;
  }
}

export async function runPostCreatorBulkRows(args: {
  site: WordPressSite;
  rows: CSVRow[];
  wordPressPosting: WordPressPostingOptions | undefined;
  schedule: ResolvedPostCreatorSchedule;
  inventoryContext?: LoadBulkSitemapInventoryResult;
  startRowIndex?: number;
  priorUploadedPosts?: PostCreatorUploadedPost[];
  resumeIntraRowPhase?: string;
  clearMapsCache?: boolean;
  onProgress?: (p: PostCreatorBulkProgress) => void;
  onFilesChanged?: (files: import("@/lib/bulk-file-manager").BulkGeneratedFile[]) => void;
  onHarnessSection?: (payload: BulkHarnessSectionPayload) => void;
  isCancelled?: () => Promise<boolean>;
  workflowSerpResearch?: BulkProcessingOptions["workflowSerpResearch"];
  workflowDfsArticleAudit?: BulkProcessingOptions["workflowDfsArticleAudit"];
  onArtifact?: (input: {
    stepKey: string;
    stepLabel: string;
    name: string;
    mime: string;
    content: string;
    resumePayload?: Record<string, unknown>;
  }) => Promise<void>;
}): Promise<PostCreatorBulkRunResult> {
  const {
    site,
    rows,
    wordPressPosting,
    schedule,
    inventoryContext,
    startRowIndex = 0,
    priorUploadedPosts = [],
    resumeIntraRowPhase,
    clearMapsCache = true,
    onProgress,
    onFilesChanged,
    onHarnessSection,
    isCancelled,
    workflowSerpResearch,
    workflowDfsArticleAudit,
    onArtifact,
  } = args;
  const featuredImageType = schedule.featuredImage ? "ai-generated" : "google-maps";
  if (clearMapsCache) {
    clearGoogleMapsImageSessionCache();
  }
  const dataForSeoKey = loadDataForSEOApiKey()?.trim() || "";
  const openRouterKey = await resolveOpenRouterApiKeyForHarness();
  if (!dataForSeoKey) throw new Error("Add a DataForSEO API key in Settings.");

  const fileManager = new BulkFileManager();
  fileManager.setOnMutation(() => {
    onFilesChanged?.(fileManager.getAllFiles());
  });
  const connectedSite = { name: site.name, siteUrl: site.siteUrl };

  const wpInventoryRows = getBulkGenerationWpInventoryIfReady(site.id);
  const wordPressPosts = await loadBlogPlayLinkablesForSite(site, wpInventoryRows ?? []);
  const wordPressPagesForOfferTable = wpInventoryRows?.length
    ? inventoryRowsToWordPressPagesForOffer(wpInventoryRows)
    : [];

  const storedSites = getStoredSites();
  const portfolioBlockedHosts = buildPortfolioBlockedHosts(storedSites, {
    excludeSiteId: site.id,
    excludeSiteUrl: site.siteUrl,
  });

  let linkPrefetchPromise: Promise<void> | undefined;
  const sitesToPost = buildSitesToPostFromPosting(wordPressPosting);
  if (wordPressPosting?.enabled && sitesToPost.length > 0) {
    linkPrefetchPromise = prefetchBulkWordPressLinkValidationForRun(sitesToPost);
  }

  const sapMapsMediaBank = createSapMapsMediaBank();
  const sapMapsEntityRowCounts = countSapMapsRowsByEntity(rows);

  const peerExcludedIds = new Set<string>();
  const peerExcludedUrls = new Set<string>();
  for (const entry of sitesToPost) {
    if (entry.site?.id) peerExcludedIds.add(entry.site.id);
    const url = entry.site?.siteUrl?.trim();
    if (url) peerExcludedUrls.add(normalizePeerSiteUrl(url));
  }
  if (site.id) peerExcludedIds.add(site.id);
  if (site.siteUrl) peerExcludedUrls.add(normalizePeerSiteUrl(site.siteUrl));
  const peerSitesForRun = storedSites.filter(
    (s) => !peerExcludedIds.has(s.id) && !peerExcludedUrls.has(normalizePeerSiteUrl(s.siteUrl)),
  );

  const postCreatorPhase = { current: "keyword" as IntraRowPhase };
  const bulkOptions: PostCreatorBulkOptions = {
    apiKey: dataForSeoKey,
    openRouterApiKey: openRouterKey,
    selectedModel: getResearchModel(site.id),
    featuredImageType,
    wordPressPosting,
    linkPrefetchPromise,
    reservedUploadSlugsBySite: new Map(),
    portfolioBlockedHosts: portfolioBlockedHosts.length > 0 ? portfolioBlockedHosts : undefined,
    sapMapsMediaBank,
    sapMapsEntityRowCounts,
    peerSites: peerSitesForRun.length > 0 ? peerSitesForRun : undefined,
    wordPressPagesForOfferTable:
      wordPressPagesForOfferTable.length > 0 ? wordPressPagesForOfferTable : undefined,
    workflowSerpResearch,
    workflowDfsArticleAudit,
    skipWikipediaLookup: true,
    sequentialHarnessSections: true,
    postCreatorPhase,
    onProgress: (rowIndex, _total, status) => {
      if (!status?.trim()) return;
      onProgress?.({
        rowIndex,
        totalRows: rows.length,
        message: status,
        progress: rows.length > 0 ? (rowIndex + 0.5) / rows.length : undefined,
        intraRowPhase: postCreatorPhase.current,
        harnessSectionIndex: bulkOptions.harnessSectionIndex,
        uploadedPosts,
      });
    },
    onError: (rowIndex, error) => {
      onProgress?.({
        rowIndex,
        totalRows: rows.length,
        message: error.message,
        intraRowPhase: postCreatorPhase.current,
        uploadedPosts,
      });
    },
    onHarnessSection: (payload) => {
      onHarnessSection?.(payload);
    },
  };

  let created = priorUploadedPosts.length;
  const urls: string[] = priorUploadedPosts.map((p) => p.url);
  const scheduledDates: string[] = priorUploadedPosts
    .map((p) => p.scheduledFor)
    .filter((d): d is string => Boolean(d));
  const uploadedPosts: PostCreatorUploadedPost[] = [...priorUploadedPosts];

  for (let i = startRowIndex; i < rows.length; i++) {
    if (await isCancelled?.()) throw new Error("Cancelled");
    const rowResumePhase =
      i === startRowIndex && resumeIntraRowPhase
        ? (resumeIntraRowPhase as IntraRowPhase)
        : undefined;
    if (i === startRowIndex && resumeIntraRowPhase && !INTRA_ROW_PHASE_ORDER.includes(rowResumePhase!)) {
      throw new Error(`Invalid resume intraRowPhase: ${resumeIntraRowPhase}`);
    }
    if (rowResumePhase) {
      postCreatorPhase.current = rowResumePhase;
      onProgress?.({
        rowIndex: i,
        totalRows: rows.length,
        message: `Post ${i + 1}/${rows.length}: resuming`,
        progress: i / rows.length,
        uploadedPosts,
        intraRowPhase: rowResumePhase,
      });
    }
    try {
      await processPostCreatorRow(
        i,
        rows.length,
        rows[i]!,
        bulkOptions,
        fileManager,
        connectedSite,
        wordPressPosts,
        rowResumePhase,
        onArtifact,
      );
      created += 1;
      const rowFiles = fileManager.getAllFiles().filter((f) => f.rowIndex === i);
      const wpFile = rowFiles.find(
        (f) => f.fileName.includes("wordpress") || f.content.includes('"link"') || f.content.includes('"post_url"'),
      );
      if (wpFile?.content) {
        const parsed = parseWordPressArtifact(wpFile.content);
        if (parsed) {
          const alreadyUploaded = uploadedPosts.some(
            (p) => p.url === parsed.url || (parsed.postId && p.postId === parsed.postId),
          );
          if (!alreadyUploaded) {
            uploadedPosts.push(parsed);
            urls.push(parsed.url);
            if (parsed.scheduledFor) scheduledDates.push(parsed.scheduledFor);
          }
        }
      }
    } catch (err) {
      if (await isCancelled?.()) throw new Error("Cancelled");
      const message = err instanceof Error ? err.message : "Post failed";
      throw err instanceof Error ? err : new Error(`Post ${i + 1}/${rows.length}: ${message}`);
    }
    onFilesChanged?.(fileManager.getAllFiles());
  }

  return { created, failed: 0, urls, scheduledDates, uploadedPosts };
}
