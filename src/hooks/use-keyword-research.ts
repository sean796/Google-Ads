import { resolveMcpApiBase } from "@/lib/mcp-tools";
import { useState, useCallback } from "react";
import { notify } from "@/lib/app-notifications";
import { BACKEND_CONNECTION_ERROR } from "@/lib/wordpress-api/connection";
import { NOTIFY_PLEASE_ENTER_A_KEYWORD_TO_ANALYZE, NOTIFY_RAW_DATA_RECEIVED_KEYWORD_OVERVIEW_SERP, notifyErrorX } from "@/lib/notify-messages";
import type {
  KeywordData,
  KeywordResearchResult,
  KeywordAnalysisOptions,
  KeywordAnalysisComplete,
  KeywordAIAnalysis,
} from "@/lib/keyword-types";
import { transformKeywordData } from "@/lib/keyword-api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { ConnectedSiteSummary } from "@/components/integrations/types";
import { analyzeBulkCsvKeyword } from "@/lib/bulk/bulk-csv-keyword-analyze";
import { runLegacySequentialKeywordRunner } from "@/lib/keyword-research/legacy-sequential-keyword-runner";
import { runRegenerateKeywords } from "@/lib/keyword-research/regenerate-keywords-runner";

interface RawKeywordOverviewResponse {
  status_code?: number | string;
  error?: string;
  details?: string | { status_message?: string };
  keywordOverview?: RawKeywordOverviewResponse;
  tasks?: Array<{
    status_code?: number | string;
    result?: Array<{
      items?: Array<{ keyword_info?: unknown }>;
      keyword_info?: unknown;
    }>;
  }>;
  [key: string]: unknown;
}

interface KeywordSerpResponse {
  error?: string;
  status?: number;
  tasks?: Array<{
    result?: Array<{
      items?: Array<{
        type?: string;
        question?: string;
        title?: string;
        text?: string;
        items?: Array<{ type?: string; question?: string; title?: string; text?: string }>;
        people_also_ask_items?: Array<{ question?: string; title?: string }>;
      }>;
    }>;
  }>;
  [key: string]: unknown;
}

interface PaaSampleItem {
  type?: string;
  question?: string;
  hasItems?: boolean;
  itemsCount?: number;
  nested?: boolean;
  sampleQuestion?: string;
}

interface UseKeywordResearchProps {
  apiKey?: string; // DataForSEO API key
  openRouterApiKey?: string; // OpenRouter API key for AI analysis
  flowTitle?: string;
  flowPurpose?: string;
  onKeywordsUpdate?: (keywords: KeywordResearchResult) => void;
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  entity?: string; // Optional entity for content optimization
  connectedSite?: ConnectedSiteSummary; // Connected WordPress site (target topic)
}

