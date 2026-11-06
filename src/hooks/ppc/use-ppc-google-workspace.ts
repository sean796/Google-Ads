import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import { useManagerErrorLog } from "@/contexts/manager-error-log-context";
import { overviewGridPageSlice } from "@/components/overview/overview-grid-pagination-helpers";
import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
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
import { applyPpcGenerateResultToRow, ensurePpcRowDailyBudget } from "@/lib/ppc/ppc-row-generate-patch";
import {
  createPpcPublishValidationProgress,
  type PpcGenerateProgressState,
} from "@/lib/ppc/google-ads-progress-types";
import { normalizeGoogleAdsCustomerId } from "@/lib/ads-reporting/ads-reporting-metrics";

import { publishPpcGoogleCampaigns } from "@/lib/ppc/publish-google-ads-campaigns";
import {
  getPpcGoogleCampaignsSessionCache,
  setPpcGoogleCampaignsSessionCache,
  clearPpcGoogleCampaignsSessionCache,
} from "@/lib/ppc/google-ads-session-cache";
import { loadPpcGoogleWpContext, resolvePpcAllowedLandingPages } from "@/lib/ppc/google-ads-wp-context";
import {
  createPpcPageBucketHostedLink,
  revokePpcPageBucketHostedLink,
  type PpcPageBucketHostedLink,
} from "@/lib/ppc/ppc-page-bucket-inventory";
import {
  ppcGoogleGridRowCount,
  PPC_GOOGLE_PLACEHOLDER_ROW_COUNT,
} from "@/components/ppc/google/google-ads-row-constants";
import { runPpcGoogleCampaignGenerate } from "@/lib/ppc/run-ppc-google-campaign-generate";
import { runPpcGoogleCampaignGenerateBatch } from "@/lib/ppc/run-ppc-google-campaign-generate-batch";
import { mergePpcGeneratedAdGroupIntoCampaign } from "@/lib/ppc/merge-ppc-generated-ad-group";
import {
  summarizePpcAdGroupForAvoidance,
  summarizePpcCampaignForAvoidance,
} from "@/lib/ppc/ppc-campaign-plan-avoidance";
import { runPpcGoogleAdGroupGenerate } from "@/lib/ppc/run-ppc-google-ad-group-generate";
import { runGoogleAdsCampaignPlan } from "@/lib/ppc/run-google-ads-campaign-plan";
import { syncPpcCampaignRowsToCount } from "@/lib/ppc/sync-ppc-campaign-rows";
import {
  buildGoogleAdsEditorCsv,
  googleAdsExportFilename,
  triggerGoogleAdsCsvDownload,
} from "@/lib/ppc/export-google-ads-campaign-csv";
import {
  readPpcGenerateConfig,
  writePpcGenerateConfig,
} from "@/lib/ppc/google-ads-generate-config-storage";
import {
  loadGoogleAdsSearchCampaignImports,
  mergeGoogleAdsImportsIntoPpcRows,
  ppcCampaignCountAfterImport,
} from "@/lib/ppc/import-google-ads-search-campaigns";
import {
  PPC_GOOGLE_ADS_STATUS_FILTER_DEFAULT,
  ppcRowMatchesGoogleAdsStatusFilter,
  type PpcGoogleAdsCampaignStatusFilter,
} from "@/lib/ppc/ppc-google-ads-status-filter";

export type UsePpcGoogleWorkspaceOptions = {
  site: WordPressSite;
  apiKey: string;
  selectedModel: string;
};

export type PpcGoogleSortColumn = "title" | "date" | null;

function stripPpcCampaignRowErrors(rows: PpcCampaignRow[]): PpcCampaignRow[] {
  return rows.map((row) =>
    ensurePpcRowDailyBudget(
      row.errorMessage || row.status === "error"
        ? {
            ...row,
            errorMessage: undefined,
            status: row.status === "error" ? (row.campaign ? "ready" : "idle") : row.status,
          }
        : row,
    ),
  );
}

