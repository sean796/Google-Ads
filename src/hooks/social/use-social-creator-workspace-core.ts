import { useCallback, useEffect, useRef, useState } from "react";
import { useTeam } from "@/contexts/TeamContext";
import { clampSocialPostCount, createIdleSocialCreatorRow, socialRowPatchFromGenerated, socialRowUserInputPreserve, SOCIAL_POST_COUNT_MIN, resolveMetaRowContextSource, type SocialCreatorRow, type SocialGenerateConfig } from "@/lib/social/social-creator-types";
import type { SocialGenerateProgressState } from "@/lib/social/social-creator-progress-types";
import { clearSocialCreatorSessionCache, getSocialCreatorSessionCache } from "@/lib/social/social-creator-session-cache";
import { readSocialGenerateConfig } from "@/lib/social/social-creator-field-limits";
import type { MetaAdImageReferenceSummary } from "@/lib/ppc/meta-ad-image-reference-types";
import { syncSocialCreatorRowsToCount } from "@/lib/social/sync-social-creator-rows";
import { resolveMetaAdRowColorPalette, rowUsesHeaderColorTheme } from "@/lib/ppc/meta-ad-color-themes";
import { cloneVisualToolPalette } from "@/lib/ppc/meta-ad-visual-tool-palette";
import { resolveMetaTypographyStyle } from "@/lib/ppc/meta-ad-typography-styles";
import { metaRowHasGenerateInput } from "@/lib/ppc/neo-pulse-meta-marketing-context";
import { runSocialCreatorGenerate } from "@/lib/social/run-social-creator-generate";
import { runSocialCreatorGenerateBatch } from "@/lib/social/run-social-creator-generate-batch";
import { parseMetaKeywordTemplateCsv } from "@/lib/social/social-creator-keyword-template";
import { resolveRowGenerateVisualInputs } from "@/hooks/social/social-creator-workspace-visual-inputs";
import type { UseSocialCreatorWorkspaceOptions } from "@/hooks/social/social-creator-workspace-types";
import { useSocialCreatorLandingPages } from "@/hooks/social/use-social-creator-landing-pages";
import { useSocialCreatorDisplayPosts } from "@/hooks/social/use-social-creator-display-posts";
import { useSocialCreatorPersistence } from "@/hooks/social/use-social-creator-persistence";
import { useSocialCreatorExportHandlers } from "@/hooks/social/use-social-creator-export-handlers";

