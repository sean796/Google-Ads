import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import { useTeam } from "@/contexts/TeamContext";
import { overviewGridPageSlice } from "@/components/overview/OverviewGridPagination";
import type { MetaBulkMicroSnapshot } from "@/components/overview/OverviewBulkMicroProgress";
import {
  clampMetaAdCount,
  createIdleMetaAdRow,
  metaRowPatchFromGenerated,
  metaRowUserInputPreserve,
  META_AD_COUNT_MIN,
  resolveMetaRowContextSource,
  type MetaAdRow,
  type MetaGenerateConfig,
} from "@/lib/ppc/meta-ads-types";
import type { MetaGenerateProgressState } from "@/lib/ppc/meta-ads-progress-types";
import {
  getPpcMetaAdsSessionCache,
  setPpcMetaAdsSessionCache,
  clearPpcMetaAdsSessionCache,
} from "@/lib/ppc/meta-ads-session-cache";
import {
  readMetaGenerateConfig,
  writeMetaGenerateConfig,
} from "@/lib/ppc/meta-ads-field-limits";
import { loadPpcPageBucketContext } from "@/lib/ppc/ppc-page-bucket-inventory";
import {
  createPpcPageBucketHostedLink,
  revokePpcPageBucketHostedLink,
  type PpcPageBucketHostedLink,
} from "@/lib/ppc/ppc-page-bucket-inventory";
import type { PpcWpPageContext } from "@/lib/ppc/google-ads-types";
import {
  ppcMetaGridRowCount,
  PPC_META_PLACEHOLDER_ROW_COUNT,
} from "@/components/ppc/meta/meta-ads-row-constants";
import type { MetaAdImageReferenceSummary } from "@/lib/ppc/meta-ad-image-reference-types";
import { syncMetaAdRowsToCount } from "@/lib/ppc/sync-meta-ad-rows";
import { hasMetaColorPalette } from "@/lib/ppc/meta-ad-color-palette";
import {
  resolveMetaGenerateVisualToolPaletteForGenerate,
} from "@/lib/ppc/meta-ad-generate-config-defaults";
import {
  resolveMetaAdRowColorPalette,
  rowUsesHeaderColorTheme,
} from "@/lib/ppc/meta-ad-color-themes";
import {
  resolveMetaAdRowVisualToolPalette,
} from "@/lib/ppc/meta-ad-visual-tool-themes";
import {
  cloneVisualToolPalette,
  emptyVisualToolPalette,
  migrateLegacyPeopleToolPalette,
  resolveAllowPeopleInImage,
} from "@/lib/ppc/meta-ad-visual-tool-palette";
import { resolveMetaTypographyStyle } from "@/lib/ppc/meta-ad-typography-styles";
import {
  appendNeoPulseMetaStaticPages,
  getNeoPulseMetaPickerPages,
  isNeoPulseMetaStaticLandingUrl,
  isNeoDigitalAgencyTeam,
  metaRowHasGenerateInput,
} from "@/lib/ppc/neo-pulse-meta-marketing-context";
import { runPpcMetaAdGenerate } from "@/lib/ppc/run-ppc-meta-ad-generate";
import { runPpcMetaAdGenerateBatch } from "@/lib/ppc/run-ppc-meta-ad-generate-batch";
import { parseMetaKeywordTemplateCsv } from "@/lib/ppc/meta-ads-keyword-template";
import {
  buildMetaAdsExportCsv,
  metaAdsExportFilename,
  triggerMetaAdsCsvDownload,
} from "@/lib/ppc/export-meta-ads-csv";
import { exportMetaAdsCreativeZip } from "@/lib/ppc/export-meta-ads-creative-zip";

function resolveRowGenerateVisualInputs(sourceRow: MetaAdRow, config: MetaGenerateConfig) {
  const palette = migrateLegacyPeopleToolPalette(
    resolveMetaAdRowVisualToolPalette({
      rowPalette: sourceRow.visualToolPalette,
      defaultPalette: config.defaultVisualToolPalette,
    }) ?? emptyVisualToolPalette(),
    sourceRow.allowPeopleInImage,
  );
  return {
    visualToolPalette: resolveMetaGenerateVisualToolPaletteForGenerate(palette),
    allowPeopleInImage: resolveAllowPeopleInImage(palette, sourceRow.allowPeopleInImage),
    typographyStyle: resolveMetaTypographyStyle(
      sourceRow.typographyStyle ?? config.defaultTypographyStyle,
    ),
  };
}

