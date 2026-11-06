import React, { useCallback, useMemo } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";
import { SapGeneratorWorkspaceHeader } from "@/components/sap-generator/SapGeneratorWorkspaceHeader";
import { BLOG_GENERATOR_WORKSPACE_BODY_CLASS, BLOG_GENERATOR_WORKSPACE_HEADER_CLASS } from "@/components/keyword-research/blog-generator-tab-classes";
import { EntitySubmodePills } from "@/components/sap-generator/EntitySubmodePills";
import type { EntityGeneratorSubmode } from "@/components/sap-generator/entity-generator-submode";
import { LOCAL_ANALYSIS_DEFAULT_SAP_PAGES as DEFAULT_SAP_PAGES } from "@/lib/local-analysis-target-constants";

import type { KeywordTargetRow, LocalAnalysisWorkspaceControls, SapGeneratorLocalWorkspaceMode } from "@/components/sap-generator/local-analysis-helpers";
import { BULK_GENERATOR_EMPTY_ROW_COUNT } from "@/components/keyword-research/blog-generator-tab-classes";
import { resolveEntityDetailsCurrentRow } from "@/lib/local-analysis/entity-details-current-row";
import { cn } from "@/lib/utils";
import { BulkEntityWorkspaceBody } from "@/components/keyword-research/bulk/BulkEntityWorkspaceBody";
import { ENTITY_DETAILS_PIPELINE_SECTION_TITLES } from "@/components/sap-generator/LocalAnalysisDetailsPanel";
import { buildEntityClusterLiveHarnessSections, ENTITY_CLUSTER_PIPELINE_TITLES } from "@/lib/overview/overview-content-prep-harness-sections";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";

export type {
  KeywordTargetRow,
  LocalAnalysisWorkspaceControls,
  SapGeneratorLocalWorkspaceMode,
} from "@/components/sap-generator/local-analysis-helpers";
import { useLocalAnalysisState } from "@/components/sap-generator/use-local-analysis-state";
import { useLocalAnalysisEffects } from "@/components/sap-generator/use-local-analysis-effects";
import { useLocalAnalysisCsvPipeline } from "@/components/sap-generator/use-local-analysis-csv-pipeline";
import { useLocalAnalysisRun } from "@/components/sap-generator/use-local-analysis-run";
import { useLocalAnalysisClusters } from "@/components/sap-generator/use-local-analysis-clusters";

/** Per-keyword SAP default for new rows (not the campaign total in DEFAULT_SAP_PAGES). */
export interface LocalAnalysisPanelProps {
  site: WordPressSite;
  workspace: LocalAnalysisWorkspaceControls;
  activeSection: BlogGeneratorSectionId;
  onSectionChange: (id: BlogGeneratorSectionId) => void;
  apiKey: string;
  dataForSEOApiKey: string;
  selectedModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  flowPurpose?: string;
  entitySubmode: EntityGeneratorSubmode;
  onEntitySubmodeChange: (mode: EntityGeneratorSubmode) => void;
}

