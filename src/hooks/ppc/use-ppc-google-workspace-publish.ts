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
} from "@/lib/ppc/google-ads-types";
import { applyPpcGenerateResultToRow } from "@/lib/ppc/ppc-row-generate-patch";
import {
  createPpcPublishValidationProgress,
  type PpcGenerateProgressState,
} from "@/lib/ppc/google-ads-progress-types";
import { normalizeGoogleAdsCustomerId } from "@/lib/ads-reporting/ads-reporting-metrics";
import { publishPpcGoogleCampaigns } from "@/lib/ppc/publish-google-ads-campaigns";
import { runPpcGoogleCampaignGenerate } from "@/lib/ppc/run-ppc-google-campaign-generate";
import { summarizePpcCampaignForAvoidance } from "@/lib/ppc/ppc-campaign-plan-avoidance";
import { syncPpcCampaignRowsToCount } from "@/lib/ppc/sync-ppc-campaign-rows";
import {
  loadGoogleAdsSearchCampaignImports,
  mergeGoogleAdsImportsIntoPpcRows,
  ppcCampaignCountAfterImport,
} from "@/lib/ppc/import-google-ads-search-campaigns";

export type PpcGoogleWorkspacePullDeps = {
  campaigns: PpcCampaignRow[];
  generateConfigAdGroupCount: number;
  generateConfigCampaignCount: number;
  isGenerating: boolean;
  isImportingFromAds: boolean;
  isPublishing: boolean;
  reportError: (message: string) => void;
  siteGoogleAdsCustomerId: string | undefined;
  setIsImportingFromAds: Dispatch<SetStateAction<boolean>>;
  setGenerateConfig: Dispatch<SetStateAction<PpcGenerateConfig>>;
  setCampaigns: Dispatch<SetStateAction<PpcCampaignRow[]>>;
  setGridPageIndex: Dispatch<SetStateAction<number>>;
};

export type PpcGoogleWorkspacePublishDeps = {
  site: WordPressSite;
  apiKey: string;
  selectedModel: string;
  campaigns: PpcCampaignRow[];
  generateConfigAdGroupCount: number;
  generateConfigAdsPerAdGroup: number;
  isGenerating: boolean;
  isPublishing: boolean;
  wpPages: PpcWpPageContext[];
  updateCampaign: (id: string, patch: Partial<PpcCampaignRow>) => void;
  reportError: (message: string) => void;
  setGenerateProgress: Dispatch<SetStateAction<PpcGenerateProgressState | null>>;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
  setIsPublishing: Dispatch<SetStateAction<boolean>>;
  setCampaigns: Dispatch<SetStateAction<PpcCampaignRow[]>>;
};

export async function executePpcPullFromGoogleAds(
  deps: PpcGoogleWorkspacePullDeps,
): Promise<void> {
  const { campaigns, isGenerating, isImportingFromAds, isPublishing, reportError, setIsImportingFromAds, setGenerateConfig, setCampaigns, setGridPageIndex } = deps;
  const generateConfig = {
    adGroupCount: deps.generateConfigAdGroupCount,
    campaignCount: deps.generateConfigCampaignCount,
  };
  const site = { googleAdsCustomerId: deps.siteGoogleAdsCustomerId };
  if (isGenerating || isPublishing || isImportingFromAds) return;

  const customerId = normalizeGoogleAdsCustomerId(site.googleAdsCustomerId ?? "");
  if (customerId.length !== 10) {
    reportError("Set a 10-digit Google Ads customer ID on this property before pulling campaigns.");
    return;
  }

  setIsImportingFromAds(true);
  try {
    const imported = await loadGoogleAdsSearchCampaignImports(customerId);
    if (imported.length === 0) {
      reportError("No Search campaigns found in this Google Ads account.");
      return;
    }

    const { rows, importedCount, updatedCount } = mergeGoogleAdsImportsIntoPpcRows(campaigns, imported);
    const adGroupCount = clampPpcAdGroupCount(generateConfig.adGroupCount);
    const nextCount = ppcCampaignCountAfterImport(rows, generateConfig.campaignCount);
    const synced = syncPpcCampaignRowsToCount(rows, nextCount, adGroupCount);

    setGenerateConfig((prev) => ({ ...prev, campaignCount: nextCount }));
    setCampaigns(synced);
    setGridPageIndex(0);

    if (importedCount === 0 && updatedCount === 0) {
      reportError("No campaigns were merged. Check that imported campaigns include ad groups.");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to pull campaigns from Google Ads.";
    reportError(message);
  } finally {
    setIsImportingFromAds(false);
  }
}

export async function executePpcPublishCampaigns(
  deps: PpcGoogleWorkspacePublishDeps,
): Promise<void> {
  const { site, apiKey, selectedModel, campaigns, isGenerating, isPublishing, wpPages, updateCampaign, reportError, setGenerateProgress, setIsGenerating, setIsPublishing, setCampaigns } = deps;
  const generateConfig = {
    adGroupCount: deps.generateConfigAdGroupCount,
    adsPerAdGroup: deps.generateConfigAdsPerAdGroup,
  };
  if (isGenerating || isPublishing) return;

  const unpublished = campaigns.filter((row) => !row.adsCampaignId?.trim());
  const publishedReady = campaigns.filter(
    (row) => row.adsCampaignId?.trim() && row.status === "ready" && row.campaign,
  );
  if (!unpublished.length && !publishedReady.length) {
    reportError("Run Generate on at least one campaign before publishing to Google Ads.");
    return;
  }

  const needsGenerate = unpublished.filter((row) => row.status !== "ready" || !row.campaign);
  if (needsGenerate.length && !apiKey?.trim()) {
    reportError("OpenRouter API key is missing.");
    return;
  }

  setIsPublishing(true);
  let rowsForPublish = campaigns;

  try {
    if (needsGenerate.length) {
      setIsGenerating(true);
      for (const sourceRow of needsGenerate) {
        const rowConfig: PpcGenerateConfig = {
          campaignCount: 1,
          adGroupCount: clampPpcAdGroupCount(generateConfig.adGroupCount),
          landingPageUrls: sourceRow.landingPageUrl?.trim() ? [sourceRow.landingPageUrl.trim()] : [],
          adsPerAdGroup: clampPpcAdsPerAdGroup(generateConfig.adsPerAdGroup),
        };
        const avoidCampaignPlans = rowsForPublish
          .filter((row) => row.id !== sourceRow.id && row.campaign)
          .map((row) => summarizePpcCampaignForAvoidance(row.campaign!));

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
        });

        const patch: Partial<PpcCampaignRow> = {
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
        };
        rowsForPublish = rowsForPublish.map((row) =>
          row.id === sourceRow.id ? { ...row, ...patch } : row,
        );
        setCampaigns(rowsForPublish);
      }
      setIsGenerating(false);
    }

    await publishPpcGoogleCampaigns({
      customerId: site.googleAdsCustomerId,
      rows: rowsForPublish,
      onProgress: setGenerateProgress,
      onRowPublished: (rowId, campaignId) => {
        updateCampaign(rowId, {
          adsCampaignId: campaignId,
          googleAdsCampaignStatus: "ENABLED",
          errorMessage: undefined,
        });
      },
      onRowError: (_rowId, message) => {
        reportError(message);
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google Ads publish failed.";
    reportError(message);
    setGenerateProgress(createPpcPublishValidationProgress(message));
  } finally {
    setIsGenerating(false);
    setIsPublishing(false);
  }
}
