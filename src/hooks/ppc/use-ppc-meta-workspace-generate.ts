import type { Dispatch, SetStateAction } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import {
  clampMetaAdCount,
  metaRowPatchFromGenerated,
  metaRowUserInputPreserve,
  resolveMetaRowContextSource,
  type MetaAdRow,
  type MetaGenerateConfig,
} from "@/lib/ppc/meta-ads-types";
import type { MetaGenerateProgressState } from "@/lib/ppc/meta-ads-progress-types";
import {
  resolveMetaGenerateVisualToolPaletteForGenerate,
} from "@/lib/ppc/meta-ad-generate-config-defaults";
import {
  resolveMetaAdRowColorPalette,
} from "@/lib/ppc/meta-ad-color-themes";
import {
  resolveMetaAdRowVisualToolPalette,
} from "@/lib/ppc/meta-ad-visual-tool-themes";
import {
  emptyVisualToolPalette,
  migrateLegacyPeopleToolPalette,
  resolveAllowPeopleInImage,
} from "@/lib/ppc/meta-ad-visual-tool-palette";
import { resolveMetaTypographyStyle } from "@/lib/ppc/meta-ad-typography-styles";
import {
  metaRowHasGenerateInput,
} from "@/lib/ppc/neo-pulse-meta-marketing-context";
import { runPpcMetaAdGenerate } from "@/lib/ppc/run-ppc-meta-ad-generate";
import { runPpcMetaAdGenerateBatch } from "@/lib/ppc/run-ppc-meta-ad-generate-batch";
import type { MetaAdImageReferenceSummary } from "@/lib/ppc/meta-ad-image-reference-types";

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

export function applyPpcMetaGeneratedResult(args: {
  rowId: string;
  sourceRow: MetaAdRow;
  result: Awaited<ReturnType<typeof runPpcMetaAdGenerate>>;
  updateAd: (id: string, patch: Partial<MetaAdRow>) => void;
  setLastImagePromptDescription: Dispatch<SetStateAction<string | null>>;
  setLastImageReferences: Dispatch<SetStateAction<MetaAdImageReferenceSummary[]>>;
}): void {
  const {
    rowId,
    sourceRow,
    result,
    updateAd,
    setLastImagePromptDescription,
    setLastImageReferences,
  } = args;
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
}

export async function executePpcMetaGenerateAds(args: {
  abortRef: { current: AbortController | null };
  ads: MetaAdRow[];
  apiKey: string;
  selectedModel: string;
  site: WordPressSite;
  teamName: string | null;
  generateConfig: MetaGenerateConfig;
  setAds: Dispatch<SetStateAction<MetaAdRow[]>>;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
  setGenerateProgress: Dispatch<SetStateAction<MetaGenerateProgressState | null>>;
  updateAd: (id: string, patch: Partial<MetaAdRow>) => void;
  applyGeneratedResult: (
    rowId: string,
    sourceRow: MetaAdRow,
    result: Awaited<ReturnType<typeof runPpcMetaAdGenerate>>,
  ) => void;
}): Promise<void> {
  const {
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
  } = args;
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
          if (outcome.ok === true) {
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
}

export async function executePpcMetaGenerateAdRow(args: {
  abortRef: { current: AbortController | null };
  rowId: string;
  sourceRow: MetaAdRow;
  apiKey: string;
  selectedModel: string;
  site: WordPressSite;
  teamName: string | null;
  generateConfig: MetaGenerateConfig;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
  setGenerateProgress: Dispatch<SetStateAction<MetaGenerateProgressState | null>>;
  updateAd: (id: string, patch: Partial<MetaAdRow>) => void;
  applyGeneratedResult: (
    rowId: string,
    sourceRow: MetaAdRow,
    result: Awaited<ReturnType<typeof runPpcMetaAdGenerate>>,
  ) => void;
}): Promise<void> {
  const {
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
  } = args;
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
}
