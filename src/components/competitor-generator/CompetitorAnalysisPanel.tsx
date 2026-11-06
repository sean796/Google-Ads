import React, { useCallback, useMemo, useState } from "react";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import type { WordPressSite } from "@/components/integrations/types";
import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";
import { CompetitorGeneratorWorkspaceHeader } from "@/components/competitor-generator/CompetitorGeneratorWorkspaceHeader";
import {
  COMPETITOR_DEFAULT_BUDGET_INPUT,
  parseCompetitorBudgetInput,
} from "@/components/competitor-generator/competitor-budget-input";
import { BulkEntityWorkspaceBody } from "@/components/keyword-research/bulk/BulkEntityWorkspaceBody";
import { useCompetitorGeneration } from "@/components/competitor-generation/hooks/useCompetitorGeneration";
import { useCompetitorGridCsv } from "@/components/competitor-generation/hooks/useCompetitorGridCsv";
import type { CompetitorWorkspaceControls } from "@/components/competitor-generation/types";
import { buildCompetitorMicroSnapshot } from "@/lib/competitor-research/competitor-comparison-harness-state";
import { allRowIndicesSet } from "@/lib/bulk-processing-order";
import { downloadLocalAnalysisBulkCsv } from "@/lib/local-analysis-csv-export";
import {
  BULK_GENERATOR_EMPTY_ROW_COUNT,
  BLOG_GENERATOR_WORKSPACE_BODY_CLASS,
  BLOG_GENERATOR_WORKSPACE_HEADER_CLASS,
} from "@/components/keyword-research/blog-generator-tab-classes";
import { EntitySubmodePills } from "@/components/sap-generator/EntitySubmodePills";
import type { EntityGeneratorSubmode } from "@/components/sap-generator/entity-generator-submode";
import type { LocalAnalysisWorkspaceControls } from "@/components/sap-generator/LocalAnalysisPanel";
import { discoverCompetitorPlacesFromDfs } from "@/lib/competitor-research/discover-competitor-places-from-dfs";
import {
  logClustersButtonPress,
  logClustersPipeline,
} from "@/lib/local-analysis/entity-clusters-console-log";
import { useOverviewSiteWarmDetails } from "@/hooks/overview/use-overview-site-warm-details";
import { cn } from "@/lib/utils";

export type CompetitorAnalysisPanelProps = {
  site: WordPressSite;
  workspace: LocalAnalysisWorkspaceControls;
  activeSection: BlogGeneratorSectionId;
  onSectionChange: (id: BlogGeneratorSectionId) => void;
  entitySubmode: EntityGeneratorSubmode;
  onEntitySubmodeChange: (mode: EntityGeneratorSubmode) => void;
};