export function useKeywordResearch({
  apiKey,
  openRouterApiKey,
  flowTitle,
  flowPurpose,
  onKeywordsUpdate,
  selectedModel = getResearchModel(),
  temperature = 1.0,
  maxTokens = 4000,
  topP = 0.9,
  entity,
  connectedSite,
}: UseKeywordResearchProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isAnalyzingWithAI, setIsAnalyzingWithAI] = useState(false);
  const [currentResult, setCurrentResult] = useState<KeywordResearchResult | null>(null);
  const [rawApiData, setRawApiData] = useState<unknown>(null);
  const [aiAnalysis, setAiAnalysis] = useState<KeywordAIAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keywordsVolumeData, setKeywordsVolumeData] = useState<Map<string, KeywordData>>(new Map());
  const [paaRawResponse, setPaaRawResponse] = useState<unknown>(null);
  const [paaExtractionLog, setPaaExtractionLog] = useState<string[]>([]);
  const [paaAiRawResponse, setPaaAiRawResponse] = useState<string>('');

  const analyzeKeyword = useCallback(
    async (
      primaryKeyword: string,
      options: KeywordAnalysisOptions = {}
    ): Promise<KeywordAnalysisComplete | null> => {
      const strict = options.strict === true;
      if (!primaryKeyword.trim()) {
        if (strict) {
          throw new Error("Keyword is required for research");
        }
        notify.error(NOTIFY_PLEASE_ENTER_A_KEYWORD_TO_ANALYZE);
        return null;
      }
      setIsAnalyzing(true);
      setError(null);
      let analysisComplete: KeywordAnalysisComplete | null = null;
      let volumeKeywords: KeywordData[] = [];
      let capturedPaaRawResponse: unknown = null;

      try {
        if (options.useParallelPipeline !== false) {
          setIsAnalyzingWithAI(true);
          try {
            const parallelResult = await analyzeBulkCsvKeyword({
              primaryKeyword,
              options,
              openRouterApiKey,
              selectedModel,
              temperature,
              maxTokens,
              topP,
              entity,
              connectedSite,
            });
            capturedPaaRawResponse = parallelResult.paaRawResponse ?? null;
            setPaaRawResponse(capturedPaaRawResponse);
            setRawApiData({
              keywordOverview: null,
              serpData: capturedPaaRawResponse,
            });
            volumeKeywords = parallelResult.keywordsVolumeData ?? [];
            const volumeMap = new Map<string, KeywordData>();
            volumeKeywords.forEach((kw) => volumeMap.set(kw.keyword.toLowerCase(), kw));
            setKeywordsVolumeData(volumeMap);
            setAiAnalysis(parallelResult.aiAnalysis);
            setCurrentResult(parallelResult.result);
            onKeywordsUpdate?.(parallelResult.result);
            notify.success(NOTIFY_RAW_DATA_RECEIVED_KEYWORD_OVERVIEW_SERP);
            analysisComplete = parallelResult;
          } finally {
            setIsAnalyzingWithAI(false);
          }
          return analysisComplete
            ? { ...analysisComplete, paaRawResponse: capturedPaaRawResponse ?? undefined }
            : null;
        }

        // Get RAW JSON from backend - EXACTLY as it appears in PowerShell
        const MCP_API_BASE = resolveMcpApiBase();
        
        console.log('[Keyword Research] Fetching from:', `${MCP_API_BASE}/DataForSEO_dataforseo_labs_google_keyword_overview`);
        
        const response = await fetch(`${MCP_API_BASE}/DataForSEO_dataforseo_labs_google_keyword_overview`, {
          method: 'POST',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            ({
              keywords: [primaryKeyword],
              location_name: options.location || "United States",
              language_code: options.language || "en",
            }),
          ),
        });
        
        console.log('[Keyword Research] Response status:', response.status);
        
        // Parse response body first to check for DataForSEO success codes
        const contentType = response.headers.get('content-type');
        let rawData: RawKeywordOverviewResponse | null = null;
        
        try {
          if (contentType?.includes('application/json')) {
            rawData = await response.json();
          } else {
            const text = await response.text();
            try {
              rawData = JSON.parse(text);
            } catch {
              rawData = { error: text };
            }
          }
        } catch (parseError) {
          console.error('[Keyword Research] Failed to parse response:', parseError);
          rawData = { error: 'Failed to parse response' };
        }
        
        // Check if DataForSEO returned success (status_code 20000) even if HTTP status is not 200
        const isDataForSEOSuccess = (statusCode: number | string | undefined): boolean => {
          if (!statusCode) return false;
          return statusCode === 20000 || statusCode === '20000' || Number(statusCode) === 20000;
        };
        
        const topLevelStatus = rawData?.status_code;
        const taskStatus = rawData?.tasks?.[0]?.status_code;
        const isSuccess = isDataForSEOSuccess(topLevelStatus) || isDataForSEOSuccess(taskStatus);
        
        // If DataForSEO says success (20000), treat it as success regardless of HTTP status
        if (isSuccess) {
          console.log('[Keyword Research] DataForSEO success detected (status_code 20000), treating as success');
          // Continue processing the data
        } else if (!response.ok) {
          // Only treat as error if NOT a DataForSEO success
          let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          const errorDetails = rawData;
          
          // Extract more detailed error information
          if (errorDetails) {
            if (errorDetails.error) {
              errorMessage = errorDetails.error;
            }
            if (errorDetails.details) {
              // Include details if available
              if (typeof errorDetails.details === 'string') {
                errorMessage += ` - ${errorDetails.details}`;
              } else if (errorDetails.details.status_message) {
                errorMessage += ` - ${errorDetails.details.status_message}`;
              }
            }
            
            // Check if backend server is not running
            if (response.status === 500) {
              if (errorDetails.error?.includes('ECONNREFUSED') || errorDetails.error?.includes('Failed to fetch')) {
                errorMessage = BACKEND_CONNECTION_ERROR;
              } else if (!errorDetails.details) {
                errorMessage = `Backend server error. Check backend logs for details. ${errorMessage}`;
              }
            }
          }
          
          throw new Error(errorMessage);
        }
        console.log('[Keyword Research] RAW DATA RECEIVED:', rawData);
        
        // Also fetch SERP data immediately to include in rawApiData
        let serpData: KeywordSerpResponse | null = null;
        let localPaaRawResponse: unknown = null;
        try {
          console.log('[Keyword Research] Fetching SERP data immediately...');
          
          // Default: omit people_also_ask_click_depth for faster upstream SERP (optional deep PAA via options.peopleAlsoAskClickDepth).
          const serpRequestPayload: Record<string, string | number> = {
            keyword: primaryKeyword,
            location_name: options.location || "United States",
            language_code: options.language || "en",
            depth: options.depth ?? 10,
          };
          if (options.peopleAlsoAskClickDepth != null && Number.isFinite(options.peopleAlsoAskClickDepth)) {
            serpRequestPayload.people_also_ask_click_depth = options.peopleAlsoAskClickDepth;
          }
          
          console.log('[SERP API] Request payload:', {
            keyword: serpRequestPayload.keyword,
            location_name: serpRequestPayload.location_name,
            language_code: serpRequestPayload.language_code,
            depth: serpRequestPayload.depth,
            people_also_ask_click_depth: serpRequestPayload.people_also_ask_click_depth,
          });
          console.log('[SERP API] people_also_ask_click_depth parameter:', serpRequestPayload.people_also_ask_click_depth ?? "(omitted, faster SERP)");
          
          const serpResponse = await fetch(`${MCP_API_BASE}/DataForSEO_serp_organic_live_advanced`, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify((serpRequestPayload)),
          });
          
          if (serpResponse.ok) {
            serpData = await serpResponse.json();
            localPaaRawResponse = serpData; // Store for PAA tab
            capturedPaaRawResponse = serpData;
            setPaaRawResponse(serpData); // Set immediately
            console.log('[Keyword Research] SERP DATA RECEIVED:', serpData);
            
            // Step 1: SERP API Response Validation
            console.log('[SERP API] Response status: 200 OK');
            console.log('[SERP API] Validating PAA data in response...');
            
            // Count PAA items in raw response
            let paaCount = 0;
            const paaSampleItems: PaaSampleItem[] = [];
            
            if (serpData?.tasks && Array.isArray(serpData.tasks)) {
              for (const task of serpData.tasks) {
                if (task.result && Array.isArray(task.result)) {
                  for (const resultItem of task.result) {
                    if (resultItem.items && Array.isArray(resultItem.items)) {
                      for (const item of resultItem.items) {
                        // Check for PAA items
                        if (item.type === 'people_also_ask' || item.type === 'people_also_ask_item') {
                          paaCount++;
                          if (paaSampleItems.length < 3) {
                            paaSampleItems.push({
                              type: item.type,
                              question: item.question || item.title || item.text || 'N/A',
                              hasItems: !!item.items,
                              itemsCount: item.items?.length || 0,
                            });
                          }
                        }
                        // Check nested items
                        if (item.items && Array.isArray(item.items)) {
                          for (const nestedItem of item.items) {
                            if (nestedItem.type === 'people_also_ask' || nestedItem.type === 'people_also_ask_item') {
                              paaCount++;
                              if (paaSampleItems.length < 3) {
                                paaSampleItems.push({
                                  type: nestedItem.type,
                                  question: nestedItem.question || nestedItem.title || nestedItem.text || 'N/A',
                                  nested: true,
                                });
                              }
                            }
                          }
                        }
                        // Check people_also_ask_items array
                        if (item.people_also_ask_items && Array.isArray(item.people_also_ask_items)) {
                          paaCount += item.people_also_ask_items.length;
                          if (paaSampleItems.length < 3 && item.people_also_ask_items.length > 0) {
                            paaSampleItems.push({
                              type: 'people_also_ask_items',
                              itemsCount: item.people_also_ask_items.length,
                              sampleQuestion: item.people_also_ask_items[0]?.question || item.people_also_ask_items[0]?.title || 'N/A',
                            });
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
            
            console.log(`[SERP API] Response received: ${paaCount} PAA items found in raw response`);
            if (paaSampleItems.length > 0) {
              console.log('[SERP API] Sample PAA items:', paaSampleItems);
            } else {
              console.log('[SERP API] No PAA items found in raw response structure (this is acceptable)');
              console.log('[SERP API] Response structure:', {
                hasTasks: !!serpData?.tasks,
                tasksCount: serpData?.tasks?.length || 0,
                firstTaskKeys: serpData?.tasks?.[0] ? Object.keys(serpData.tasks[0]) : [],
                firstTaskResultType: typeof serpData?.tasks?.[0]?.result,
                firstTaskResultIsArray: Array.isArray(serpData?.tasks?.[0]?.result),
              });
            }
            
            // Validate paaRawResponse state is set correctly
            console.log('[SERP API] Validating state storage...');
            console.log('[SERP API] localPaaRawResponse set:', !!localPaaRawResponse);
            console.log('[SERP API] paaRawResponse state will be updated via setPaaRawResponse()');
          } else {
            const serpErrorText = await serpResponse.text();
            console.error('[Keyword Research] SERP error response:', serpErrorText);
            serpData = { error: serpErrorText, status: serpResponse.status };
            localPaaRawResponse = serpData;
            capturedPaaRawResponse = serpData;
            setPaaRawResponse(serpData);
          }
        } catch (serpError) {
          console.error('[Keyword Research] SERP fetch error:', serpError);
          serpData = { error: serpError instanceof Error ? serpError.message : String(serpError) };
          localPaaRawResponse = serpData;
          capturedPaaRawResponse = serpData;
          setPaaRawResponse(serpData);
        }
        
        // Store both keyword overview and SERP data
        const combinedRawData = {
          keywordOverview: rawData,
          serpData: serpData,
        };
        setRawApiData(combinedRawData);
        console.log('[Keyword Research] State updated with combined raw data (keyword overview + SERP)');
        notify.success(NOTIFY_RAW_DATA_RECEIVED_KEYWORD_OVERVIEW_SERP);

        // Extract keyword data from raw API response (use keywordOverview if nested, otherwise use rawData directly)
        const keywordDataToExtract = rawData?.keywordOverview ?? rawData;
        let extractedKeywordData: KeywordData | null = null;
if (keywordDataToExtract?.tasks && keywordDataToExtract.tasks[0]?.result) {
          const task = keywordDataToExtract.tasks[0];
if (Array.isArray(task.result)) {
            for (let i = 0; i < task.result.length; i++) {
              const resultItem = task.result[i];
if (resultItem.items && Array.isArray(resultItem.items) && resultItem.items.length > 0) {
                const item = resultItem.items[0];
                if (item.keyword_info) {
extractedKeywordData = transformKeywordData(item);
                  break;
                }
              } else if (resultItem.keyword_info) {
extractedKeywordData = transformKeywordData(resultItem);
                break;
              }
            }
          }
        }
// If we have keyword data and OpenRouter API key, trigger AI analysis with full SERP data
        analysisComplete = await runLegacySequentialKeywordRunner({
          extractedKeywordData, primaryKeyword, options, localPaaRawResponse, strict,
          openRouterApiKey, selectedModel, temperature, maxTokens, topP, entity, connectedSite,
          setIsAnalyzingWithAI, setPaaAiRawResponse, setAiAnalysis, setIsLoadingSuggestions,
          setKeywordsVolumeData, setCurrentResult, onKeywordsUpdate,
        });
      } catch (err) {
        console.error("Error fetching raw data:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch data";
        if (strict) {
          throw err instanceof Error ? err : new Error(errorMessage);
        }
        setError(errorMessage);
        notify.error(notifyErrorX(errorMessage));
        // Still try to show error as JSON
        setRawApiData({ error: errorMessage, details: err });
      } finally {
        setIsAnalyzing(false);
        setIsLoadingSuggestions(false);
      }

      return analysisComplete
        ? { ...analysisComplete, paaRawResponse: capturedPaaRawResponse ?? undefined }
        : null;
    },
    [onKeywordsUpdate, openRouterApiKey, selectedModel, temperature, maxTokens, topP, connectedSite, entity]
  );

  const regenerateKeywords = useCallback(
    async (
      primaryKeyword: string,
      selectedKeywords: string[],
      minVolume: number = 0,
      options: KeywordAnalysisOptions = {}
    ) => {
      return runRegenerateKeywords(
        {
          openRouterApiKey, selectedModel, temperature, maxTokens, topP, connectedSite, entity,
          setIsAnalyzingWithAI, setAiAnalysis, setKeywordsVolumeData,
        },
        primaryKeyword,
        selectedKeywords,
        minVolume,
        options,
      );
    },
    [openRouterApiKey, selectedModel, temperature, maxTokens, topP, connectedSite, entity]
  );

  const clearResults = useCallback(() => {
    setCurrentResult(null);
    setError(null);
    setAiAnalysis(null);
  }, []);

  return {
    isAnalyzing,
    isLoadingSuggestions,
    isAnalyzingWithAI,
    currentResult,
    rawApiData,
    aiAnalysis,
    error,
    analyzeKeyword,
    regenerateKeywords,
    clearResults,
    keywordsVolumeData,
    paaRawResponse,
    paaExtractionLog,
    paaAiRawResponse,
  };
}