export type UsePpcMetaWorkspaceOptions = {
  site: WordPressSite;
  apiKey: string;
  selectedModel: string;
};

export type PpcMetaSortColumn = "title" | "date" | null;

export function usePpcMetaWorkspace({ site, apiKey, selectedModel }: UsePpcMetaWorkspaceOptions) {
  const { activeTeam } = useTeam();
  const teamName = activeTeam?.name ?? null;
  const [ads, setAds] = useState<MetaAdRow[]>(() => getPpcMetaAdsSessionCache(site.id) ?? []);
  const [expandedAdId, setExpandedAdId] = useState<string | null>(null);
  const [gridPageIndex, setGridPageIndex] = useState(0);
  const [sortColumn, setSortColumn] = useState<PpcMetaSortColumn>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [generateConfig, setGenerateConfig] = useState<MetaGenerateConfig>(() =>
    readMetaGenerateConfig(site.id),
  );
  const [generateProgress, setGenerateProgress] = useState<MetaGenerateProgressState | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [wpPages, setWpPages] = useState<PpcWpPageContext[]>([]);
  const [wpPagesLoading, setWpPagesLoading] = useState(false);
  const [pageBucketHostedLink, setPageBucketHostedLink] = useState<PpcPageBucketHostedLink | null>(null);
  const [lastImagePromptDescription, setLastImagePromptDescription] = useState<string | null>(null);
  const [lastImageReferences, setLastImageReferences] = useState<MetaAdImageReferenceSummary[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const pageBucketLinkRef = useRef<string | null>(null);

  const defaultColorPalette = generateConfig.defaultColorPalette;

  const syncRowsToCount = useCallback(
    (rows: MetaAdRow[], targetCount: number) => syncMetaAdRowsToCount(rows, targetCount),
    [],
  );

  useEffect(() => {
    const config = readMetaGenerateConfig(site.id);
    setAds(syncRowsToCount(getPpcMetaAdsSessionCache(site.id) ?? [], clampMetaAdCount(config.adCount)));
    setExpandedAdId(null);
    setGridPageIndex(0);
    setGenerateProgress(null);
    setIsGenerating(false);
    setGenerateConfig(config);
  }, [site.id, syncRowsToCount]);

  const mergeNeoPulseLandingPages = useCallback(
    (pages: PpcWpPageContext[]): PpcWpPageContext[] => appendNeoPulseMetaStaticPages(pages, teamName),
    [teamName],
  );

  useEffect(() => {
    let cancelled = false;
    setWpPages([]);
    setWpPagesLoading(true);
    revokePpcPageBucketHostedLink(pageBucketLinkRef.current);
    pageBucketLinkRef.current = null;
    setPageBucketHostedLink(null);

    if (isNeoDigitalAgencyTeam(teamName)) {
      setWpPages(getNeoPulseMetaPickerPages());
      setWpPagesLoading(false);
      return () => {
        cancelled = true;
      };
    }

    loadPpcPageBucketContext(site)
      .then((pages) => {
        if (cancelled) return;
        const merged = mergeNeoPulseLandingPages(pages);
        setWpPages(merged);
        const link = createPpcPageBucketHostedLink(site.siteUrl, merged);
        pageBucketLinkRef.current = link.href;
        setPageBucketHostedLink(link);
      })
      .catch(() => {
        if (!cancelled) setWpPages([]);
      })
      .finally(() => {
        if (!cancelled) setWpPagesLoading(false);
      });

    return () => {
      cancelled = true;
      revokePpcPageBucketHostedLink(pageBucketLinkRef.current);
      pageBucketLinkRef.current = null;
    };
  }, [mergeNeoPulseLandingPages, site.id, site.siteUrl, site.username, site.appPassword, teamName]);

  useEffect(() => {
    writeMetaGenerateConfig(site.id, generateConfig);
  }, [generateConfig, site.id]);

  useEffect(() => {
    const target = clampMetaAdCount(generateConfig.adCount);
    setAds((prev) => syncRowsToCount(prev, target));
  }, [generateConfig.adCount, syncRowsToCount]);

  useEffect(() => {
    if (ads.length) {
      setPpcMetaAdsSessionCache(site.id, ads);
    } else {
      clearPpcMetaAdsSessionCache(site.id);
    }
  }, [ads, site.id]);

  useEffect(() => {
    setGridPageIndex(0);
  }, [sortColumn, sortDir, ads.length]);

  const displayAds = useMemo(() => {
    const sorted = [...ads];
    if (sortColumn === "title") {
      sorted.sort((a, b) => {
        const av = (a.adName || a.copy?.headline || "").toLowerCase();
        const bv = (b.adName || b.copy?.headline || "").toLowerCase();
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
  }, [ads, sortColumn, sortDir]);

  const paginatedAds = useMemo(
    () => overviewGridPageSlice(displayAds, gridPageIndex),
    [displayAds, gridPageIndex],
  );

  const toggleExpandedAdId = useCallback((id: string) => {
    setExpandedAdId((prev) => (prev === id ? null : id));
  }, []);

  const updateAd = useCallback((id: string, patch: Partial<MetaAdRow>) => {
    setAds((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }, []);

  const handleDeleteAd = useCallback(
    (id: string) => {
      if (isGenerating) return;

      if (ads.length <= META_AD_COUNT_MIN) {
        setAds((prev) =>
          prev.map((row) => (row.id === id ? createIdleMetaAdRow() : row)),
        );
      } else {
        const remaining = ads.filter((row) => row.id !== id);
        const newCount = clampMetaAdCount(remaining.length);
        setGenerateConfig((prev) => ({ ...prev, adCount: newCount }));
        setAds(syncRowsToCount(remaining, newCount));
      }

      setExpandedAdId((prev) => (prev === id ? null : prev));
      setGenerateProgress(null);
      setLastImagePromptDescription(null);
      setLastImageReferences([]);
    },
    [ads, isGenerating, syncRowsToCount],
  );

  const setWorkspaceVisualDefaults = useCallback(
    (defaults: Pick<
      MetaGenerateConfig,
      "defaultColorPalette" | "defaultVisualToolPalette" | "defaultTypographyStyle"
    >) => {
      const nextColors = { ...defaults.defaultColorPalette };
      const nextTools = cloneVisualToolPalette(defaults.defaultVisualToolPalette);
      const nextTypographyStyle = resolveMetaTypographyStyle(defaults.defaultTypographyStyle);
      setGenerateConfig((prev) => ({
        ...prev,
        defaultColorPalette: nextColors,
        defaultVisualToolPalette: nextTools,
        defaultTypographyStyle: nextTypographyStyle,
      }));
      setAds((prev) =>
        prev.map((row) => {
          if (!rowUsesHeaderColorTheme(row.colorPalette)) return row;
          return { ...row, colorPalette: { ...nextColors } };
        }),
      );
    },
    [],
  );

  const handleClearAllAds = useCallback(() => {
    if (isGenerating) return;
    const count = clampMetaAdCount(generateConfig.adCount);
    setAds(Array.from({ length: count }, () => createIdleMetaAdRow()));
    setExpandedAdId(null);
    setGenerateProgress(null);
    setLastImagePromptDescription(null);
    setLastImageReferences([]);
    clearPpcMetaAdsSessionCache(site.id);
  }, [generateConfig.adCount, isGenerating, site.id]);

  const loadWpPagesForPicker = useCallback(async () => {
    if (wpPagesLoading) return;
    const hasClientBucket =
      wpPages.some((page) => !isNeoPulseMetaStaticLandingUrl(page.url)) && wpPages.length > 0;
    if (hasClientBucket) return;

    setWpPagesLoading(true);
    try {
      const pages = mergeNeoPulseLandingPages(await loadPpcPageBucketContext(site));
      setWpPages(pages);
      revokePpcPageBucketHostedLink(pageBucketLinkRef.current);
      const link = createPpcPageBucketHostedLink(site.siteUrl, pages);
      pageBucketLinkRef.current = link.href;
      setPageBucketHostedLink(link);
    } catch {
      if (isNeoDigitalAgencyTeam(teamName)) {
        setWpPages(getNeoPulseMetaPickerPages());
      } else {
        setWpPages([]);
      }
    } finally {
      setWpPagesLoading(false);
    }
  }, [mergeNeoPulseLandingPages, site, teamName, wpPages, wpPagesLoading]);

  const applyGeneratedResult = useCallback(
    (rowId: string, sourceRow: MetaAdRow, result: Awaited<ReturnType<typeof runPpcMetaAdGenerate>>) => {
      setLastImagePromptDescription(result.imagePromptDescription ?? null);
      setLastImageReferences(result.imageReferences ?? []);
      updateAd(rowId, {
        status: "ready",
        createdAt: new Date().toISOString(),
        instagramGoal: result.goal,
        creativeBrief: result.creativeBrief,
        visualReferenceElements: result.visualReferenceElements,
        researchSections: result.researchSections,
        blueprint: result.blueprint,
        copyChecklist: result.copyChecklist,
        copy: result.copy,
        imageChecklist: result.imageChecklist,
        creative: result.creative,
        imagePromptDescription: result.imagePromptDescription,
        imageReferences: result.imageReferences,
        errorMessage: undefined,
        ...metaRowPatchFromGenerated(
          result.blueprint,
          result.copy,
          result.creative,
          metaRowUserInputPreserve(sourceRow),
        ),
      });
    },
    [updateAd],
  );

  const handleGenerateAds = useCallback(async () => {
    if (isGenerating || !apiKey?.trim()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const config: MetaGenerateConfig = {
      adCount: clampMetaAdCount(generateConfig.adCount),
      placement: generateConfig.placement,
      includeImage: generateConfig.includeImage,
      defaultColorPalette: generateConfig.defaultColorPalette,
      defaultVisualToolPalette: generateConfig.defaultVisualToolPalette,
    };

    const targetRows = ads.slice(0, config.adCount);
    const rowIds = targetRows.map((row) => row.id);

    const missingInput = targetRows.some((row) => !metaRowHasGenerateInput(row));
    if (missingInput) {
      setAds((prev) =>
        prev.map((row, index) =>
          index < config.adCount && !metaRowHasGenerateInput(row)
            ? {
                ...row,
                status: "error" as const,
                errorMessage: "Add a focus keyword, context URL, or NEO Pulse app context before generating.",
              }
            : row,
        ),
      );
      return;
    }

    setAds((prev) =>
      prev.map((row) =>
        rowIds.includes(row.id)
          ? { ...row, status: "generating" as const, config, errorMessage: undefined }
          : row,
      ),
    );
    setIsGenerating(true);

    try {
      const jobs = targetRows.map((sourceRow) => {
        const visualInputs = resolveRowGenerateVisualInputs(sourceRow, config);
        return {
          rowId: sourceRow.id,
          config,
          focusKeyword: sourceRow.focusKeyword?.trim() || undefined,
          contextSource: resolveMetaRowContextSource(sourceRow),
          contextUrl: sourceRow.contextUrl?.trim() || undefined,
          landingPageUrl: sourceRow.landingPageUrl?.trim() || undefined,
          allowPeopleInImage: visualInputs.allowPeopleInImage,
          imagePromptModifier: sourceRow.imagePromptModifier?.trim() || undefined,
          fbInstagramContent: sourceRow.fbInstagramContent?.trim() || undefined,
          typographyStyle: visualInputs.typographyStyle,
          colorPalette: resolveMetaAdRowColorPalette({
            rowPalette: sourceRow.colorPalette,
            defaultPalette: config.defaultColorPalette,
          }),
          visualToolPalette: visualInputs.visualToolPalette,
        };
      });

      if (jobs.length === 1) {
        const sourceRow = targetRows[0]!;
        const result = await runPpcMetaAdGenerate({
          site,
          apiKey,
          model: selectedModel,
          config,
          focusKeyword: jobs[0]!.focusKeyword,
          contextSource: jobs[0]!.contextSource,
          contextUrl: jobs[0]!.contextUrl,
          landingPageUrl: jobs[0]!.landingPageUrl,
          allowPeopleInImage: jobs[0]!.allowPeopleInImage,
          imagePromptModifier: jobs[0]!.imagePromptModifier,
          fbInstagramContent: jobs[0]!.fbInstagramContent,
          typographyStyle: jobs[0]!.typographyStyle,
          colorPalette: jobs[0]!.colorPalette,
          visualToolPalette: jobs[0]!.visualToolPalette,
          teamName,
          onProgress: setGenerateProgress,
          onResearchSections: (sections) => updateAd(jobs[0]!.rowId, { researchSections: sections }),
          onPartialUpdate: (patch) => updateAd(jobs[0]!.rowId, patch),
          signal: controller.signal,
        });
        applyGeneratedResult(jobs[0]!.rowId, sourceRow, result);
      } else {
        const results = await runPpcMetaAdGenerateBatch({
          site,
          apiKey,
          model: selectedModel,
          teamName,
          jobs,
          onProgress: setGenerateProgress,
          onResearchSections: (rowId, sections) => updateAd(rowId, { researchSections: sections }),
          onPartialUpdate: (rowId, patch) => updateAd(rowId, patch),
          signal: controller.signal,
        });

        for (const outcome of results) {
          if (outcome.ok) {
            const sourceRow = targetRows.find((row) => row.id === outcome.rowId);
            if (sourceRow) {
              applyGeneratedResult(outcome.rowId, sourceRow, outcome.result);
            }
          } else {
            updateAd(outcome.rowId, {
              status: "error",
              config: outcome.config,
              errorMessage: outcome.errorMessage,
            });
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Meta ad generation failed";
      setAds((prev) =>
        prev.map((row) =>
          rowIds.includes(row.id) && row.status === "generating"
            ? { ...row, status: "error", errorMessage: message }
            : row,
        ),
      );
    } finally {
      setIsGenerating(false);
    }
  }, [ads, apiKey, applyGeneratedResult, generateConfig, isGenerating, selectedModel, site, teamName, updateAd]);

  const handleGenerateAdRow = useCallback(
    async (rowId: string) => {
      if (isGenerating || !apiKey?.trim()) return;

      const sourceRow = ads.find((row) => row.id === rowId);
      if (!sourceRow) return;

      if (!metaRowHasGenerateInput(sourceRow)) {
        updateAd(rowId, {
          status: "error",
          errorMessage: "Add a focus keyword, context URL, or NEO Pulse app context before generating.",
        });
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const rowConfig: MetaGenerateConfig = {
        adCount: 1,
        placement: generateConfig.placement,
        includeImage: generateConfig.includeImage,
        defaultColorPalette: generateConfig.defaultColorPalette,
        defaultVisualToolPalette: generateConfig.defaultVisualToolPalette,
        defaultTypographyStyle: generateConfig.defaultTypographyStyle,
      };
      const visualInputs = resolveRowGenerateVisualInputs(sourceRow, rowConfig);

      updateAd(rowId, {
        status: "generating",
        config: rowConfig,
        blueprint: undefined,
        instagramGoal: undefined,
        researchSections: undefined,
        copyChecklist: undefined,
        copy: undefined,
        imageChecklist: undefined,
        creative: undefined,
        errorMessage: undefined,
      });
      setIsGenerating(true);

      try {
        const result = await runPpcMetaAdGenerate({
          site,
          apiKey,
          model: selectedModel,
          config: rowConfig,
          focusKeyword: sourceRow.focusKeyword?.trim() || undefined,
          contextSource: resolveMetaRowContextSource(sourceRow),
          contextUrl: sourceRow.contextUrl?.trim() || undefined,
          landingPageUrl: sourceRow.landingPageUrl?.trim() || undefined,
          allowPeopleInImage: visualInputs.allowPeopleInImage,
          imagePromptModifier: sourceRow.imagePromptModifier?.trim() || undefined,
          fbInstagramContent: sourceRow.fbInstagramContent?.trim() || undefined,
          typographyStyle: visualInputs.typographyStyle,
          colorPalette: resolveMetaAdRowColorPalette({
            rowPalette: sourceRow.colorPalette,
            defaultPalette: rowConfig.defaultColorPalette,
          }),
          visualToolPalette: visualInputs.visualToolPalette,
          teamName,
          onProgress: setGenerateProgress,
          onResearchSections: (sections) => updateAd(rowId, { researchSections: sections }),
          onPartialUpdate: (patch) => updateAd(rowId, patch),
          signal: controller.signal,
        });
        applyGeneratedResult(rowId, sourceRow, result);
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Meta ad generation failed";
        updateAd(rowId, {
          status: "error",
          config: rowConfig,
          errorMessage: message,
        });
      } finally {
        setIsGenerating(false);
      }
    },
    [ads, apiKey, applyGeneratedResult, generateConfig, isGenerating, selectedModel, site, teamName, updateAd],
  );

  const handleImportKeywords = useCallback(
    async (file: File) => {
      if (isGenerating) return;
      const importedRows = parseMetaKeywordTemplateCsv(await file.text());
      if (!importedRows.length) {
        setAds((prev) => {
          if (!prev.length) return prev;
          const [first, ...rest] = prev;
          return [{ ...first!, status: "error" as const, errorMessage: "No keywords found in CSV." }, ...rest];
        });
        return;
      }

      const adCount = clampMetaAdCount(importedRows.length);
      setGenerateConfig((prev) => ({ ...prev, adCount }));
      setAds((prev) =>
        syncRowsToCount(prev, adCount).map((row, index) => {
          const imported = importedRows[index];
          if (!imported) return row;
          return {
            ...row,
            focusKeyword: imported.focusKeyword,
            adName: imported.adName ?? row.adName,
            contextSource: imported.contextSource ?? row.contextSource ?? "custom",
            contextUrl: imported.contextUrl ?? row.contextUrl,
            landingPageUrl: imported.landingPageUrl ?? row.landingPageUrl,
            imagePromptModifier: imported.imagePromptModifier ?? row.imagePromptModifier,
            fbInstagramContent: imported.fbInstagramContent ?? row.fbInstagramContent,
            status: "idle" as const,
            errorMessage: undefined,
          };
        }),
      );
    },
    [isGenerating, syncRowsToCount],
  );

  const handleCancelGenerate = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGenerating(false);
    setAds((prev) =>
      prev.map((row) =>
        row.status === "generating" ? { ...row, status: "idle", errorMessage: undefined } : row,
      ),
    );
  }, []);

  const bulkMicroSnapshot = useMemo((): MetaBulkMicroSnapshot | null => {
    if (!isGenerating || !generateProgress) return null;
    const active = generateProgress.steps.find((step) => step.status === "running");
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
  }, [generateProgress, isGenerating]);

  const workspaceBusy = isGenerating;

  const gridPaginationTotal = useMemo(
    () => ppcMetaGridRowCount(displayAds.length),
    [displayAds.length],
  );

  const paginationLayoutTotal = PPC_META_PLACEHOLDER_ROW_COUNT;

  const handleExportMetaAdsCsv = useCallback(() => {
    const csv = buildMetaAdsExportCsv(ads);
    triggerMetaAdsCsvDownload(metaAdsExportFilename(site.name), csv);
  }, [ads, site.name]);

  const canExportMetaAdsCsv = useMemo(() => ads.some((row) => Boolean(row.copy)), [ads]);

  const handleExportMetaAdsCreativeZip = useCallback(async () => {
    await exportMetaAdsCreativeZip(ads, site.name);
  }, [ads, site.name]);

  const canExportMetaAdsCreativeZip = useMemo(
    () =>
      ads.some(
        (row) =>
          Boolean(row.creative?.imagePreviewUrl?.trim() || row.creative?.imageBase64?.trim()) ||
          Boolean(row.copy) ||
          Boolean(
            row.researchSections?.some((section) => section.status === "done" && section.markdown?.trim()),
          ),
      ),
    [ads],
  );

  return {
    site,
    ads,
    displayAds,
    paginatedAds,
    expandedAdId,
    toggleExpandedAdId,
    gridPageIndex,
    setGridPageIndex,
    sortColumn,
    setSortColumn,
    sortDir,
    setSortDir,
    generateConfig,
    setGenerateConfig,
    setWorkspaceVisualDefaults,
    generateProgress,
    isGenerating,
    wpPages,
    wpPagesLoading,
    pageBucketHostedLink,
    loadWpPagesForPicker,
    handleGenerateAds,
    handleGenerateAdRow,
    handleCancelGenerate,
    handleImportKeywords,
    handleDeleteAd,
    handleClearAllAds,
    handleExportMetaAdsCsv,
    canExportMetaAdsCsv,
    handleExportMetaAdsCreativeZip,
    canExportMetaAdsCreativeZip,
    updateAd,
    bulkMicroSnapshot,
    workspaceBusy,
    gridPaginationTotal,
    paginationLayoutTotal,
    lastImagePromptDescription,
    lastImageReferences,
  };
}

export type PpcMetaWorkspaceController = ReturnType<typeof usePpcMetaWorkspace>;