export const LocalAnalysisPanel: React.FC<LocalAnalysisPanelProps> = (props) => {
  const { activeSection, onSectionChange, entitySubmode, onEntitySubmodeChange } = props;
  const s = useLocalAnalysisState(props);
  const {
    site,
    workspace,
    portfolioSites,
    quarterEditorialBySiteId,
    apiKey,
    dataForSEOApiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    flowPurpose,
    uploadLabel,
    setUploadLabel,
    csvParsing,
    setCsvParsing,
    gridSummaryMarkdown,
    setGridSummaryMarkdown,
    gridKeywordWeights,
    setGridKeywordWeights,
    gridPlaceWeaknessWeights,
    setGridPlaceWeaknessWeights,
    csvPlaceHints,
    setCsvPlaceHints,
    gridCsvFullText,
    setGridCsvFullText,
    businessName,
    setBusinessName,
    keywordTargets,
    setKeywordTargets,
    sapRows,
    setSapRows,
    entitySelectedRowIndices,
    setEntitySelectedRowIndices,
    sitemapInventoryLinks,
    setSitemapInventoryLinks,
    sitemapLinksRef,
    gscKeywordsHostedLink,
    setGscKeywordsHostedLink,
    gscLinkRef,
    entityKeywordSourcesRef,
    strategyMarkdown,
    setStrategyMarkdown,
    questionsByKeyword,
    setQuestionsByKeyword,
    isAnalyzing,
    setIsAnalyzing,
    suggestLoading,
    setSuggestLoading,
    headerProgress,
    setHeaderProgress,
    pipelineErrorMessage,
    setPipelineErrorMessage,
    sitePrepLoading,
    setSitePrepLoading,
    entityTotalCountInput,
    setEntityTotalCountInput,
    suggestFocusKeyword,
    setSuggestFocusKeyword,
    suggestFocusLocation,
    setSuggestFocusLocation,
    editorialCountSites,
    useBlindMagicKeywords,
    setUseBlindMagicKeywords,
    entityGeographicLevel,
    setEntityGeographicLevel,
    entityTypeFocus,
    setEntityTypeFocus,
    wikiByTargetId,
    setWikiByTargetId,
    wikiBySapRowIndex,
    setWikiBySapRowIndex,
    wikiHintCacheRef,
    wikiByTargetIdRef,
    primaryWikiAugmentLabel,
    setPrimaryWikiAugmentLabel,
    granularPoolTitles,
    setGranularPoolTitles,
    showBlindMagicKeywords,
    isTempWorkspace,
    researchModel,
    openRouterKey,
    workspaceBusy,
    clusterProgressPctRef,
    handleApplyRemainingEntityCount,
    maxSapBudget,
    sapRowsRef,
    neighbourhoodLayoutKeyRef,
    neighbourhoodPlanGenerationRef,
    placeWeaknessForSuggest,
    gridCsvWikipediaAugment,
    gridLocations,
    mergedWikipediaSearchAugment,
    progressSnapshot,
    commitSitemapInventoryLinks,
    commitGscKeywordsHostedLink,
    clearGscKeywordsHostedLink,
    applySitePrepFromWarm,
    loadSitePrep,
    loadSitePrepAndGsc,
  } = s;
  const fx = useLocalAnalysisEffects(s);
  const { clearLocalAnalysis, canOpenDetails } = fx;
  const csvPipeline = useLocalAnalysisCsvPipeline(s, fx);
  const { onPickFile } = csvPipeline;
  const { runAnalysis } = useLocalAnalysisRun(s, fx, csvPipeline.assignUniqueEntitySapKeywords);
  const { runClusters, downloadHeaderTargetsCsv, updateSapRowAt, hasSapRowsForCsv } =
    useLocalAnalysisClusters(s, fx);
  const entityListRows = useMemo(
    () => sapRows.slice(0, maxSapBudget),
    [sapRows, maxSapBudget],
  );
  const hasTitledSapRows = entityListRows.some((r) => r.title?.trim());
  const hasGeneratedSapRows = entityListRows.some(
    (r) => r.entity?.trim() || r.keyword?.trim() || r.title?.trim(),
  );
  const entityPreloadMode = hasGeneratedSapRows && !hasTitledSapRows;
  const entityHarnessByRow = useMemo(() => {
    const map = new Map<number, BulkHarnessSectionUi[]>();
    entityListRows.forEach((row, index) => {
      const keyword = row.keyword?.trim();
      const title = row.title?.trim();
      const meta = row.meta_description?.trim();
      if (!keyword && !title && !meta) return;
      const sections: BulkHarnessSectionUi[] = [];
      if (keyword) {
        sections.push({
          sectionIndex: 0,
          title: ENTITY_CLUSTER_PIPELINE_TITLES[0],
          status: "done",
          markdown: keyword,
        });
      }
      if (title) {
        sections.push({
          sectionIndex: 1,
          title: ENTITY_CLUSTER_PIPELINE_TITLES[1],
          status: "done",
          markdown: title,
        });
      }
      if (meta) {
        sections.push({
          sectionIndex: 2,
          title: ENTITY_CLUSTER_PIPELINE_TITLES[2],
          status: "done",
          markdown: meta,
        });
      }
      if (sections.length > 0) map.set(index, sections);
    });
    return map;
  }, [entityListRows]);

  const entityLiveHarnessSections = useMemo((): BulkHarnessSectionUi[] => {
    if (!workspaceBusy || !headerProgress) return [];
    if (
      headerProgress.kind === "generate" &&
      (headerProgress.titleHarnessGroups?.length ?? 0) > 0
    ) {
      return [];
    }
    const phase = headerProgress.phase?.trim();
    if (!phase) return [];
    if (headerProgress.kind === "suggest" || headerProgress.kind === "csv") {
      const clusterSections = buildEntityClusterLiveHarnessSections(phase);
      if (clusterSections.length > 0) return clusterSections;
    }
    return [
      {
        sectionIndex: 0,
        title: ENTITY_DETAILS_PIPELINE_SECTION_TITLES[0],
        status: "generating",
        markdown: phase,
      },
    ];
  }, [workspaceBusy, headerProgress]);

  const entityDetailsLiveMessage = useMemo(() => {
    if (pipelineErrorMessage?.trim()) return pipelineErrorMessage.trim();
    if (!workspaceBusy || !headerProgress?.phase?.trim()) return null;
    return headerProgress.phase.trim();
  }, [pipelineErrorMessage, workspaceBusy, headerProgress]);
  const entityDetailsCurrentRow = useMemo(
    () =>
      resolveEntityDetailsCurrentRow(
        headerProgress,
        workspaceBusy,
        entityListRows.length,
      ),
    [headerProgress, workspaceBusy, entityListRows.length],
  );
  /** Same as Prompt / PR: pad with placeholder stripes; no outer scroll until the list is full. */
  const entityPlaceholderOnlyBody =
    !hasGeneratedSapRows || entityListRows.length < BULK_GENERATOR_EMPTY_ROW_COUNT;

  const downloadLocalMarkdownFile = useCallback((content: string, baseName: string) => {
    const safe = baseName.replace(/[^\w-]+/g, "-").slice(0, 80) || "export";
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safe}-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return (
    <>
      <div className={BLOG_GENERATOR_WORKSPACE_HEADER_CLASS}>
      <SapGeneratorWorkspaceHeader
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        titleRowMenu={
          <EntitySubmodePills
            submode={entitySubmode}
            onSubmodeChange={onEntitySubmodeChange}
            disabled={workspaceBusy}
          />
        }
        workspace={workspace}
        workspaceBusy={workspaceBusy}
        progressSnapshot={progressSnapshot}
        canOpenDetails={canOpenDetails}
        isProcessing={workspaceBusy}
        csvParsing={csvParsing}
        uploadLabel={uploadLabel}
        entityTotalCountInput={entityTotalCountInput}
        onEntityTotalCountInputChange={setEntityTotalCountInput}
        suggestFocusKeyword={suggestFocusKeyword}
        onSuggestFocusKeywordChange={setSuggestFocusKeyword}
        suggestFocusLocation={suggestFocusLocation}
        onSuggestFocusLocationChange={setSuggestFocusLocation}
        runLoading={suggestLoading}
        onPickFile={onPickFile}
        onRunClusters={() => void runClusters()}
        onClear={clearLocalAnalysis}
        entityGeographicLevel={entityGeographicLevel}
        entityTypeFocus={entityTypeFocus}
        onEntityTypeFocusChange={setEntityTypeFocus}
        hasSapRowsForCsv={hasSapRowsForCsv}
        onDownloadTargetsCsv={() => void downloadHeaderTargetsCsv()}
        showBlindMagicKeywords={showBlindMagicKeywords}
        useBlindMagicKeywords={useBlindMagicKeywords}
        onUseBlindMagicKeywordsChange={setUseBlindMagicKeywords}
        onApplyRemainingEntityCount={handleApplyRemainingEntityCount}
        detailsProps={{
          headerProgress,
          uploadLabel,
          keywordTargetCount: keywordTargets.filter((r) => r.keyword.trim()).length,
          sapRowCount: sapRows.length,
          entityGeographicLevel,
          entityTypeFocus,
          gridSummaryMarkdown,
          strategyMarkdown,
          hasSapRowsForCsv,
          displayRows: entityListRows,
          currentRow: entityDetailsCurrentRow,
          isProcessing: workspaceBusy,
          status: pipelineErrorMessage?.trim() || headerProgress?.phase?.trim() || "",
          harnessSections: entityLiveHarnessSections,
          harnessByRow: entityHarnessByRow,
          harnessPlannedSectionCount: null,
          pipelineSectionTitles:
            suggestLoading || csvParsing
              ? [...ENTITY_CLUSTER_PIPELINE_TITLES]
              : [...ENTITY_DETAILS_PIPELINE_SECTION_TITLES],
          liveMessage: entityDetailsLiveMessage,
          sitemapInventoryLinks,
          gscHostedLink: gscKeywordsHostedLink,
          sitemapInventoryLoading: sitePrepLoading,
          onDownloadTargetsCsv: () => void downloadHeaderTargetsCsv(),
          onDownloadStrategyMarkdown: () =>
            downloadLocalMarkdownFile(strategyMarkdown, `local-grid-strategy-${site.name}`),
        }}
      />
      </div>

      <div
        className={cn(
          BLOG_GENERATOR_WORKSPACE_BODY_CLASS,
          "relative flex flex-col",
          entityPlaceholderOnlyBody && "overflow-y-hidden",
        )}
      >
        <BulkEntityWorkspaceBody
          hasGeneratedSapRows={hasGeneratedSapRows}
          entityPreloadMode={entityPreloadMode}
          generatedRows={entityListRows}
          selectedRowIndices={entitySelectedRowIndices}
          setSelectedRowIndices={setEntitySelectedRowIndices}
          isGenerating={isAnalyzing}
          isProcessing={workspaceBusy}
          showBusySpinner={isAnalyzing}
          onRowChange={updateSapRowAt}
          directionsSiteName={businessName.trim() || site.name?.trim() || ""}
        />
      </div>
    </>
  );
};