export function usePpcGoogleWorkspace({ site, apiKey, selectedModel }: UsePpcGoogleWorkspaceOptions) {
  const { reportError } = useManagerErrorLog();
  const [campaigns, setCampaigns] = useState<PpcCampaignRow[]>(() => {
    return stripPpcCampaignRowErrors(getPpcGoogleCampaignsSessionCache(site.id) ?? []);
  });
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [gridPageIndex, setGridPageIndex] = useState(0);
  const [sortColumn, setSortColumn] = useState<PpcGoogleSortColumn>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [adsCampaignStatusFilter, setAdsCampaignStatusFilter] =
    useState<PpcGoogleAdsCampaignStatusFilter>(PPC_GOOGLE_ADS_STATUS_FILTER_DEFAULT);
  const [generateConfig, setGenerateConfig] = useState<PpcGenerateConfig>(() =>
    readPpcGenerateConfig(site.id),
  );
  const [generateProgress, setGenerateProgress] = useState<PpcGenerateProgressState | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isImportingFromAds, setIsImportingFromAds] = useState(false);
  const [generatingAdGroupKey, setGeneratingAdGroupKey] = useState<string | null>(null);
  const [wpPages, setWpPages] = useState<PpcWpPageContext[]>([]);
  const [wpPagesLoading, setWpPagesLoading] = useState(false);
  const [pageBucketHostedLink, setPageBucketHostedLink] = useState<PpcPageBucketHostedLink | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pageBucketLinkRef = useRef<string | null>(null);

  useEffect(() => {
    setCampaigns((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        const fixed = ensurePpcRowDailyBudget(row);
        if (fixed.dailyBudget !== row.dailyBudget) changed = true;
        return fixed;
      });
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    const config = readPpcGenerateConfig(site.id);
    const adGroupCount = clampPpcAdGroupCount(config.adGroupCount);
    setCampaigns(
      syncPpcCampaignRowsToCount(
        stripPpcCampaignRowErrors(getPpcGoogleCampaignsSessionCache(site.id) ?? []),
        clampPpcCampaignCount(config.campaignCount),
        adGroupCount,
      ),
    );
    setExpandedCampaignId(null);
    setGridPageIndex(0);
    setGenerateProgress(null);
    setIsGenerating(false);
    setIsPublishing(false);
    setGenerateConfig(config);
  }, [site.id]);

  useEffect(() => {
    let cancelled = false;
    setWpPages([]);
    setWpPagesLoading(true);
    revokePpcPageBucketHostedLink(pageBucketLinkRef.current);
    pageBucketLinkRef.current = null;
    setPageBucketHostedLink(null);

    loadPpcGoogleWpContext(site)
      .then((pages) => {
        if (cancelled) return;
        setWpPages(pages);
        const link = createPpcPageBucketHostedLink(site.siteUrl, pages);
        pageBucketLinkRef.current = link.href;
        setPageBucketHostedLink(link);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setWpPages([]);
        reportError(err instanceof Error ? err.message : "Page bucket inventory failed.");
      })
      .finally(() => {
        if (!cancelled) setWpPagesLoading(false);
      });
    return () => {
      cancelled = true;
      revokePpcPageBucketHostedLink(pageBucketLinkRef.current);
      pageBucketLinkRef.current = null;
    };
  }, [reportError, site]);

  useEffect(() => {
    writePpcGenerateConfig(site.id, generateConfig);
  }, [generateConfig, site.id]);

  useEffect(() => {
    const target = clampPpcCampaignCount(generateConfig.campaignCount);
    const adGroupCount = clampPpcAdGroupCount(generateConfig.adGroupCount);
    setCampaigns((prev) => syncPpcCampaignRowsToCount(prev, target, adGroupCount));
  }, [generateConfig.campaignCount, generateConfig.adGroupCount]);

  useEffect(() => {
    if (campaigns.length) {
      setPpcGoogleCampaignsSessionCache(site.id, campaigns);
    } else {
      clearPpcGoogleCampaignsSessionCache(site.id);
    }
  }, [campaigns, site.id]);

  useEffect(() => {
    setGridPageIndex(0);
  }, [sortColumn, sortDir, campaigns.length, adsCampaignStatusFilter]);

  const displayCampaigns = useMemo(() => {
    const filtered = campaigns.filter((row) =>
      ppcRowMatchesGoogleAdsStatusFilter(row, adsCampaignStatusFilter),
    );
    const sorted = [...filtered];
    if (sortColumn === "title") {
      sorted.sort((a, b) => {
        const av = (a.campaignName || a.campaign?.name || "").toLowerCase();
        const bv = (b.campaignName || b.campaign?.name || "").toLowerCase();
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    } else if (sortColumn === "date") {
      sorted.sort((a, b) => {
        const av = a.createdAt || "";
        const bv = b.createdAt || "";
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return sorted;
  }, [adsCampaignStatusFilter, campaigns, sortColumn, sortDir]);

  const paginatedCampaigns = useMemo(
    () => overviewGridPageSlice(displayCampaigns, gridPageIndex),
    [displayCampaigns, gridPageIndex],
  );

  const toggleExpandedCampaignId = useCallback((id: string) => {
    setExpandedCampaignId((prev) => (prev === id ? null : id));
  }, []);

  const updateCampaign = useCallback((id: string, patch: Partial<PpcCampaignRow>) => {
    setCampaigns((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }, []);

  const handleDeleteCampaign = useCallback(
    (id: string) => {
      if (isGenerating || isPublishing) return;
      const targetCount = clampPpcCampaignCount(generateConfig.campaignCount);
      const adGroupCount = clampPpcAdGroupCount(generateConfig.adGroupCount);
      setCampaigns((prev) =>
        syncPpcCampaignRowsToCount(
          prev.filter((row) => row.id !== id),
          targetCount,
          adGroupCount,
        ),
      );
      setExpandedCampaignId((prev) => (prev === id ? null : prev));
    },
    [isGenerating, isPublishing, generateConfig.campaignCount, generateConfig.adGroupCount],
  );

  const loadWpPagesForPicker = useCallback(async () => {
    if (wpPagesLoading || wpPages.length) return;
    setWpPagesLoading(true);
    try {
      const pages = await loadPpcGoogleWpContext(site);
      setWpPages(pages);
    } catch {
      setWpPages([]);
    } finally {
      setWpPagesLoading(false);
    }
  }, [site, wpPages.length, wpPagesLoading]);

  const handleGenerateCampaign = useCallback(async () => {
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
  }, [
    apiKey,
    campaigns,
    generateConfig,
    isGenerating,
    isPublishing,
    selectedModel,
    reportError,
    site,
    updateCampaign,
    wpPages,
  ]);

  const handleGenerateCampaignRow = useCallback(
    async (rowId: string) => {
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
    },
    [apiKey, campaigns, generateConfig, isGenerating, reportError, selectedModel, site, updateCampaign, wpPages],
  );

  const handleGenerateAdGroup = useCallback(
    async (rowId: string, adGroupIndex: number) => {
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
    },
    [apiKey, campaigns, generateConfig, isGenerating, isPublishing, reportError, selectedModel, site, updateCampaign, wpPages],
  );

  const handlePullFromGoogleAds = useCallback(async () => {
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
  }, [
    campaigns,
    generateConfig.adGroupCount,
    generateConfig.campaignCount,
    isGenerating,
    isImportingFromAds,
    isPublishing,
    reportError,
    site.googleAdsCustomerId,
  ]);

  const canPullFromGoogleAds = useMemo(() => {
    const customerId = normalizeGoogleAdsCustomerId(site.googleAdsCustomerId ?? "");
    return customerId.length === 10;
  }, [site.googleAdsCustomerId]);

  const handleExportGoogleAdsCsv = useCallback(() => {
    const csv = buildGoogleAdsEditorCsv(campaigns);
    triggerGoogleAdsCsvDownload(googleAdsExportFilename(site.name), csv);
  }, [campaigns, site.name]);

  const canExportGoogleAdsCsv = useMemo(
    () => campaigns.some((row) => row.status === "ready" && row.campaign),
    [campaigns],
  );

  const canPublish = useMemo(() => {
    const customerId = normalizeGoogleAdsCustomerId(site.googleAdsCustomerId ?? "");
    return customerId.length === 10 && campaigns.length > 0;
  }, [campaigns.length, site.googleAdsCustomerId]);

  const handlePublishCampaigns = useCallback(async () => {
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
  }, [
    apiKey,
    campaigns,
    generateConfig.adGroupCount,
    generateConfig.adsPerAdGroup,
    isGenerating,
    isPublishing,
    reportError,
    selectedModel,
    site,
    updateCampaign,
    wpPages,
  ]);

  const bulkMicroSnapshot = useMemo((): MetaBulkMicroSnapshot | null => {
    if ((!isGenerating && !isPublishing) || !generateProgress) return null;
    const active = generateProgress.steps.find((s) => s.status === "running");
    return {
      label: active?.label ?? generateProgress.label,
      completed: generateProgress.completed,
      total: generateProgress.total,
      statusMessage: generateProgress.statusMessage,
      progressPct:
        generateProgress.total > 0
          ? Math.round((generateProgress.completed / generateProgress.total) * 100)
          : 0,
    };
  }, [generateProgress, isGenerating, isPublishing]);

  const canOpenDetails = Boolean(
    pageBucketHostedLink ||
      isGenerating ||
      isPublishing ||
      (generateProgress && generateProgress.completed > 0),
  );

  const workspaceBusy = isGenerating || isPublishing || isImportingFromAds;

  const gridPaginationTotal = useMemo(
    () => ppcGoogleGridRowCount(displayCampaigns.length),
    [displayCampaigns.length],
  );

  const paginationLayoutTotal = PPC_GOOGLE_PLACEHOLDER_ROW_COUNT;

  return {
    site,
    campaigns,
    displayCampaigns,
    paginatedCampaigns,
    expandedCampaignId,
    toggleExpandedCampaignId,
    gridPageIndex,
    setGridPageIndex,
    sortColumn,
    setSortColumn,
    sortDir,
    setSortDir,
    adsCampaignStatusFilter,
    setAdsCampaignStatusFilter,
    generateConfig,
    setGenerateConfig,
    generateProgress,
    isGenerating,
    isPublishing,
    wpPages,
    wpPagesLoading,
    pageBucketHostedLink,
    loadWpPagesForPicker,
    handleGenerateCampaign,
    handleGenerateCampaignRow,
    handleGenerateAdGroup,
    handleDeleteCampaign,
    generatingAdGroupKey,
    handleExportGoogleAdsCsv,
    canExportGoogleAdsCsv,
    handlePublishCampaigns,
    canPublish,
    handlePullFromGoogleAds,
    canPullFromGoogleAds,
    isImportingFromAds,
    updateCampaign,
    bulkMicroSnapshot,
    canOpenDetails,
    workspaceBusy,
    gridPaginationTotal,
    paginationLayoutTotal,
  };
}

export type PpcGoogleWorkspaceController = ReturnType<typeof usePpcGoogleWorkspace>;
