import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import { useTeam } from "@/contexts/TeamContext";
import { overviewGridPageSlice } from "@/components/overview/overview-grid-pagination-helpers";
import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import {
  clampMetaAdCount,
  createIdleMetaAdRow,
  META_AD_COUNT_MIN,
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
import {
  ppcMetaGridRowCount,
  PPC_META_PLACEHOLDER_ROW_COUNT,
} from "@/components/ppc/meta/meta-ads-row-constants";
import type { MetaAdImageReferenceSummary } from "@/lib/ppc/meta-ad-image-reference-types";
import { syncMetaAdRowsToCount } from "@/lib/ppc/sync-meta-ad-rows";
import {
  cloneVisualToolPalette,
} from "@/lib/ppc/meta-ad-visual-tool-palette";
import { resolveMetaTypographyStyle } from "@/lib/ppc/meta-ad-typography-styles";
import {
  rowUsesHeaderColorTheme,
} from "@/lib/ppc/meta-ad-color-themes";
import {
  metaRowHasGenerateInput,
} from "@/lib/ppc/neo-pulse-meta-marketing-context";
import { parseMetaKeywordTemplateCsv } from "@/lib/ppc/meta-ads-keyword-template";
import {
  buildMetaAdsExportCsv,
  metaAdsExportFilename,
  triggerMetaAdsCsvDownload,
} from "@/lib/ppc/export-meta-ads-csv";
import { exportMetaAdsCreativeZip } from "@/lib/ppc/export-meta-ads-creative-zip";
import { usePpcMetaWorkspacePages } from "./use-ppc-meta-workspace-pages";
import {
  applyPpcMetaGeneratedResult,
  executePpcMetaGenerateAdRow,
  executePpcMetaGenerateAds,
} from "./use-ppc-meta-workspace-generate";

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
  const [lastImagePromptDescription, setLastImagePromptDescription] = useState<string | null>(null);
  const [lastImageReferences, setLastImageReferences] = useState<MetaAdImageReferenceSummary[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const { wpPages, wpPagesLoading, pageBucketHostedLink, loadWpPagesForPicker } =
    usePpcMetaWorkspacePages({ site, teamName });

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

  const applyGeneratedResult = useCallback(
    (rowId: string, sourceRow: MetaAdRow, result: Awaited<Parameters<typeof applyPpcMetaGeneratedResult>[0]["result"]>) => {
      applyPpcMetaGeneratedResult({
        rowId,
        sourceRow,
        result,
        updateAd,
        setLastImagePromptDescription,
        setLastImageReferences,
      });
    },
    [updateAd],
  );

  const handleGenerateAds = useCallback(async () => {
    if (isGenerating || !apiKey?.trim()) return;

    await executePpcMetaGenerateAds({
      abortRef,
      ads,
      apiKey,
      selectedModel,
      site,
      teamName,
      generateConfig,
      setAds,
      setIsGenerating,
      setGenerateProgress,
      updateAd,
      applyGeneratedResult,
    });
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

      await executePpcMetaGenerateAdRow({
        abortRef,
        rowId,
        sourceRow,
        apiKey,
        selectedModel,
        site,
        teamName,
        generateConfig,
        setIsGenerating,
        setGenerateProgress,
        updateAd,
        applyGeneratedResult,
      });
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
