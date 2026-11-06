import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import { useManagerErrorLog } from "@/contexts/manager-error-log-context";
import { overviewGridPageSlice } from "@/components/overview/overview-grid-pagination-helpers";
import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import {
  clampPpcAdGroupCount,
  clampPpcCampaignCount,
  type PpcCampaignRow,
  type PpcGenerateConfig,
  type PpcWpPageContext,
} from "@/lib/ppc/google-ads-types";
import { ensurePpcRowDailyBudget } from "@/lib/ppc/ppc-row-generate-patch";
import type { PpcGenerateProgressState } from "@/lib/ppc/google-ads-progress-types";
import { normalizeGoogleAdsCustomerId } from "@/lib/ads-reporting/ads-reporting-metrics";
import {
  getPpcGoogleCampaignsSessionCache,
  setPpcGoogleCampaignsSessionCache,
  clearPpcGoogleCampaignsSessionCache,
} from "@/lib/ppc/google-ads-session-cache";
import { loadPpcGoogleWpContext } from "@/lib/ppc/google-ads-wp-context";
import {
  createPpcPageBucketHostedLink,
  revokePpcPageBucketHostedLink,
  type PpcPageBucketHostedLink,
} from "@/lib/ppc/ppc-page-bucket-inventory";
import {
  ppcGoogleGridRowCount,
  PPC_GOOGLE_PLACEHOLDER_ROW_COUNT,
} from "@/components/ppc/google/google-ads-row-constants";
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
  PPC_GOOGLE_ADS_STATUS_FILTER_DEFAULT,
  ppcRowMatchesGoogleAdsStatusFilter,
  type PpcGoogleAdsCampaignStatusFilter,
} from "@/lib/ppc/ppc-google-ads-status-filter";
import type {
  PpcGoogleSortColumn,
  UsePpcGoogleWorkspaceOptions,
} from "./use-ppc-google-workspace-types";
import { stripPpcCampaignRowErrors } from "./use-ppc-google-workspace-helpers";
import {
  executePpcGenerateAdGroup,
  executePpcGenerateCampaign,
  executePpcGenerateCampaignRow,
} from "./use-ppc-google-workspace-generate";
import {
  executePpcPublishCampaigns,
  executePpcPullFromGoogleAds,
} from "./use-ppc-google-workspace-publish";

export type {
  PpcGoogleSortColumn,
  UsePpcGoogleWorkspaceOptions,
} from "./use-ppc-google-workspace-types";

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
    await executePpcGenerateCampaign({
      site,
      apiKey,
      selectedModel,
      campaigns,
      generateConfig,
      isGenerating,
      isPublishing,
      wpPages,
      setCampaigns,
      updateCampaign,
      reportError,
      setGenerateProgress,
      setIsGenerating,
      abortRef,
    });
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
      await executePpcGenerateCampaignRow(
        {
          site,
          apiKey,
          selectedModel,
          campaigns,
          generateConfig,
          isGenerating,
          wpPages,
          updateCampaign,
          reportError,
          setGenerateProgress,
          setIsGenerating,
          abortRef,
        },
        rowId,
      );
    },
    [apiKey, campaigns, generateConfig, isGenerating, reportError, selectedModel, site, updateCampaign, wpPages],
  );

  const handleGenerateAdGroup = useCallback(
    async (rowId: string, adGroupIndex: number) => {
      await executePpcGenerateAdGroup(
        {
          site,
          apiKey,
          selectedModel,
          campaigns,
          generateConfig,
          isGenerating,
          isPublishing,
          wpPages,
          setWpPages,
          updateCampaign,
          reportError,
          setGenerateProgress,
          setIsGenerating,
          setGeneratingAdGroupKey,
          abortRef,
        },
        rowId,
        adGroupIndex,
      );
    },
    [apiKey, campaigns, generateConfig, isGenerating, isPublishing, reportError, selectedModel, site, updateCampaign, wpPages],
  );

  const handlePullFromGoogleAds = useCallback(async () => {
    await executePpcPullFromGoogleAds({
      campaigns,
      generateConfigAdGroupCount: generateConfig.adGroupCount,
      generateConfigCampaignCount: generateConfig.campaignCount,
      isGenerating,
      isImportingFromAds,
      isPublishing,
      reportError,
      siteGoogleAdsCustomerId: site.googleAdsCustomerId,
      setIsImportingFromAds,
      setGenerateConfig,
      setCampaigns,
      setGridPageIndex,
    });
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
    await executePpcPublishCampaigns({
      site,
      apiKey,
      selectedModel,
      campaigns,
      generateConfigAdGroupCount: generateConfig.adGroupCount,
      generateConfigAdsPerAdGroup: generateConfig.adsPerAdGroup,
      isGenerating,
      isPublishing,
      wpPages,
      updateCampaign,
      reportError,
      setGenerateProgress,
      setIsGenerating,
      setIsPublishing,
      setCampaigns,
    });
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
