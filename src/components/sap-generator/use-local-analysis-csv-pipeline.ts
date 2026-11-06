import { useCallback } from "react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_OPENROUTER_IN_SETTINGS, notifyFileTooLargeMaxXMb, notifyGridLoadedXPoints } from "@/lib/notify-messages";
import { MAX_LOCAL_CSV_FILE_BYTES } from "@/lib/local-dominator-csv";
import { LOCAL_CSV_WORKER_FILE_BYTES_THRESHOLD, processLocalDominatorCsvText } from "@/lib/process-local-dominator-upload";
import { LOCAL_ANALYSIS_DEFAULT_SAP_PAGES as DEFAULT_SAP_PAGES } from "@/lib/local-analysis-target-constants";

import { PER_ROW_SAP_DEFAULT, newTargetRowId, type KeywordTargetRow, type LocalAnalysisWorkspaceControls, type SapGeneratorLocalWorkspaceMode } from "@/components/sap-generator/local-analysis-helpers";
import { fillEntitySapRowKeywordsFromInventoryAndGsc } from "@/lib/local-analysis/entity-sap-row-keyword-fill";
import { saveEntityGridCsv } from "@/lib/local-analysis/entity-grid-csv-store";
import { buildEntityTitleClusterJobsFromTargets, type EntityTitleClusterKeywordTarget } from "@/lib/local-analysis/entity-sap-title-cluster-jobs";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";

export type {
  KeywordTargetRow,
  LocalAnalysisWorkspaceControls,
  SapGeneratorLocalWorkspaceMode,
} from "@/components/sap-generator/local-analysis-helpers";

/** Per-keyword SAP default for new rows (not the campaign total in DEFAULT_SAP_PAGES). */
import type { LocalAnalysisState } from "@/components/sap-generator/use-local-analysis-state";
import type { LocalAnalysisEffects } from "@/components/sap-generator/use-local-analysis-effects";

export function useLocalAnalysisCsvPipeline(s: LocalAnalysisState, fx: LocalAnalysisEffects) {
  const {
    site,
    workspace,
    apiKey,
    uploadLabel,
    setUploadLabel,
    setCsvParsing,
    gridSummaryMarkdown,
    setGridSummaryMarkdown,
    gridKeywordWeights,
    setGridKeywordWeights,
    setGridPlaceWeaknessWeights,
    setCsvPlaceHints,
    setGridCsvFullText,
    businessName,
    setKeywordTargets,
    entityKeywordSourcesRef,
    setHeaderProgress,
    setSuggestFocusKeyword,
    setSuggestFocusLocation,
    entityTypeFocus,
    isTempWorkspace,
    researchModel,
    openRouterKey,
    gridLocations,
  } = s;

  const { resetAnalysisOutput, clientAudienceContextMarkdown } = fx;
const runCsvPipeline = useCallback(
  async (text: string, fileSizeHint: number, fileLabel = "") => {
    const useWorker = fileSizeHint >= LOCAL_CSV_WORKER_FILE_BYTES_THRESHOLD;
    setCsvParsing(true);
    setHeaderProgress({ kind: "csv", phase: "Parsing grid CSV…", completed: 0, total: 0 });
    try {
      const result = await processLocalDominatorCsvText(text, useWorker);
      if (result.ok === false) {
        notify.error(result.error);
        setUploadLabel("");
        setGridSummaryMarkdown("");
        setGridKeywordWeights([]);
        setGridPlaceWeaknessWeights([]);
        setCsvPlaceHints([]);
        setGridCsvFullText("");
        return;
      }
      setGridCsvFullText(text);
      setGridSummaryMarkdown(result.gridSummaryMarkdown);
      setGridKeywordWeights(result.gridKeywordWeights);
      setGridPlaceWeaknessWeights(result.placeWeaknessWeights);
      setCsvPlaceHints(result.placeHints);
      const gridLocationHint = result.placeHints.find((h) => h.trim())?.trim();
      if (gridLocationHint) {
        setSuggestFocusLocation(gridLocationHint);
      }
      if (result.dominantKeyword.trim()) {
        setSuggestFocusKeyword(result.dominantKeyword.trim());
      }
      void saveEntityGridCsv({
        siteId: site.id,
        uploadLabel: fileLabel,
        csvText: text,
      });
      setKeywordTargets(() => {
        const cid = newTargetRowId();
        return [
          {
            id: newTargetRowId(),
            keyword: "",
            entityHint: "",
            sapPages: PER_ROW_SAP_DEFAULT,
            clusterRole: "seed" as const,
            clusterId: cid,
          },
        ];
      });
      notify.success(notifyGridLoadedXPoints(result.loadedRowCount));
    } finally {
      setCsvParsing(false);
    }
  },
  [site.id, setCsvParsing, setCsvPlaceHints, setGridCsvFullText, setGridKeywordWeights, setGridPlaceWeaknessWeights, setGridSummaryMarkdown, setHeaderProgress, setKeywordTargets, setSuggestFocusKeyword, setSuggestFocusLocation, setUploadLabel],
);

const onPickFile = useCallback(
  (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_LOCAL_CSV_FILE_BYTES) {
      notify.error(notifyFileTooLargeMaxXMb(Math.round(MAX_LOCAL_CSV_FILE_BYTES / (1024 * 1024))));
      return;
    }
    setUploadLabel(file.name);
    resetAnalysisOutput();
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        const text = String(reader.result ?? "");
        await runCsvPipeline(text, file.size, file.name);
      })();
    };
    reader.readAsText(file);
  },
  [resetAnalysisOutput, runCsvPipeline, setUploadLabel]
);

const assignUniqueEntitySapKeywords = useCallback(
  async (
    rows: CSVRow[],
    keywordTargetsForSeeds?: EntityTitleClusterKeywordTarget[],
  ): Promise<CSVRow[]> => {
    if (rows.length === 0) return rows;
    if (!openRouterKey) {
      throw new Error(NOTIFY_OPENROUTER_IN_SETTINGS);
    }
    const sources = entityKeywordSourcesRef.current;
    if (!sources) {
      throw new Error("Sitemap inventory and GSC keywords must be loaded before assigning row keywords.");
    }
    const siteName = businessName.trim() || site.name?.trim() || "Site";
    const siteUrl = isTempWorkspace ? workspace.tempSeedUrl.trim() : (site.siteUrl?.trim() ?? "");
    const seedKeywords = new Array<string>(rows.length).fill("");
    if (keywordTargetsForSeeds?.length) {
      const jobs = buildEntityTitleClusterJobsFromTargets(keywordTargetsForSeeds, rows.length);
      for (const job of jobs) {
        for (const idx of job.rowIndices) {
          if (idx >= 0 && idx < seedKeywords.length) seedKeywords[idx] = job.seedKeyword;
        }
      }
    }
    return fillEntitySapRowKeywordsFromInventoryAndGsc({
      apiKey: openRouterKey,
      model: researchModel,
      siteId: isTempWorkspace ? undefined : site.id,
      siteName,
      siteUrl,
      rows,
      seedKeywords,
      buckets: sources.buckets,
      gscQueries: sources.gscQueries,
      gridLocations,
      ...(entityTypeFocus.length > 0 ? { entityTypeFocus } : {}),
      ...(clientAudienceContextMarkdown.length > 0 ? { clientAudienceContextMarkdown } : {}),
    });
  },
  [openRouterKey, site, businessName, isTempWorkspace, workspace.tempSeedUrl, researchModel, entityTypeFocus, gridLocations, clientAudienceContextMarkdown, entityKeywordSourcesRef],
);
  return { runCsvPipeline, onPickFile, assignUniqueEntitySapKeywords };
}