export function CompetitorAnalysisPanel({
  site,
  workspace,
  activeSection,
  onSectionChange,
  entitySubmode,
  onEntitySubmodeChange,
}: CompetitorAnalysisPanelProps) {
  const {
    gridPlaces,
    gridCsvName,
    csvParsing,
    loadGridCsvFile,
    clearGridCsv,
  } = useCompetitorGridCsv();

  const {
    isGenerating,
    progress,
    generatedRows,
    handleGenerate,
    clearResults,
    updateGeneratedRowAt,
  } = useCompetitorGeneration();

  const [sapPageBudgetInput, setSapPageBudgetInput] = useState(COMPETITOR_DEFAULT_BUDGET_INPUT);
  const [suggestFocusKeyword, setSuggestFocusKeyword] = useState("");
  const [entitySelectedRowIndices, setEntitySelectedRowIndices] = useState<Set<number>>(() => new Set());
  const [clustersRunBusy, setClustersRunBusy] = useState(false);

  const {
    sitemapInventoryLinks,
    gscHostedLink,
    sitemapInventoryLoading,
  } = useOverviewSiteWarmDetails(site);

  const workspaceBusy = isGenerating || csvParsing || clustersRunBusy;
  const hasGeneratedRows = generatedRows.length > 0;
  const competitorIdleEmptyStripes =
    !hasGeneratedRows || generatedRows.length < BULK_GENERATOR_EMPTY_ROW_COUNT;

  const progressSnapshot = useMemo(() => {
    if (progress?.currentMessage?.trim()) {
      return buildCompetitorMicroSnapshot({
        phase: progress.currentMessage,
        harnessGroups: progress.harnessGroups ?? [],
      });
    }
    if (workspaceBusy) {
      return {
        label: "Competitor clusters",
        completed: 0,
        total: 1,
        progressPct: 0,
        statusMessage: clustersRunBusy ? "Discovering from Google Search…" : undefined,
      };
    }
    return null;
  }, [progress, clustersRunBusy, workspaceBusy]);

  const gridUploadLabel = gridCsvName ?? "";

  const onDownloadTargetsCsv = useCallback(() => {
    if (generatedRows.length === 0) return;
    const siteName = site.name?.trim();
    if (!siteName) return;
    downloadLocalAnalysisBulkCsv(generatedRows, `competitor-${siteName}`, {
      marketHint: suggestFocusKeyword.trim() || undefined,
    });
  }, [generatedRows, site.name, suggestFocusKeyword]);

  const onRunClusters = useCallback(() => {
    const parsedCount = parseCompetitorBudgetInput(sapPageBudgetInput);
    const keywordTrim = suggestFocusKeyword.trim();
    logClustersButtonPress("competitors", {
      site: {
        id: site.id,
        name: site.name,
        siteUrl: site.siteUrl,
        enabled: site.enabled,
      },
      sapPageBudgetInput,
      parsedCompetitorCount: parsedCount,
      suggestFocusKeyword: keywordTrim,
      gridCsvName,
      gridPlacesCount: gridPlaces.length,
      gridPlacesPreview: gridPlaces.slice(0, 25).map((p) => ({
        businessName: p.businessName,
        dfsKeyword: p.dfsKeyword,
        rank: p.rank,
      })),
      discoverySource: gridPlaces.length > 0 ? "grid-csv" : "dataforseo-organic",
      generatedRowsBeforeRun: generatedRows.length,
      workspaceBusy,
      sitemapInventoryLinkCount: sitemapInventoryLinks.length,
      gscHostedLink: gscHostedLink
        ? {
            filename: gscHostedLink.filename,
            rowCount: gscHostedLink.rowCount,
            label: gscHostedLink.label,
          }
        : null,
      sitemapInventoryLoading,
    });

    const count = parsedCount;
    if (count === null) {
      logClustersPipeline("competitors", "blocked", { reason: "invalid_competitor_count" });
      notify.error("Enter a competitor count.");
      return;
    }
    const keyword = keywordTrim;
    if (!keyword) {
      logClustersPipeline("competitors", "blocked", { reason: "missing_keyword" });
      notify.error("Enter a keyword.");
      return;
    }
    void (async () => {
      setClustersRunBusy(true);
      try {
        logClustersPipeline("competitors", "run_started", {
          keyword,
          count,
          discoverySource: gridPlaces.length > 0 ? "grid-csv" : "dataforseo-organic",
        });
        const places =
          gridPlaces.length > 0
            ? gridPlaces
            : await discoverCompetitorPlacesFromDfs({ site, keyword, limit: count });
        logClustersPipeline("competitors", "places_ready", {
          placeCount: places.length,
          placesPreview: places.slice(0, 25).map((p) => ({
            businessName: p.businessName,
            dfsKeyword: p.dfsKeyword,
            rank: p.rank,
          })),
        });
        await handleGenerate(site, places, keyword, count, undefined, (rows) => {
          logClustersPipeline("competitors", "rows_update", { rowCount: rows.length });
          setEntitySelectedRowIndices(allRowIndicesSet(rows.length));
        });
        logClustersPipeline("competitors", "run_finished");
      } catch (e) {
        logClustersPipeline("competitors", "run_failed", {
          message: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined,
        });
        notifyHeaderError(e, "Competitor discovery failed");
      } finally {
        setClustersRunBusy(false);
      }
    })();
  }, [
    handleGenerate,
    site,
    gridPlaces,
    gridCsvName,
    sapPageBudgetInput,
    suggestFocusKeyword,
    generatedRows.length,
    workspaceBusy,
    sitemapInventoryLinks.length,
    gscHostedLink,
    sitemapInventoryLoading,
  ]);

  const onClear = useCallback(() => {
    clearGridCsv();
    clearResults();
    setSapPageBudgetInput(COMPETITOR_DEFAULT_BUDGET_INPUT);
    setSuggestFocusKeyword("");
    setEntitySelectedRowIndices(new Set());
  }, [clearGridCsv, clearResults]);

  const onPickFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      const count = parseCompetitorBudgetInput(sapPageBudgetInput);
      if (count === null) {
        notify.error("Enter a competitor count before uploading a grid CSV.");
        return;
      }
      void (async () => {
        const loaded = await loadGridCsvFile(file, count, site);
        if (loaded.ok && loaded.keyword) {
          setSuggestFocusKeyword(loaded.keyword);
        }
      })();
    },
    [loadGridCsvFile, sapPageBudgetInput, site],
  );

  const updateSapRowAt = useCallback(
    (globalIdx: number, patch: Partial<CSVRow>) => {
      updateGeneratedRowAt(globalIdx, patch);
    },
    [updateGeneratedRowAt],
  );

  const competitorWorkspace = workspace as CompetitorWorkspaceControls;

  return (
    <>
      <div className={BLOG_GENERATOR_WORKSPACE_HEADER_CLASS}>
        <CompetitorGeneratorWorkspaceHeader
          activeSection={activeSection}
          onSectionChange={onSectionChange}
          titleRowMenu={
            <EntitySubmodePills
              submode={entitySubmode}
              onSubmodeChange={onEntitySubmodeChange}
              disabled={workspaceBusy}
            />
          }
          workspace={competitorWorkspace}
          workspaceBusy={workspaceBusy}
          progressSnapshot={progressSnapshot}
          canOpenDetails
          isProcessing={workspaceBusy}
          csvParsing={csvParsing}
          uploadLabel={gridUploadLabel}
          sapPageBudgetInput={sapPageBudgetInput}
          onSapPageBudgetInputChange={setSapPageBudgetInput}
          suggestFocusKeyword={suggestFocusKeyword}
          onSuggestFocusKeywordChange={setSuggestFocusKeyword}
          runLoading={isGenerating || clustersRunBusy}
          onPickFile={onPickFile}
          onRunClusters={onRunClusters}
          onClear={onClear}
          hasSapRowsForCsv={generatedRows.length > 0}
          onDownloadTargetsCsv={onDownloadTargetsCsv}
          detailsProps={{
            workspaceBusy,
            progress,
            displayRows: generatedRows,
            keyword: suggestFocusKeyword,
            sitemapInventoryLinks,
            gscHostedLink,
            sitemapInventoryLoading,
          }}
        />
      </div>

      <div
        className={cn(
          BLOG_GENERATOR_WORKSPACE_BODY_CLASS,
          "relative flex flex-col",
          competitorIdleEmptyStripes && "overflow-y-hidden",
        )}
      >
        <BulkEntityWorkspaceBody
          hasGeneratedSapRows={hasGeneratedRows}
          entityPreloadMode={false}
          generatedRows={generatedRows}
          selectedRowIndices={entitySelectedRowIndices}
          setSelectedRowIndices={setEntitySelectedRowIndices}
          isGenerating={isGenerating}
          isProcessing={workspaceBusy}
          showBusySpinner={false}
          onRowChange={updateSapRowAt}
          directionsSiteName={site.name?.trim() || ""}
        />
      </div>
    </>
  );
}
