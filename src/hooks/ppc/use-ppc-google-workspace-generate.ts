import type { Dispatch, SetStateAction } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import {
  clampPpcAdGroupCount,
  clampPpcAdsPerAdGroup,
  clampPpcCampaignCount,
  type PpcCampaignRow,
  type PpcGenerateConfig,
  type PpcWpPageContext,
  resolvePpcRowAdGroupKeywords,
  resolvePpcRowCampaignName,
  resolvePpcRowLandingPageUrl,
} from "@/lib/ppc/google-ads-types";
import { applyPpcGenerateResultToRow } from "@/lib/ppc/ppc-row-generate-patch";
import type { PpcGenerateProgressState } from "@/lib/ppc/google-ads-progress-types";
import { loadPpcGoogleWpContext, resolvePpcAllowedLandingPages } from "@/lib/ppc/google-ads-wp-context";
import { runPpcGoogleCampaignGenerate } from "@/lib/ppc/run-ppc-google-campaign-generate";
import { runPpcGoogleCampaignGenerateBatch } from "@/lib/ppc/run-ppc-google-campaign-generate-batch";
import { mergePpcGeneratedAdGroupIntoCampaign } from "@/lib/ppc/merge-ppc-generated-ad-group";
import {
  summarizePpcAdGroupForAvoidance,
  summarizePpcCampaignForAvoidance,
} from "@/lib/ppc/ppc-campaign-plan-avoidance";
import { runPpcGoogleAdGroupGenerate } from "@/lib/ppc/run-ppc-google-ad-group-generate";
import { runGoogleAdsCampaignPlan } from "@/lib/ppc/run-google-ads-campaign-plan";

type PpcGoogleWorkspaceGenerateDeps = {
  site: WordPressSite;
  apiKey: string;
  selectedModel: string;
  campaigns: PpcCampaignRow[];
  generateConfig: PpcGenerateConfig;
  isGenerating: boolean;
  isPublishing: boolean;
  wpPages: PpcWpPageContext[];
  setWpPages: Dispatch<SetStateAction<PpcWpPageContext[]>>;
  setCampaigns: Dispatch<SetStateAction<PpcCampaignRow[]>>;
  updateCampaign: (id: string, patch: Partial<PpcCampaignRow>) => void;
  reportError: (message: string) => void;
  setGenerateProgress: Dispatch<SetStateAction<PpcGenerateProgressState | null>>;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
  setGeneratingAdGroupKey: Dispatch<SetStateAction<string | null>>;
  abortRef: { current: AbortController | null };
};

export type PpcGenerateCampaignDeps = Pick<
  PpcGoogleWorkspaceGenerateDeps,
  | "site"
  | "apiKey"
  | "selectedModel"
  | "campaigns"
  | "generateConfig"
  | "isGenerating"
  | "isPublishing"
  | "wpPages"
  | "setCampaigns"
  | "updateCampaign"
  | "reportError"
  | "setGenerateProgress"
  | "setIsGenerating"
  | "abortRef"
>;

export type PpcGenerateCampaignRowDeps = Pick<
  PpcGoogleWorkspaceGenerateDeps,
  | "site"
  | "apiKey"
  | "selectedModel"
  | "campaigns"
  | "generateConfig"
  | "isGenerating"
  | "wpPages"
  | "updateCampaign"
  | "reportError"
  | "setGenerateProgress"
  | "setIsGenerating"
  | "abortRef"
>;

export type PpcGenerateAdGroupDeps = Pick<
  PpcGoogleWorkspaceGenerateDeps,
  | "site"
  | "apiKey"
  | "selectedModel"
  | "campaigns"
  | "generateConfig"
  | "isGenerating"
  | "isPublishing"
  | "wpPages"
  | "setWpPages"
  | "updateCampaign"
  | "reportError"
  | "setGenerateProgress"
  | "setIsGenerating"
  | "setGeneratingAdGroupKey"
  | "abortRef"
>;

