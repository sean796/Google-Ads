import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { CSVRow, WordPressPostDestination } from "@/lib/bulk-auto-generate";
import { BULK_POST_DESTINATION_CHOICES } from "@/lib/bulk-auto-generate";
import { Upload, MessageSquare } from "lucide-react";
import { useBulkAutoGenerate } from "@/hooks/use-bulk-auto-generate";
import { usePromptBulkGenerate } from "@/hooks/use-prompt-bulk-generate";
import { usePromptBulkSiteContext } from "@/hooks/use-prompt-bulk-site-context";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { getStoredSites } from "@/components/integrations/storage";
import { CSVUploadSection } from "./bulk/CSVUploadSection";
import { PromptInputSection } from "./bulk/PromptInputSection";
import { GeneratedBlogIdeasList } from "./bulk/GeneratedBlogIdeasList";
import { BULK_GENERATOR_EMPTY_ROW_COUNT } from "@/components/keyword-research/blog-generator-tab-classes";
import { GeneratedFilesDisplay } from "./bulk/GeneratedFilesDisplay";
import { ProgressAndStatsDisplay } from "./bulk/ProgressAndStatsDisplay";
import { CSVProcessingControls } from "./bulk/CSVProcessingControls";
import { useBulkScheduleOccupancy } from "@/hooks/use-bulk-schedule-occupancy";
import { cn } from "@/lib/utils";
import type { BulkGeneratorWorkspaceBindings } from "./bulk/bulk-generator-workspace-bindings";
import { Field, Card, RadioGroup, RadioGroupItem } from "@/ui";
import { useBulkSiteAndSapScheduleSync } from "./bulk/use-bulk-site-and-sap-schedule-sync";
import { useBulkCsvSitemapAndRowHandlers } from "./bulk/use-bulk-csv-sitemap-and-row-handlers";
import { usePublishBulkWorkspaceBindings } from "./bulk/use-publish-bulk-workspace-bindings";

interface BulkAutoGeneratePanelProps {
  openRouterApiKey?: string;
  /** Non-generator integrations (SAP, legacy bulk) may still pass DataForSEO. */
  apiKey?: string;
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  flowPurpose?: string;
  /**
   * Locks the panel to CSV or prompt mode and hides the in-panel method toggle.
   * Blog Generator shell uses CSV upload vs Prompt generator side tabs.
   */
  forcedInputMode?: "csv" | "prompt" | "blog-import";
  /** Hides CSV vs prompt toggle; keeps CSV pipeline with optional slot instead of file upload. */
  sapMode?: boolean;
  replaceCsvFileUploadWith?: ReactNode;
  /** When `sapMode`, bulk rows are set from these in-memory CSV rows (SAP generator). */
  sapSyncedRows?: CSVRow[];
  /** In-memory rows (SAP generator, blog import) — skips CSV file requirement when set. */
  injectedRows?: CSVRow[];
  /** Blog import: local file held until Run (OpenRouter reads it). */
  blogImportSourceFile?: File | null;
  blogImportForm?: {
    focusKeyword: string;
    titleOverride: string;
    featuredImageMode: "y" | "n" | "google-maps";
    entity: string;
  };
  /** Initial export destination (e.g. blog import defaults to local). */
  initialBulkPostDestination?: WordPressPostDestination;
  /** Export radios to show (blog import: WP, bank, local only). */
  postDestinationChoices?: WordPressPostDestination[];
  /** Unified header for Blog Generator shell. */
  bulkGeneratorWorkspace?: boolean;
  onBulkGeneratorWorkspaceBindings?: (bindings: BulkGeneratorWorkspaceBindings) => void;
}

