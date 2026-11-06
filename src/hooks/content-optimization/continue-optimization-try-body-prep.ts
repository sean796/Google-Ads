import type { WordPressSite } from "@/components/integrations/types";
import type { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { saveKeywordResearch } from "./optimization-helpers";
import { saveSerpResearchBrief } from "./optimization-helpers-b";
import { createSiteCache, seedSiteCacheFromLinkablePosts } from "@/lib/wordpress-site-cache";
import { buildMergedLinkPoolRows } from "@/lib/content-generation/extra-text-inventory-links";
import {
  ensureMergedPostsPagesLinkPool,
  getBulkOptimizerInventoryFromSession,
} from "./bulk-optimization-load-inventory-snapshot";
import { snapshotHasInventoryEntries } from "@/lib/wordpress-api/inventory-match";
import { updateKeywordResearchFile } from "./keyword-research-flow";
import { updateOptimizationProgress } from "./optimization-helpers";
import type { PendingOptimization } from "./use-optimization-state";
import { markContentPrepHarnessSection } from "@/lib/overview/overview-content-prep-harness-run";
import type { ContentPrepHarnessSetters } from "@/lib/overview/overview-content-prep-harness-run";
import {
  contentOptimizeHarnessSectionIndex,
  sanitizeHarnessArticleTitle,
} from "@/lib/overview/overview-content-optimize-pipeline";
import { resolveDfsArticleAuditBlockForUrl } from "@/lib/dfs-article-audit/resolve-dfs-article-audit-block";
import { resolveSiteLocationLabel } from "@/lib/llm-audit/resolve-site-location-label";
import {
  firstPartyAuthorityBlockFromBrief,
  buildConnectedSiteIdentityBlock,
  swotTextFromResearchFields,
} from "@/lib/content-optimization/first-party-authority-prompt";
import {
  llmAuditSummaryFromSeoResearchBrief,
  parseSeoResearchBrief,
  type PageGscResultLike,
} from "@/lib/content-optimization/seo-research-brief-for-optimize";

type OptimizeSelections = ReturnType<
  typeof import("@/lib/content-optimization/seo-research-brief-for-optimize").buildOptimizeSelectionsFromStoredBrief
>;

export function saveContinueOptimizationKeywordResearch(args: {
  fileManager: OptimizationFileManager;
  primaryKeyword: string;
  selectedKeyword: { query: string; clicks: number; impressions: number; ctr: number; position: number };
  keywordData: OptimizeSelections["keywordData"];
  aiAnalysis: OptimizeSelections["aiAnalysis"];
  relatedKeywords: OptimizeSelections["relatedKeywords"];
  finalKwList: OptimizeSelections["selectedKeywords"];
  finalH2: OptimizeSelections["selectedH2Sections"];
  finalPaa: OptimizeSelections["selectedPeopleAlsoAsk"];
  finalLinks: OptimizeSelections["selectedResearchLinks"];
  url: string;
  contentPrepHarnessSetters: ContentPrepHarnessSetters | null;
  flushGeneratedFiles: () => void;
  siteId: string;
  setOptimizationFileManagers: (prev: unknown) => unknown;
}): void {
  const {
    fileManager,
    primaryKeyword,
    selectedKeyword,
    keywordData,
    aiAnalysis,
    relatedKeywords,
    finalKwList,
    finalH2,
    finalPaa,
    finalLinks,
    url,
    contentPrepHarnessSetters,
    flushGeneratedFiles,
    siteId,
    setOptimizationFileManagers,
  } = args;
  saveKeywordResearch(fileManager, primaryKeyword, {
    primaryKeyword,
    gscMetrics: selectedKeyword,
    keywordData,
    aiAnalysis,
    peopleAlsoAsk: aiAnalysis.peopleAlsoAsk ?? [],
    relatedGSCKeywords: relatedKeywords,
    selectedKeywords: finalKwList,
    selectedH2Sections: finalH2,
    selectedPeopleAlsoAsk: finalPaa,
    selectedResearchLinks: finalLinks,
  });

  if (contentPrepHarnessSetters) {
    markContentPrepHarnessSection(
      url,
      contentOptimizeHarnessSectionIndex("Keyword research"),
      "done",
      contentPrepHarnessSetters,
    );
    flushGeneratedFiles();
  }

  updateKeywordResearchFile(
    fileManager,
    siteId,
    finalKwList,
    finalH2,
    finalPaa,
    finalLinks,
    setOptimizationFileManagers,
  );
}

export async function loadContinueOptimizationWordPressPosts(args: {
  site: WordPressSite;
  pending: PendingOptimization;
  setOptimizationProgress: (prev: unknown) => unknown;
  siteId: string;
}): Promise<{
  wordPressPosts: Array<{
    id: number;
    slug: string;
    title: string;
    excerpt: string;
    link: string;
    date_gmt: string;
    postType?: "post" | "page" | "service-area";
  }>;
  wordPressPagesForOfferTable: PendingOptimization["wordPressPagesForOfferTable"];
}> {
  const { site, pending, setOptimizationProgress, siteId } = args;
  let wordPressPosts: Array<{
    id: number;
    slug: string;
    title: string;
    excerpt: string;
    link: string;
    date_gmt: string;
    postType?: "post" | "page" | "service-area";
  }> = [];
  const wordPressPagesForOfferTable = pending.wordPressPagesForOfferTable ?? [];

  if (site.username && site.appPassword) {
    const merged = await ensureMergedPostsPagesLinkPool(
      site,
      (msg) => {
        updateOptimizationProgress(setOptimizationProgress, siteId, "plan", 0.5, msg);
      },
      { warmCacheOnly: true },
    );
    wordPressPosts = buildMergedLinkPoolRows(merged, site.siteUrl);
    if (wordPressPosts.length > 0) seedSiteCacheFromLinkablePosts(site, wordPressPosts);
  } else if (pending.wordPressPosts?.length) {
    wordPressPosts = pending.wordPressPosts;
  } else {
    const inv = getBulkOptimizerInventoryFromSession(site);
    if (inv && snapshotHasInventoryEntries(inv)) {
      wordPressPosts = buildMergedLinkPoolRows(inv, site.siteUrl);
      if (wordPressPosts.length > 0) seedSiteCacheFromLinkablePosts(site, wordPressPosts);
    } else {
      updateOptimizationProgress(setOptimizationProgress, siteId, "plan", 0.5, "Loading link pool…");
      const cache = await createSiteCache(site, undefined, (msg) => {
        updateOptimizationProgress(setOptimizationProgress, siteId, "plan", 0.55, msg);
      });
      wordPressPosts = cache.posts;
    }
  }

  return { wordPressPosts, wordPressPagesForOfferTable };
}

export async function buildContinueOptimizationBlueprintPrep(args: {
  finalOptimizationOptions: Record<string, unknown>;
  url: string;
  pendingCleanedTitle: string | undefined;
  finalTitle: string;
  existingTitle: string;
  primaryKeyword: string;
  site: WordPressSite;
  parsedBriefFromAcf: ReturnType<typeof parseSeoResearchBrief>;
  workingAcfContext: { promptModifier?: unknown };
  acfFields: Record<string, unknown>;
  seoResearchRaw: string;
  fileManager: OptimizationFileManager;
  contentPrepHarnessSetters: ContentPrepHarnessSetters | null;
  flushGeneratedFiles: () => void;
}): Promise<{
  dfsArticleAuditBlock: string;
  titleForBlueprint: string;
  firstPartyAuthorityBlock: string;
  llmAuditSummary: string | undefined;
}> {
  const {
    finalOptimizationOptions,
    url,
    pendingCleanedTitle,
    finalTitle,
    existingTitle,
    primaryKeyword,
    site,
    parsedBriefFromAcf,
    workingAcfContext,
    acfFields,
    seoResearchRaw,
    fileManager,
    contentPrepHarnessSetters,
    flushGeneratedFiles,
  } = args;
  const dfsArticleAuditBlock =
    String(finalOptimizationOptions?.dfsArticleAuditBlock ?? "").trim()
    || (await resolveDfsArticleAuditBlockForUrl({
      articleUrl: url,
      workflowOutputs: (
        finalOptimizationOptions as {
          workflowAuditOutputs?: import("@/lib/workflow/workflow-types").WorkflowStepOutput[];
        }
      )?.workflowAuditOutputs,
      workflowContextBlock: String(finalOptimizationOptions?.workflowContextBlock ?? ""),
    }));

  const titleForBlueprint = sanitizeHarnessArticleTitle(
    pendingCleanedTitle || finalTitle || existingTitle,
    { pageUrl: url, keyword: primaryKeyword },
  );
  if (!site.name?.trim()) {
    throw new Error("Connected site name is required for content optimization.");
  }

  const parsedBrief = parsedBriefFromAcf;

  const swotText = swotTextFromResearchFields({
    promptModifier: String(
      workingAcfContext.promptModifier
      ?? (acfFields as { prompt_modifier?: string } | undefined)?.prompt_modifier
      ?? "",
    ),
    seoResearch: seoResearchRaw,
  });
  const serviceArea = resolveSiteLocationLabel(site, primaryKeyword);
  const firstPartyAuthorityBlock = [
    firstPartyAuthorityBlockFromBrief(parsedBrief, swotText),
    buildConnectedSiteIdentityBlock(site.name.trim(), serviceArea),
  ]
    .filter(Boolean)
    .join("\n\n");
  saveSerpResearchBrief(fileManager, primaryKeyword, seoResearchRaw);
  if (contentPrepHarnessSetters) {
    markContentPrepHarnessSection(
      url,
      contentOptimizeHarnessSectionIndex("SERP research brief"),
      "done",
      contentPrepHarnessSetters,
    );
    flushGeneratedFiles();
  }
  const llmAuditSummary = llmAuditSummaryFromSeoResearchBrief(seoResearchRaw);

  return {
    dfsArticleAuditBlock,
    titleForBlueprint,
    firstPartyAuthorityBlock,
    llmAuditSummary,
  };
}