export async function executePpcGenerateCampaign(
  deps: PpcGenerateCampaignDeps,
): Promise<void> {
  const { site, apiKey, selectedModel, campaigns, generateConfig, isGenerating, isPublishing, wpPages, setCampaigns, updateCampaign, reportError, setGenerateProgress, setIsGenerating, abortRef } = deps;
  if (isGenerating || isPublishing) return;
  if (!apiKey?.trim()) {
    reportError("OpenRouter API key is missing.");
    return;
  }

  abortRef.current?.abort();
  const controller = new AbortController();
  abortRef.current = controller;

  const config: PpcGenerateConfig = {
    campaignCount: clampPpcCampaignCount(generateConfig.campaignCount),
    adGroupCount: clampPpcAdGroupCount(generateConfig.adGroupCount),
    landingPageUrls: [],
    adsPerAdGroup: clampPpcAdsPerAdGroup(generateConfig.adsPerAdGroup),
  };

  const targetRows = campaigns.slice(0, config.campaignCount);
  const rowIds = targetRows.map((row) => row.id);

  setCampaigns((prev) =>
    prev.map((row) =>
      rowIds.includes(row.id)
        ? { ...row, status: "generating" as const, config, errorMessage: undefined }
        : row,
    ),
  );
  setIsGenerating(true);

  try {
    const jobs = targetRows.map((sourceRow) => {
      const rowLandingUrls = sourceRow?.landingPageUrl?.trim()
        ? [sourceRow.landingPageUrl.trim()]
        : [];
      return {
        rowId: sourceRow.id,
        config: {
          ...config,
          landingPageUrls: rowLandingUrls,
        } satisfies PpcGenerateConfig,
        adGroupKeywords: resolvePpcRowAdGroupKeywords(sourceRow, config.adGroupCount),
        focusKeyword: sourceRow.focusKeyword?.trim() || undefined,
        adsCampaignId: sourceRow.adsCampaignId,
      };
    });

    if (jobs.length === 1) {
      const job = jobs[0]!;
      const sourceRow = targetRows[0]!;
      const result = await runPpcGoogleCampaignGenerate({
        site,
        apiKey,
        model: selectedModel,
        config: job.config,
        adGroupKeywords: job.adGroupKeywords,
        focusKeyword: job.focusKeyword,
        adsCampaignId: job.adsCampaignId,
        prefetchedWpPages: wpPages.length ? wpPages : undefined,
        onProgress: setGenerateProgress,
        signal: controller.signal,
      });

      updateCampaign(job.rowId, {
        status: "ready",
        campaign: result.campaign,
        config: job.config,
        errorMessage: undefined,
        ...applyPpcGenerateResultToRow(
          sourceRow,
          result.campaign,
          result.recommendedDailyBudget,
          job.config.adGroupCount,
        ),
      });
    } else {
      const results = await runPpcGoogleCampaignGenerateBatch({
        site,
        apiKey,
        model: selectedModel,
        jobs,
        onProgress: setGenerateProgress,
        signal: controller.signal,
      });

      for (const outcome of results) {
        if (outcome.ok === true) {
          const sourceRow = targetRows.find((row) => row.id === outcome.rowId);
          updateCampaign(outcome.rowId, {
            status: "ready",
            campaign: outcome.campaign,
            config: outcome.config,
            errorMessage: undefined,
            ...(sourceRow
              ? applyPpcGenerateResultToRow(
                  sourceRow,
                  outcome.campaign,
                  outcome.recommendedDailyBudget,
                  outcome.config.adGroupCount,
                )
              : applyPpcGenerateResultToRow(
                  { id: outcome.rowId, campaignName: "", status: "ready", createdAt: "" },
                  outcome.campaign,
                  outcome.recommendedDailyBudget,
                  outcome.config.adGroupCount,
                )),
          });
        } else {
          reportError(outcome.errorMessage);
          updateCampaign(outcome.rowId, {
            status: "idle",
            config: outcome.config,
            errorMessage: undefined,
          });
        }
      }
    }
  } catch (err) {
    if (controller.signal.aborted) return;
    const message = err instanceof Error ? err.message : "Campaign generation failed";
    reportError(message);
    setCampaigns((prev) =>
      prev.map((row) =>
        rowIds.includes(row.id) && row.status === "generating"
          ? { ...row, status: "idle", errorMessage: undefined }
          : row,
      ),
    );
  } finally {
    setIsGenerating(false);
  }
}

export async function executePpcGenerateCampaignRow(
  deps: PpcGenerateCampaignRowDeps,
  rowId: string,
): Promise<void> {
  const { site, apiKey, selectedModel, campaigns, generateConfig, isGenerating, wpPages, updateCampaign, reportError, setGenerateProgress, setIsGenerating, abortRef } = deps;
  if (isGenerating || !apiKey?.trim()) return;

  const sourceRow = campaigns.find((row) => row.id === rowId);
  if (!sourceRow) return;

  abortRef.current?.abort();
  const controller = new AbortController();
  abortRef.current = controller;

  const rowConfig: PpcGenerateConfig = {
    campaignCount: 1,
    adGroupCount: clampPpcAdGroupCount(generateConfig.adGroupCount),
    landingPageUrls: sourceRow.landingPageUrl?.trim() ? [sourceRow.landingPageUrl.trim()] : [],
    adsPerAdGroup: clampPpcAdsPerAdGroup(generateConfig.adsPerAdGroup),
  };

  updateCampaign(rowId, {
    status: "generating",
    config: rowConfig,
    campaign: undefined,
    errorMessage: undefined,
  });
  setIsGenerating(true);

  const avoidCampaignPlans = campaigns
    .filter((row) => row.id !== rowId && row.campaign)
    .map((row) => summarizePpcCampaignForAvoidance(row.campaign!));

  try {
    const result = await runPpcGoogleCampaignGenerate({
      site,
      apiKey,
      model: selectedModel,
      config: rowConfig,
      adGroupKeywords: resolvePpcRowAdGroupKeywords(sourceRow, rowConfig.adGroupCount),
      focusKeyword: sourceRow.focusKeyword?.trim() || undefined,
      adsCampaignId: sourceRow.adsCampaignId,
      avoidCampaignPlans,
      prefetchedWpPages: wpPages.length ? wpPages : undefined,
      onProgress: setGenerateProgress,
      signal: controller.signal,
    });

    updateCampaign(rowId, {
      status: "ready",
      campaign: result.campaign,
      config: rowConfig,
      errorMessage: undefined,
      ...applyPpcGenerateResultToRow(
        sourceRow,
        result.campaign,
        result.recommendedDailyBudget,
        rowConfig.adGroupCount,
      ),
    });
  } catch (err) {
    if (controller.signal.aborted) return;
    const message = err instanceof Error ? err.message : "Campaign generation failed";
    reportError(message);
    updateCampaign(rowId, {
      status: "idle",
      config: rowConfig,
      errorMessage: undefined,
    });
  } finally {
    setIsGenerating(false);
  }
}