export function useSocialCreatorWorkspaceCore({ site, apiKey, selectedModel }: UseSocialCreatorWorkspaceOptions) {
  const { activeTeam } = useTeam();
  const teamName = activeTeam?.name ?? null;
  const [posts, setPosts] = useState<SocialCreatorRow[]>(() => getSocialCreatorSessionCache(site.id) ?? []);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [gridPageIndex, setGridPageIndex] = useState(0);
  const [generateConfig, setGenerateConfig] = useState<SocialGenerateConfig>(() =>
    readSocialGenerateConfig(site.id),
  );
  const [generateProgress, setGenerateProgress] = useState<SocialGenerateProgressState | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastImagePromptDescription, setLastImagePromptDescription] = useState<string | null>(null);
  const [lastImageReferences, setLastImageReferences] = useState<MetaAdImageReferenceSummary[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const defaultColorPalette = generateConfig.defaultColorPalette;

  const syncRowsToCount = useCallback(
    (rows: SocialCreatorRow[], targetCount: number) => syncSocialCreatorRowsToCount(rows, targetCount),
    [],
  );

  useEffect(() => {
    const config = readSocialGenerateConfig(site.id);
    setPosts(syncRowsToCount(getSocialCreatorSessionCache(site.id) ?? [], clampSocialPostCount(config.postCount)));
    setExpandedPostId(null);
    setGridPageIndex(0);
    setGenerateProgress(null);
    setIsGenerating(false);
    setGenerateConfig(config);
  }, [site.id, syncRowsToCount]);
  const { wpPages, wpPagesLoading, pageBucketHostedLink, loadWpPagesForPicker } = useSocialCreatorLandingPages({ site, teamName, generateConfig });
  useSocialCreatorPersistence({ site, generateConfig, posts });
  useEffect(() => {
    const target = clampSocialPostCount(generateConfig.postCount);
    setPosts((prev) => syncRowsToCount(prev, target));
  }, [generateConfig.postCount, syncRowsToCount]);
  const { displayPosts, sortColumn, setSortColumn, sortDir, setSortDir } = useSocialCreatorDisplayPosts({ posts });
  useEffect(() => {
    setGridPageIndex(0);
  }, [sortColumn, sortDir, posts.length]);
  const toggleExpandedPostId = useCallback((id: string) => {
    setExpandedPostId((prev) => (prev === id ? null : id));
  }, []);

  const updatePost = useCallback((id: string, patch: Partial<SocialCreatorRow>) => {
    setPosts((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }, []);

  const handleDeletePost = useCallback(
    (id: string) => {
      if (isGenerating) return;

      if (posts.length <= SOCIAL_POST_COUNT_MIN) {
        setPosts((prev) =>
          prev.map((row) => (row.id === id ? createIdleSocialCreatorRow() : row)),
        );
      } else {
        const remaining = posts.filter((row) => row.id !== id);
        const newCount = clampSocialPostCount(remaining.length);
        setGenerateConfig((prev) => ({ ...prev, postCount: newCount }));
        setPosts(syncRowsToCount(remaining, newCount));
      }

      setExpandedPostId((prev) => (prev === id ? null : prev));
      setGenerateProgress(null);
      setLastImagePromptDescription(null);
      setLastImageReferences([]);
    },
    [posts, isGenerating, syncRowsToCount],
  );

  const setWorkspaceVisualDefaults = useCallback(
    (defaults: Pick<
      SocialGenerateConfig,
      "defaultColorPalette" | "defaultVisualToolPalette" | "defaultVisualToolMode" | "defaultTypographyStyle"
    >) => {
      const nextColors = { ...defaults.defaultColorPalette };
      const nextTools = cloneVisualToolPalette(defaults.defaultVisualToolPalette);
      const nextTypographyStyle = resolveMetaTypographyStyle(defaults.defaultTypographyStyle);
      setGenerateConfig((prev) => ({
        ...prev,
        defaultColorPalette: nextColors,
        defaultVisualToolPalette: nextTools,
        defaultVisualToolMode: defaults.defaultVisualToolMode,
        defaultTypographyStyle: nextTypographyStyle,
      }));
      setPosts((prev) =>
        prev.map((row) => {
          if (!rowUsesHeaderColorTheme(row.colorPalette)) return row;
          return { ...row, colorPalette: { ...nextColors } };
        }),
      );
    },
    [],
  );

  const handleClearAllPosts = useCallback(() => {
    if (isGenerating) return;
    const count = clampSocialPostCount(generateConfig.postCount);
    setPosts(Array.from({ length: count }, () => createIdleSocialCreatorRow()));
    setExpandedPostId(null);
    setGenerateProgress(null);
    setLastImagePromptDescription(null);
    setLastImageReferences([]);
    clearSocialCreatorSessionCache(site.id);
  }, [generateConfig.postCount, isGenerating, site.id]);
  const applyGeneratedResult = useCallback(
    (rowId: string, sourceRow: SocialCreatorRow, result: Awaited<ReturnType<typeof runSocialCreatorGenerate>>) => {
      setLastImagePromptDescription(result.imagePromptDescription ?? null);
      setLastImageReferences(result.imageReferences ?? []);
      updatePost(rowId, {
        status: "ready",
        createdAt: new Date().toISOString(),
        instagramGoal: result.goal,
        creativeBrief: result.creativeBrief,
        visualReferenceElements: result.visualReferenceElements,
        researchSections: result.researchSections,
        blueprint: result.blueprint,
        copyChecklist: result.copyChecklist,
        fbInstagramContent: result.fbInstagramContent,
        imageChecklist: result.imageChecklist,
        creative: result.creative,
        imagePromptDescription: result.imagePromptDescription,
        imageReferences: result.imageReferences,
        errorMessage: undefined,
        ...socialRowPatchFromGenerated(
          result.blueprint,
          result.fbInstagramContent,
          sourceRow.landingPageUrl ?? "",
          socialRowUserInputPreserve(sourceRow),
        ),
      });
    },
    [updatePost],
  );

  const handleGeneratePosts = useCallback(async () => {
    if (isGenerating || !apiKey?.trim()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const config: SocialGenerateConfig = {
      postCount: clampSocialPostCount(generateConfig.postCount),
      placement: generateConfig.placement,
      includeImage: generateConfig.includeImage,
      landingPageSource: generateConfig.landingPageSource,
      defaultColorPalette: generateConfig.defaultColorPalette,
      defaultVisualToolPalette: generateConfig.defaultVisualToolPalette,
      defaultVisualToolMode: generateConfig.defaultVisualToolMode,
      defaultTypographyStyle: generateConfig.defaultTypographyStyle,
    };

    const targetRows = posts.slice(0, config.postCount);
    const rowIds = targetRows.map((row) => row.id);

    const missingInput = targetRows.some((row) => !metaRowHasGenerateInput(row));
    if (missingInput) {
      setPosts((prev) =>
        prev.map((row, index) =>
          index < config.postCount && !metaRowHasGenerateInput(row)
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

    setPosts((prev) =>
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
        const result = await runSocialCreatorGenerate({
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
          onResearchSections: (sections) => updatePost(jobs[0]!.rowId, { researchSections: sections }),
          onPartialUpdate: (patch) => updatePost(jobs[0]!.rowId, patch),
          signal: controller.signal,
        });
        applyGeneratedResult(jobs[0]!.rowId, sourceRow, result);
      } else {
        const results = await runSocialCreatorGenerateBatch({
          site,
          apiKey,
          model: selectedModel,
          teamName,
          jobs,
          onProgress: setGenerateProgress,
          onResearchSections: (rowId, sections) => updatePost(rowId, { researchSections: sections }),
          onPartialUpdate: (rowId, patch) => updatePost(rowId, patch),
          signal: controller.signal,
        });

        for (const outcome of results) {
          if (outcome.ok === true) {
            const sourceRow = targetRows.find((row) => row.id === outcome.rowId);
            if (sourceRow) {
              applyGeneratedResult(outcome.rowId, sourceRow, outcome.result);
            }
          } else {
            updatePost(outcome.rowId, {
              status: "error",
              config: outcome.config,
              errorMessage: outcome.errorMessage,
            });
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Social post generation failed";
      setPosts((prev) =>
        prev.map((row) =>
          rowIds.includes(row.id) && row.status === "generating"
            ? { ...row, status: "error", errorMessage: message }
            : row,
        ),
      );
    } finally {
      setIsGenerating(false);
    }
  }, [posts, apiKey, applyGeneratedResult, generateConfig, isGenerating, selectedModel, site, teamName, updatePost]);

  const handleGeneratePostRow = useCallback(
    async (rowId: string) => {
      if (isGenerating || !apiKey?.trim()) return;

      const sourceRow = posts.find((row) => row.id === rowId);
      if (!sourceRow) return;

      if (!metaRowHasGenerateInput(sourceRow)) {
        updatePost(rowId, {
          status: "error",
          errorMessage: "Add a focus keyword, context URL, or NEO Pulse app context before generating.",
        });
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const rowConfig: SocialGenerateConfig = {
        postCount: 1,
        placement: generateConfig.placement,
        includeImage: generateConfig.includeImage,
        landingPageSource: generateConfig.landingPageSource,
        defaultColorPalette: generateConfig.defaultColorPalette,
        defaultVisualToolPalette: generateConfig.defaultVisualToolPalette,
        defaultVisualToolMode: generateConfig.defaultVisualToolMode,
        defaultTypographyStyle: generateConfig.defaultTypographyStyle,
      };
      const visualInputs = resolveRowGenerateVisualInputs(sourceRow, rowConfig);

      updatePost(rowId, {
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
        const result = await runSocialCreatorGenerate({
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
          onResearchSections: (sections) => updatePost(rowId, { researchSections: sections }),
          onPartialUpdate: (patch) => updatePost(rowId, patch),
          signal: controller.signal,
        });
        applyGeneratedResult(rowId, sourceRow, result);
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Social post generation failed";
        updatePost(rowId, {
          status: "error",
          config: rowConfig,
          errorMessage: message,
        });
      } finally {
        setIsGenerating(false);
      }
    },
    [posts, apiKey, applyGeneratedResult, generateConfig, isGenerating, selectedModel, site, teamName, updatePost],
  );

  const handleImportKeywords = useCallback(
    async (file: File) => {
      if (isGenerating) return;
      const importedRows = parseMetaKeywordTemplateCsv(await file.text());
      if (!importedRows.length) {
        setPosts((prev) => {
          if (!prev.length) return prev;
          const [first, ...rest] = prev;
          return [{ ...first!, status: "error" as const, errorMessage: "No keywords found in CSV." }, ...rest];
        });
        return;
      }

      const postCount = clampSocialPostCount(importedRows.length);
      setGenerateConfig((prev) => ({ ...prev, postCount }));
      setPosts((prev) =>
        syncRowsToCount(prev, postCount).map((row, index) => {
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
    setPosts((prev) =>
      prev.map((row) =>
        row.status === "generating" ? { ...row, status: "idle", errorMessage: undefined } : row,
      ),
    );
  }, []);
  const { bulkMicroSnapshot, gridPaginationTotal, paginationLayoutTotal, handleExportSocialCreatorCsv, canExportSocialCreatorCsv, handleExportSocialCreatorZip, canExportSocialCreatorZip } = useSocialCreatorExportHandlers({ isGenerating, generateProgress, displayPosts, posts, site });
  const workspaceBusy = isGenerating;
  return {
    site,
    posts,
    displayPosts,
    expandedPostId,
    toggleExpandedPostId,
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
    handleGeneratePosts,
    handleGeneratePostRow,
    handleCancelGenerate,
    handleImportKeywords,
    handleDeletePost,
    handleClearAllPosts,
    handleExportSocialCreatorCsv,
    canExportSocialCreatorCsv,
    handleExportSocialCreatorZip,
    canExportSocialCreatorZip,
    updatePost,
    bulkMicroSnapshot,
    workspaceBusy,
    gridPaginationTotal,
    paginationLayoutTotal,
    lastImagePromptDescription,
    lastImageReferences,
  };
}