export const BulkAutoGeneratePanel: React.FC<BulkAutoGeneratePanelProps> = ({
  openRouterApiKey,
  apiKey,
  selectedModel,
  temperature,
  maxTokens,
  topP,
  flowPurpose,
  forcedInputMode,
  sapMode = false,
  replaceCsvFileUploadWith,
  sapSyncedRows,
  injectedRows,
  blogImportSourceFile = null,
  blogImportForm,
  initialBulkPostDestination,
  postDestinationChoices = BULK_POST_DESTINATION_CHOICES,
  bulkGeneratorWorkspace = false,
  onBulkGeneratorWorkspaceBindings,
}) => {
  const { activeWordPressSiteId } = useActiveWordPressSite();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvParsing, setCsvParsing] = useState(false);
  const [inputMode, setInputMode] = useState<"csv" | "prompt">(() =>
    sapMode ? "csv" : forcedInputMode === "prompt" ? "prompt" : "csv",
  );
  
  // Blog generation settings
  const [numberOfBlogs, setNumberOfBlogs] = useState<number>(1);
  const [optionalPrompt, setOptionalPrompt] = useState<string>('');
  const [generalIntent, setGeneralIntent] = useState<string>('');
  const [checklistPhase, setChecklistPhase] = useState("");
  const [checklistProgressPct, setChecklistProgressPct] = useState<number | undefined>(undefined);

  // Selection state for blog ideas
  const [selectedBlogIndices, setSelectedBlogIndices] = useState<Set<number>>(new Set());

  const siteSchedule = useBulkSiteAndSapScheduleSync({
    sapMode, forcedInputMode, activeWordPressSiteId, initialBulkPostDestination,
  });
  const { wordPressSite, connectedSite, selectedWordPressSites, setSelectedWordPressSites, siteConfigs, setSiteConfigs, scheduleFrequency, setScheduleFrequency, customInterval, setCustomInterval, rowOrder, setRowOrder, dayOfWeek, setDayOfWeek, startDateOption, setStartDateOption, customStartDate, setCustomStartDate, startTime, setStartTime, useCsvPublishDates, setUseCsvPublishDates, wordpressDraftOnly, setWordpressDraftOnly, bulkPostDestination, setBulkPostDestination, featuredImagePerBlog, setFeaturedImagePerBlog, featuredImageType, setFeaturedImageType } = siteSchedule;
  const siteScheduleRef = useRef(siteSchedule);
  siteScheduleRef.current = siteSchedule;

  const effectiveFlowPurpose = inputMode === 'prompt' ? (generalIntent?.trim() || flowPurpose || '') : (flowPurpose || '');

  const promptSiteContext = usePromptBulkSiteContext(wordPressSite);

  const handleChecklistProgress = useCallback((step: string, progress: number) => {
    setChecklistPhase(step);
    setChecklistProgressPct(progress);
  }, []);

  const prompt = usePromptBulkGenerate({

    openRouterApiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    flowPurpose: effectiveFlowPurpose,
    numberOfBlogs,
    optionalPrompt,
    featuredImagePerBlog,
    connectedSite: connectedSite || undefined,
    siteConfigs,
    selectedWordPressSites,
    promptIdeasContext: promptSiteContext.ideasContext,
    promptSiteContextReady: promptSiteContext.promptSiteContextReady,
    sitemapInventoryLoading: promptSiteContext.sitemapInventoryLoading,
    onProgress: handleChecklistProgress,
  });
  const { userInput, setUserInput, isGeneratingChecklist, hasGeneratedChecklist, setHasGeneratedChecklist, generatedRows, setGeneratedRows, wordPressPostsMetadata, lastInventorySentToAiCount, handleGenerateChecklist, resetPromptGeneration, handleRegenerateUnselected } = prompt;

  useEffect(() => {
    if (!isGeneratingChecklist) {
      setChecklistPhase("");
      setChecklistProgressPct(undefined);
    }
  }, [isGeneratingChecklist]);

  const prevForcedInputModeRef = useRef(forcedInputMode);

  useEffect(() => {
    const { setSiteConfigs } = siteScheduleRef.current;
    if (sapMode) {
      setInputMode("csv");
      return;
    }
    if (forcedInputMode === undefined) return;
    if (prevForcedInputModeRef.current === forcedInputMode) return;
    const prevMode = prevForcedInputModeRef.current;
    prevForcedInputModeRef.current = forcedInputMode;

    if (forcedInputMode === "prompt") {
      setInputMode("prompt");
      setCsvFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSiteConfigs((prev) => {
        const siteId = wordPressSite?.id ?? Array.from(selectedWordPressSites)[0];
        if (!siteId || prev[siteId]?.sitemapType === "post") return prev;
        return {
          ...prev,
          [siteId]: { ...prev[siteId], sitemapType: "post" },
        };
      });
    } else {
      setInputMode("csv");
      if (prevMode !== "csv") {
        resetPromptGeneration();
        setSelectedBlogIndices(new Set());
      }
    }
  }, [sapMode, forcedInputMode, resetPromptGeneration, wordPressSite, selectedWordPressSites]);

  const bulk = useBulkAutoGenerate({

    openRouterApiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    flowPurpose: effectiveFlowPurpose,
    featuredImageType,
    connectedSite: connectedSite || undefined,
    inputMode,
    selectedBlogIndices,
    generatedRows,
    selectedWordPressSites,
    siteConfigs,
    scheduleFrequency,
    customInterval,
    dayOfWeek,
    startDateOption,
    customStartDate,
    startTime,
    useCsvPublishDates,
    bulkPostDestination,
    wordpressDraftOnly,
    blogImportSourceFile,
    blogImportForm,
  });
  const { isProcessing, setIsProcessing, currentRow, setCurrentRow, totalRows, status, processingStepLog, harnessSections, harnessByRow, harnessPlannedSectionCount, rows, setRows, setTotalRows, fileManager, loadCSV, isCsvEnriching, processAllRows, cancelProcessing, downloadFile, downloadRowFiles, downloadAllFiles, downloadRunContentCsv, runContentCsvAvailable, stats, filesByRow, failedRowIndices, failedRowMessages } = bulk;

  const gapScheduleSite = useMemo(() => {
    const all = getStoredSites();
    const firstId = Array.from(selectedWordPressSites)[0];
    if (!firstId) return null;
    return all.find((s) => s.id === firstId) ?? null;
  }, [selectedWordPressSites]);

  const gapScheduleEnabled =
    startDateOption === 'immediate' &&
    scheduleFrequency !== 'custom' &&
    bulkPostDestination !== 'local' &&
    scheduleFrequency !== 'immediately' &&
    selectedWordPressSites.size > 0;

  const {
    occupancy: scheduleOccupancy,
    loading: scheduleOccupancyLoading,
    refresh: refreshScheduleOccupancy,
  } = useBulkScheduleOccupancy({
    site: gapScheduleSite,
    enabled: gapScheduleEnabled,
  });

  const csvSitemap = useBulkCsvSitemapAndRowHandlers({
    bulk, prompt, inputMode, sapMode, csvFile, injectedRows, sapSyncedRows,
    wordPressSite, selectedWordPressSites, selectedBlogIndices, siteConfigs,
    setSiteConfigs, scheduleFrequency, customInterval, dayOfWeek,
    startDateOption, customStartDate, startTime, useCsvPublishDates,
    bulkPostDestination, wordpressDraftOnly, rowOrder, setRowOrder, gapScheduleEnabled,
    scheduleOccupancy, refreshScheduleOccupancy, apiKey, openRouterApiKey,
    selectedModel, setSelectedBlogIndices, setCsvFile, setFeaturedImageType,
    setFeaturedImagePerBlog, setNumberOfBlogs,
  });
  const { previewRowsForWp, publishDateLabelByGeneratedIndex, sitemapMode, siteFallbackSitemapType, handleRowSitemapChange, handleSwitchToCustom, handleStartProcessing, handleCsvRowChange, handleGeneratedRowChange, handleNumberOfBlogsChange, handleGenerateChecklistAndSelectAll } = csvSitemap;

  // Get the rows to display
  const displayRows = inputMode === 'csv' ? rows : generatedRows;

  usePublishBulkWorkspaceBindings({
    bulkGeneratorWorkspace, onBulkGeneratorWorkspaceBindings, inputMode,
    displayRows, csvFile, csvParsing, fileInputRef, numberOfBlogs,
    generalIntent, setGeneralIntent, optionalPrompt, setOptionalPrompt,
    featuredImagePerBlog, setFeaturedImagePerBlog, featuredImageType,
    setFeaturedImageType, selectedBlogIndices, setSelectedBlogIndices,
    checklistPhase, checklistProgressPct, openRouterApiKey, setCsvFile,
    setNumberOfBlogs, bulk, prompt, promptSiteContext, siteSchedule,
    csvSitemap, scheduleOccupancy, scheduleOccupancyLoading, setCsvParsing,
  });

  if (bulkGeneratorWorkspace && (inputMode === "csv" || inputMode === "prompt")) {
    return null;
  }

  return (
    <div className={cn('space-y-4', (sapMode || bulkGeneratorWorkspace) && 'space-y-2')}>
      <Card
        variant="default"
        className={cn(
          'border-0 bg-transparent !shadow-none',
          sapMode || bulkGeneratorWorkspace ? 'p-2 sm:p-2' : 'p-3 sm:p-4'
        )}
      >
        <div className={cn('space-y-3', (sapMode || bulkGeneratorWorkspace) && 'space-y-2')}>
          {/* Input method toggle - only when the panel is not locked by shell tabs or SAP */}
          {!sapMode && forcedInputMode === undefined && (
          <div className="space-y-1.5">
            <label className="text-base font-medium">Input method</label>
            <RadioGroup value={inputMode} onValueChange={(value) => {
              setInputMode(value as 'csv' | 'prompt');
              if (value === 'csv') {
                resetPromptGeneration();
                setSelectedBlogIndices(new Set());
              } else if (value === 'prompt') {
                setCsvFile(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }
            }}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="csv" id="mode-csv" />
                <label htmlFor="mode-csv" className="cursor-pointer flex items-center gap-2 text-base">
                  <Upload className="h-4 w-4" />
                  CSV Upload
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="prompt" id="mode-prompt" />
                <label htmlFor="mode-prompt" className="cursor-pointer flex items-center gap-2 text-base">
                  <MessageSquare className="h-4 w-4" />
                  Prompt Input
                </label>
              </div>
            </RadioGroup>
          </div>
          )}

          {/* CSV Upload Mode */}
          {inputMode === 'csv' && (
            <CSVUploadSection
              csvFile={csvFile}
              setCsvFile={setCsvFile}
              fileInputRef={fileInputRef}
              rows={rows}
              loadCSV={loadCSV}
              connectedSite={connectedSite}
              isProcessing={isProcessing}
              selectedWordPressSites={selectedWordPressSites}
              setSelectedWordPressSites={setSelectedWordPressSites}
              siteConfigs={siteConfigs}
              setSiteConfigs={setSiteConfigs}
              scheduleFrequency={scheduleFrequency}
              setScheduleFrequency={setScheduleFrequency}
              customInterval={customInterval}
              setCustomInterval={setCustomInterval}
              dayOfWeek={dayOfWeek}
              setDayOfWeek={setDayOfWeek}
              startDateOption={startDateOption}
              setStartDateOption={setStartDateOption}
              customStartDate={customStartDate}
              setCustomStartDate={setCustomStartDate}
              startTime={startTime}
              setStartTime={setStartTime}
              useCsvPublishDates={useCsvPublishDates}
              setUseCsvPublishDates={setUseCsvPublishDates}
              wordpressDraftOnly={wordpressDraftOnly}
              setWordpressDraftOnly={setWordpressDraftOnly}
              previewRows={previewRowsForWp}
              rowOrder={rowOrder}
              replaceFileUploadWith={replaceCsvFileUploadWith}
              sapMode={sapMode}
              postDestination={bulkPostDestination}
              setPostDestination={setBulkPostDestination}
              postDestinationChoices={postDestinationChoices}
              scheduleOccupancy={scheduleOccupancy}
              scheduleOccupancyLoading={scheduleOccupancyLoading}
              hideFileUploadSlot={bulkGeneratorWorkspace}
              hideWordPressPostingInBody={bulkGeneratorWorkspace}
            />
          )}

          {/* Prompt Input Mode */}
          {inputMode === 'prompt' && (
            <>
              {!bulkGeneratorWorkspace ? (
              <div>
                <Field
                  id="general-intent"
                  placeholder="General intent / topic (optional) - e.g. interior design; steers ideas & keywords"
                  value={generalIntent}
                  onChange={(e) => setGeneralIntent(e.target.value)}
                  aria-label="General intent or content topic"
                />
              </div>
              ) : null}

              {!bulkGeneratorWorkspace ? (
              <PromptInputSection
                numberOfBlogs={numberOfBlogs}
                setNumberOfBlogs={handleNumberOfBlogsChange}
                optionalPrompt={optionalPrompt}
                setOptionalPrompt={setOptionalPrompt}
                featuredImagePerBlog={featuredImagePerBlog}
                setFeaturedImagePerBlog={setFeaturedImagePerBlog}
                featuredImageType={featuredImageType}
                setFeaturedImageType={setFeaturedImageType}
                connectedSite={connectedSite}
                selectedWordPressSites={selectedWordPressSites}
                setSelectedWordPressSites={setSelectedWordPressSites}
                siteConfigs={siteConfigs}
                setSiteConfigs={setSiteConfigs}
                scheduleFrequency={scheduleFrequency}
                setScheduleFrequency={setScheduleFrequency}
                customInterval={customInterval}
                setCustomInterval={setCustomInterval}
                dayOfWeek={dayOfWeek}
                setDayOfWeek={setDayOfWeek}
                startDateOption={startDateOption}
                setStartDateOption={setStartDateOption}
                customStartDate={customStartDate}
                setCustomStartDate={setCustomStartDate}
                startTime={startTime}
                setStartTime={setStartTime}
                useCsvPublishDates={useCsvPublishDates}
                setUseCsvPublishDates={setUseCsvPublishDates}
                wordpressDraftOnly={wordpressDraftOnly}
                setWordpressDraftOnly={setWordpressDraftOnly}
                previewRows={previewRowsForWp}
                rowOrder={rowOrder}
                isGeneratingChecklist={isGeneratingChecklist}
                isProcessing={isProcessing}
                apiKey={apiKey}
                openRouterApiKey={openRouterApiKey}
                handleGenerateChecklist={() => void handleGenerateChecklistAndSelectAll()}
                setSelectedBlogIndices={setSelectedBlogIndices}
                postDestination={bulkPostDestination}
                setPostDestination={setBulkPostDestination}
                postDestinationChoices={postDestinationChoices}
                scheduleOccupancy={scheduleOccupancy}
                scheduleOccupancyLoading={scheduleOccupancyLoading}
              />
              ) : null}

              <GeneratedBlogIdeasList
                hasGeneratedChecklist={hasGeneratedChecklist}
                slotMode={!hasGeneratedChecklist}
                placeholderCount={BULK_GENERATOR_EMPTY_ROW_COUNT}
                generatedRows={generatedRows}
                selectedBlogIndices={selectedBlogIndices}
                setSelectedBlogIndices={setSelectedBlogIndices}
                isGeneratingChecklist={isGeneratingChecklist}
                isProcessing={isProcessing}
                publishDateLabelByIndex={publishDateLabelByGeneratedIndex}
                draftOnly={wordpressDraftOnly && bulkPostDestination !== "local"}
                onRowChange={handleGeneratedRowChange}
              />
            </>
          )}

          {/* Progress and Stats Display */}
          {!bulkGeneratorWorkspace ? (
          <ProgressAndStatsDisplay
            isProcessing={isProcessing}
            currentRow={currentRow}
            totalRows={totalRows}
            status={status}
            stats={stats}
            fileManager={fileManager}
            selectedWordPressSites={selectedWordPressSites}
            harnessSections={harnessSections}
            harnessPlannedSectionCount={harnessPlannedSectionCount}
          />
          ) : null}

          {/* Generated files: legacy panel when not using workspace chrome */}
          {!bulkGeneratorWorkspace ? (
          <GeneratedFilesDisplay
            filesByRow={filesByRow}
            displayRows={displayRows}
            stats={stats}
            downloadFile={downloadFile}
            downloadRowFiles={downloadRowFiles}
            downloadAllFiles={downloadAllFiles}
            downloadRunContentCsv={downloadRunContentCsv}
            runContentCsvAvailable={runContentCsvAvailable}
            isProcessing={isProcessing}
            processingStatus={status}
          />
          ) : null}

          {/* Controls - Only show for CSV mode */}
          {!bulkGeneratorWorkspace ? (
          <CSVProcessingControls
            inputMode={inputMode}
            rows={rows}
            displayRows={displayRows}
            isProcessing={isProcessing}
            apiKey={apiKey}
            openRouterApiKey={openRouterApiKey}
            handleStartProcessing={handleStartProcessing}
            cancelProcessing={cancelProcessing}
          />
          ) : null}
        </div>
      </Card>

    </div>
  );
};