export async function executePpcGenerateAdGroup(
  deps: PpcGenerateAdGroupDeps,
  rowId: string,
  adGroupIndex: number,
): Promise<void> {
  const { site, apiKey, selectedModel, campaigns, generateConfig, isGenerating, isPublishing, wpPages, setWpPages, updateCampaign, reportError, setGenerateProgress, setIsGenerating, setGeneratingAdGroupKey, abortRef } = deps;
  if (isGenerating || isPublishing) return;
  if (!apiKey?.trim()) {
    reportError("OpenRouter API key is missing.");
    return;
  }

  const sourceRow = campaigns.find((row) => row.id === rowId);
  if (!sourceRow) return;

  abortRef.current?.abort();
  const controller = new AbortController();
  abortRef.current = controller;

  const adGroupCount = clampPpcAdGroupCount(generateConfig.adGroupCount);
  const adsPerAdGroup = clampPpcAdsPerAdGroup(generateConfig.adsPerAdGroup);
  const keywordSeeds = resolvePpcRowAdGroupKeywords(sourceRow, adGroupCount);
  const adGroupKey = `${rowId}:${adGroupIndex}`;

  setGeneratingAdGroupKey(adGroupKey);
  setIsGenerating(true);

  try {
    let pages = wpPages;
    if (!pages.length) {
      pages = await loadPpcGoogleWpContext(site);
      setWpPages(pages);
    }

    const rowLandingUrls = sourceRow.landingPageUrl?.trim() ? [sourceRow.landingPageUrl.trim()] : [];
    const allowedLandingPages = resolvePpcAllowedLandingPages(pages, rowLandingUrls);
    const campaignName = resolvePpcRowCampaignName(sourceRow);
    const defaultLandingPageUrl = resolvePpcRowLandingPageUrl(sourceRow);
    const existingAdGroup = sourceRow.campaign?.adGroups[adGroupIndex];

    let planGroup;
    if (existingAdGroup?.landingPageUrl?.trim()) {
      planGroup = {
        name: existingAdGroup.name,
        landingPageUrl: existingAdGroup.landingPageUrl,
        theme: existingAdGroup.name,
      };
    } else {
      const siblingAvoid = (sourceRow.campaign?.adGroups ?? [])
        .filter((adGroup, index) => index !== adGroupIndex && (adGroup.keywords.length > 0 || adGroup.ads.length > 0))
        .map(summarizePpcAdGroupForAvoidance);

      const plan = await runGoogleAdsCampaignPlan({
        apiKey,
        model: selectedModel,
        siteId: site.id,
        siteName: site.name,
        adGroupCount: 1,
        focusKeyword: keywordSeeds[adGroupIndex]?.trim() || sourceRow.focusKeyword?.trim() || undefined,
        adGroupKeywordSeeds: keywordSeeds[adGroupIndex]?.trim()
          ? [keywordSeeds[adGroupIndex]!.trim()]
          : [],
        landingPages: allowedLandingPages,
        gscPages: [],
        userSelectedLandingUrls: rowLandingUrls,
        avoidCampaignPlans: siblingAvoid,
        signal: controller.signal,
      });
      planGroup = plan.adGroups[0]!;
    }

    const generated = await runPpcGoogleAdGroupGenerate({
      site,
      apiKey,
      model: selectedModel,
      campaignName,
      adGroupIndex: adGroupIndex + 1,
      adsPerAdGroup,
      planGroup,
      adGroupKeywordSeed: keywordSeeds[adGroupIndex]?.trim() || undefined,
      prefetchedWpPages: pages,
      onProgress: setGenerateProgress,
      signal: controller.signal,
    });

    const mergedCampaign = mergePpcGeneratedAdGroupIntoCampaign({
      campaign: sourceRow.campaign,
      adGroupCount,
      adGroupIndex,
      generated,
      keywordSeeds,
      defaultLandingPageUrl,
      campaignName,
    });

    updateCampaign(rowId, {
      status: "ready",
      campaign: mergedCampaign,
      errorMessage: undefined,
      ...applyPpcGenerateResultToRow(
        sourceRow,
        mergedCampaign,
        undefined,
        adGroupCount,
      ),
    });
  } catch (err) {
    if (controller.signal.aborted) return;
    const message = err instanceof Error ? err.message : "Ad group generation failed";
    reportError(message);
    updateCampaign(rowId, { errorMessage: undefined });
  } finally {
    setGeneratingAdGroupKey(null);
    setIsGenerating(false);
  }
}
