import { useState, useCallback } from "react";
import { notify } from "@/lib/app-notifications";
import { BACKEND_CONNECTION_ERROR } from "@/lib/wordpress-api/connection";
import { NOTIFY_PAA_EXTRACTION_FAILED_CONTINUING_WITHOUT, NOTIFY_PLEASE_ENTER_A_KEYWORD_TO_ANALYZE, NOTIFY_RAW_DATA_RECEIVED_KEYWORD_OVERVIEW_SERP, notifyAiAnalysisCompletedXH2SectionsXCo, notifyErrorX, notifyKeywordDataReceivedButAiAnalysisFa, notifyReshuffledXNewKeywordsXHeld } from "@/lib/notify-messages";
import type {
  KeywordData,
  KeywordResearchResult,
  KeywordAnalysisOptions,
  KeywordAnalysisComplete,
  KeywordAIAnalysis,
  PeopleAlsoAsk,
} from "@/lib/keyword-types";
import {
  analyzeKeywordDifficulty,
  getSemanticKeywordSuggestions,
  classifySearchIntent,
  getKeywordOverview,
  transformKeywordData,
} from "@/lib/keyword-api";
import { saveKeywordResearchToDB } from "@/lib/keyword-db";
import { analyzeKeywordWithAI } from "@/lib/keyword-ai-analyzer";
import { formatKeyword } from "@/lib/keyword-formatter";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import type { ConnectedSiteSummary } from "@/components/integrations/types";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import {
  dataForSeoRequestHeaders,
  withDataForSeoRequestAuth,
} from "@/lib/dataforseo-request-auth";
import { analyzeBulkCsvKeyword } from "@/lib/bulk/bulk-csv-keyword-analyze";

function emptyKeywordAiAnalysis(primaryKeyword: string): KeywordAIAnalysis {
  const primary = primaryKeyword.trim();
  return {
    keywordSuggestions: {
      primary,
      variations: [],
      longTail: [],
      semantic: [],
    },
    h2Suggestions: [],
    contentGaps: [],
    peopleAlsoAsk: [],
    researchLinks: [],
  };
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
  const [rawApiData, setRawApiData] = useState<any>(null);
  const [aiAnalysis, setAiAnalysis] = useState<KeywordAIAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keywordsVolumeData, setKeywordsVolumeData] = useState<Map<string, KeywordData>>(new Map());
  const [paaRawResponse, setPaaRawResponse] = useState<any>(null);
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
        const MCP_API_BASE = import.meta.env.VITE_MCP_API_BASE || 
          (import.meta.env.DEV ? 'http://localhost:3001/api/mcp' : '/api/mcp');
        
        console.log('[Keyword Research] Fetching from:', `${MCP_API_BASE}/DataForSEO_dataforseo_labs_google_keyword_overview`);
        
        const response = await fetch(`${MCP_API_BASE}/DataForSEO_dataforseo_labs_google_keyword_overview`, {
          method: 'POST',
          headers: dataForSeoRequestHeaders(),
          body: JSON.stringify(
            withDataForSeoRequestAuth({
              keywords: [primaryKeyword],
              location_name: options.location || "United States",
              language_code: options.language || "en",
            }),
          ),
        });
        
        console.log('[Keyword Research] Response status:', response.status);
        
        // Parse response body first to check for DataForSEO success codes
        const contentType = response.headers.get('content-type');
        let rawData: any = null;
        
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
        const isDataForSEOSuccess = (statusCode: any): boolean => {
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
        let serpData = null;
        let localPaaRawResponse: any = null;
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
            headers: dataForSeoRequestHeaders(),
            body: JSON.stringify(withDataForSeoRequestAuth(serpRequestPayload)),
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
            const paaSampleItems: any[] = [];
            
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
          } else {
}
        } else {
}
// If we have keyword data and OpenRouter API key, trigger AI analysis with full SERP data
        if (extractedKeywordData && openRouterApiKey && openRouterApiKey.trim()) {
setIsAnalyzingWithAI(true);
          
          try {
            console.log('[Keyword Research] Running AI analysis with full SERP data...');
            if (localPaaRawResponse) {
              console.log('[Keyword Research] SERP data available, passing to AI for analysis');
            } else {
              console.warn('[Keyword Research] No SERP data available, AI will analyze without it');
            }

            // Run AI analysis - pass the FULL SERP JSON to AI, let it extract everything
            let analysis;
            try {
              analysis = await analyzeKeywordWithAI(
                extractedKeywordData,
                undefined,
                {
                  apiKey: openRouterApiKey,
                  model: selectedModel,
                  temperature,
                  maxTokens,
                  topP,
                  location: options.location, // Pass location for local optimization
                  entity: entity, // Pass entity for content optimization
                  serpData: localPaaRawResponse, // Pass FULL SERP JSON to AI - no manual extraction
                  connectedSite, // Pass connected site for target topic context
                  siteUrl: connectedSite ? getPublicSiteUrl(connectedSite) : undefined, // Public URL for competitor filtering
                  companyName: connectedSite?.name, // Pass company name for competitor filtering
                }
              );
              
              // Ensure analysis has required fields
              if (!analysis) {
                throw new Error('AI analysis returned no data');
              }
              if (!analysis.h2Suggestions) {
                analysis.h2Suggestions = [];
              }
              if (!analysis.contentGaps) {
                analysis.contentGaps = [];
              }
              if (!analysis.keywordSuggestions) {
                analysis.keywordSuggestions = {
                  variations: [],
                  longTail: [],
                  semantic: [],
                };
              }
            } catch (analysisError) {
              console.error('[Keyword Research] Error in AI analysis:', analysisError);
              throw new Error(`AI analysis failed: ${analysisError instanceof Error ? analysisError.message : 'Unknown error'}`);
            }
            
            // Extract PAA in a SEPARATE step with its own prompt - get both raw response AND parsed questions
            let paaAiRawResponseText = '';
            let paaQuestions: PeopleAlsoAsk[] = [];
            if (localPaaRawResponse && openRouterApiKey && openRouterApiKey.trim()) {
              try {
                console.log('[Keyword Research] Extracting People Also Ask questions in separate step...');
                
                const { extractPeopleAlsoAskWithAI } = await import('@/lib/keyword-ai-analyzer');
                const paaResult = await extractPeopleAlsoAskWithAI(localPaaRawResponse, {
                  apiKey: openRouterApiKey,
                  model: selectedModel,
                  temperature,
                  maxTokens,
                  topP,
                });
                
                paaAiRawResponseText = paaResult.rawResponse || '';
                paaQuestions = paaResult.questions || [];
                setPaaAiRawResponse(paaAiRawResponseText);
                console.log('[Keyword Research] PAA extraction complete:', {
                  rawResponseLength: paaAiRawResponseText.length,
                  questionsFound: paaQuestions.length,
                });
              } catch (paaError) {
                console.error('[Keyword Research] Error extracting PAA questions:', paaError);
                // Continue without PAA data - don't fail the whole operation
                paaAiRawResponseText = '';
                paaQuestions = [];
                notify.warning(NOTIFY_PAA_EXTRACTION_FAILED_CONTINUING_WITHOUT);
              }
            } else {
              console.warn('[Keyword Research] PAA extraction skipped:', {
                hasLocalPaaRawResponse: !!localPaaRawResponse,
                hasOpenRouterApiKey: !!openRouterApiKey && openRouterApiKey.trim().length > 0,
              });
            }
            
            // Merge PAA results into analysis - USE THE ACTUAL QUESTIONS FROM AI
            // Ensure all required properties exist with safe defaults to prevent rendering crashes
            const finalAnalysis = {
              keywordSuggestions: {
                primary: analysis.keywordSuggestions?.primary || primaryKeyword || "",
                variations: Array.isArray(analysis.keywordSuggestions?.variations) 
                  ? analysis.keywordSuggestions.variations 
                  : [],
                longTail: Array.isArray(analysis.keywordSuggestions?.longTail) 
                  ? analysis.keywordSuggestions.longTail 
                  : [],
                semantic: Array.isArray(analysis.keywordSuggestions?.semantic) 
                  ? analysis.keywordSuggestions.semantic 
                  : [],
              },
              h2Suggestions: Array.isArray(analysis.h2Suggestions) ? analysis.h2Suggestions : [],
              contentGaps: Array.isArray(analysis.contentGaps) ? analysis.contentGaps : [],
              peopleAlsoAsk: Array.isArray(paaQuestions) ? paaQuestions : [],
              researchLinks: Array.isArray(analysis.researchLinks) ? analysis.researchLinks : [],
            };
            
            // State transition logging: After merge, before setAiAnalysis
            console.log('[Keyword Research] State transition: After merge, before setAiAnalysis');
            console.log('[Keyword Research] finalAnalysis.peopleAlsoAsk:', finalAnalysis.peopleAlsoAsk.length, 'items');
            console.log('[Keyword Research] finalAnalysis structure:', {
              hasKeywordSuggestions: !!finalAnalysis.keywordSuggestions,
              h2SuggestionsCount: finalAnalysis.h2Suggestions?.length || 0,
              contentGapsCount: finalAnalysis.contentGaps?.length || 0,
              peopleAlsoAskCount: finalAnalysis.peopleAlsoAsk?.length || 0,
              researchLinksCount: finalAnalysis.researchLinks?.length || 0,
            });
            
            // Validate structure before setting state
            try {
              // Ensure all arrays are actually arrays
              if (!Array.isArray(finalAnalysis.h2Suggestions)) {
                console.warn('[Keyword Research] Invalid h2Suggestions, defaulting to empty array');
                finalAnalysis.h2Suggestions = [];
              }
              if (!Array.isArray(finalAnalysis.contentGaps)) {
                console.warn('[Keyword Research] Invalid contentGaps, defaulting to empty array');
                finalAnalysis.contentGaps = [];
              }
              if (!Array.isArray(finalAnalysis.peopleAlsoAsk)) {
                console.warn('[Keyword Research] Invalid peopleAlsoAsk, defaulting to empty array');
                finalAnalysis.peopleAlsoAsk = [];
              }
              if (!Array.isArray(finalAnalysis.researchLinks)) {
                console.warn('[Keyword Research] Invalid researchLinks, defaulting to empty array');
                finalAnalysis.researchLinks = [];
              }
              if (!finalAnalysis.keywordSuggestions || typeof finalAnalysis.keywordSuggestions !== 'object') {
                console.warn('[Keyword Research] Invalid keywordSuggestions, defaulting to empty structure');
                finalAnalysis.keywordSuggestions = {
                  primary: primaryKeyword || "",
                  variations: [],
                  longTail: [],
                  semantic: [],
                };
              }
setAiAnalysis(finalAnalysis);
            } catch (stateError) {
              console.error('[Keyword Research] Error setting AI analysis state:', stateError);
// Set a safe default structure if state update fails
              try {
                setAiAnalysis({
                  keywordSuggestions: {
                    primary: primaryKeyword || "",
                    variations: [],
                    longTail: [],
                    semantic: [],
                  },
                  h2Suggestions: [],
                  contentGaps: [],
                  peopleAlsoAsk: [],
                  researchLinks: [],
                });
              } catch (fallbackError) {
                console.error('[Keyword Research] Failed to set fallback AI analysis:', fallbackError);
              }
            }
            
            // State transition logging: After setAiAnalysis
            console.log('[Keyword Research] State transition: After setAiAnalysis() call');
            console.log('[Keyword Research] AI Analysis completed:', {
              h2SuggestionsCount: finalAnalysis.h2Suggestions.length,
              contentGapsCount: finalAnalysis.contentGaps.length,
              researchLinksCount: finalAnalysis.researchLinks?.length || 0,
              paaAiRawResponseLength: paaAiRawResponseText.length,
            });
            
            // Show notification
            notify.success(notifyAiAnalysisCompletedXH2SectionsXCo(finalAnalysis.h2Suggestions.length, finalAnalysis.contentGaps.length, finalAnalysis.researchLinks?.length || 0));
            
            // Fetch search volume data for all AI-generated keywords (variations, long-tail, semantic)
            let semanticKeywords: KeywordData[] = [];
            let aiGeneratedKeywordsWithData: KeywordData[] = [];
            
            try {
              setIsLoadingSuggestions(true);
              
              // Collect all AI-generated keywords
              const allAiKeywords = [
                ...(analysis.keywordSuggestions?.variations || []),
                ...(analysis.keywordSuggestions?.longTail || []),
                ...(analysis.keywordSuggestions?.semantic || [])
              ].filter(Boolean);
              
              console.log('[Keyword Research] Fetching search volume for AI-generated keywords:', allAiKeywords.length);
              
              // Fetch search volume for AI-generated keywords
              if (allAiKeywords.length > 0) {
                try {
                  const aiKeywordData = await getKeywordOverview(
                    allAiKeywords,
                    options.location || "United States",
                    options.language || "en"
                  );
                  aiGeneratedKeywordsWithData = aiKeywordData || [];
                  console.log('[Keyword Research] Fetched search volume for', aiGeneratedKeywordsWithData.length, 'AI-generated keywords');
                } catch (aiKwError) {
                  console.warn("Error fetching search volume for AI-generated keywords:", aiKwError);
                  // Continue without AI keyword data
                }
              }
              
              // Also fetch semantic keywords from DataForSEO API (separate from AI-generated)
              try {
                const semanticData = await getSemanticKeywordSuggestions(
                  primaryKeyword,
                  options.location || "United States",
                  options.language || "en"
                );
                semanticKeywords = semanticData || [];
                console.log('[Keyword Research] Fetched', semanticKeywords.length, 'semantic keywords from DataForSEO');
              } catch (semError) {
                console.warn("Error fetching semantic keywords:", semError);
                // Continue without semantic keywords
              }
              
              // Combine AI-generated keywords with data and semantic keywords
              // Prioritize keywords with actual search volume data
              const combinedKeywords = [
                ...aiGeneratedKeywordsWithData,
                ...semanticKeywords.filter(sk => 
                  !aiGeneratedKeywordsWithData.some(ak => ak.keyword.toLowerCase() === sk.keyword.toLowerCase())
                )
              ];
              
              semanticKeywords = combinedKeywords;
              
              // Store volume data for all keywords
              const volumeMap = new Map<string, KeywordData>();
              [...aiGeneratedKeywordsWithData, ...semanticKeywords].forEach(kw => {
                volumeMap.set(kw.keyword.toLowerCase(), kw);
              });
              volumeKeywords = Array.from(volumeMap.values());
              setKeywordsVolumeData(volumeMap);
              
            } catch (error) {
              console.warn("Error fetching keyword suggestions:", error);
              // Continue without keyword suggestions
            } finally {
              setIsLoadingSuggestions(false);
            }

            // ALWAYS set currentResult when we have keyword data
            // Format primary keyword with proper capitalization
            try {
              const formattedPrimaryKeyword = formatKeyword(primaryKeyword);
              const keywordResult: KeywordResearchResult = {
                primaryKeyword: formattedPrimaryKeyword,
                keywordData: extractedKeywordData,
                semanticKeywords: semanticKeywords || [],
                searchIntent: extractedKeywordData?.intent || 'informational',
                peopleAlsoAsk: paaQuestions.length > 0 ? paaQuestions : (analysis?.peopleAlsoAsk && analysis.peopleAlsoAsk.length > 0 ? analysis.peopleAlsoAsk : []), // Use AI-extracted PAA from separate extraction
                entity: entity || undefined,
              };
setCurrentResult(keywordResult);
              onKeywordsUpdate?.(keywordResult);
              analysisComplete = {
                result: keywordResult,
                aiAnalysis: finalAnalysis,
                keywordsVolumeData: volumeKeywords,
              };
            } catch (resultError) {
              console.error('[Keyword Research] Error setting keyword result:', resultError);
              // Still try to set basic result even if full result fails
              if (extractedKeywordData) {
                const formattedPrimaryKeyword = formatKeyword(primaryKeyword);
                const basicResult: KeywordResearchResult = {
                  primaryKeyword: formattedPrimaryKeyword,
                  keywordData: extractedKeywordData,
                  semanticKeywords: [],
                  searchIntent: extractedKeywordData.intent || 'informational',
                  peopleAlsoAsk: [],
                  entity: entity || undefined,
                };
                setCurrentResult(basicResult);
                onKeywordsUpdate?.(basicResult);
              }
            }
          } catch (aiError) {
            console.error("Error in AI keyword analysis:", aiError);
            const errorMessage = aiError instanceof Error ? aiError.message : 'Unknown error';
            if (strict) {
              throw aiError instanceof Error ? aiError : new Error(errorMessage);
            }
            notify.error(notifyKeywordDataReceivedButAiAnalysisFa(errorMessage));
            
            // Still set basic result if we have keyword data
            if (extractedKeywordData) {
              try {
                const formattedPrimaryKeyword = formatKeyword(primaryKeyword);
                const basicResult: KeywordResearchResult = {
                  primaryKeyword: formattedPrimaryKeyword,
                  keywordData: extractedKeywordData,
                  semanticKeywords: [],
                  searchIntent: extractedKeywordData.intent || 'informational',
                  peopleAlsoAsk: [],
                  entity: entity || undefined,
                };
                const fallbackAnalysis = emptyKeywordAiAnalysis(formattedPrimaryKeyword);
                setCurrentResult(basicResult);
                setAiAnalysis(fallbackAnalysis);
                onKeywordsUpdate?.(basicResult);
                analysisComplete = {
                  result: basicResult,
                  aiAnalysis: fallbackAnalysis,
                  keywordsVolumeData: volumeKeywords,
                };
              } catch (resultError) {
                console.error('[Keyword Research] Error setting basic result after AI failure:', resultError);
              }
            }
          } finally {
setIsAnalyzingWithAI(false);
          }
        } else if (extractedKeywordData) {
          const formattedPrimaryKeyword = formatKeyword(primaryKeyword);
          const keywordResult: KeywordResearchResult = {
            primaryKeyword: formattedPrimaryKeyword,
            keywordData: extractedKeywordData,
            semanticKeywords: [],
            searchIntent: extractedKeywordData.intent || 'informational',
            entity: entity || undefined,
          };
          const analysisWithoutAi = emptyKeywordAiAnalysis(formattedPrimaryKeyword);
          setCurrentResult(keywordResult);
          setAiAnalysis(analysisWithoutAi);
          onKeywordsUpdate?.(keywordResult);
          analysisComplete = {
            result: keywordResult,
            aiAnalysis: analysisWithoutAi,
            keywordsVolumeData: volumeKeywords,
          };
        } else {
          if (strict) {
            throw new Error("Could not extract keyword data from DataForSEO response");
          }
          const formattedPrimaryKeyword = formatKeyword(primaryKeyword);
          const minimalResult: KeywordResearchResult = {
            primaryKeyword: formattedPrimaryKeyword,
            keywordData: {
              keyword: formattedPrimaryKeyword,
              difficulty: 0,
              searchVolume: 0,
              cpc: 0,
              competition: 'LOW' as const,
              intent: 'informational' as const,
              relatedKeywords: [],
              serpFeatures: [],
            },
            semanticKeywords: [],
            searchIntent: 'informational',
            peopleAlsoAsk: [],
            entity: entity || undefined,
          };
setCurrentResult(minimalResult);
          onKeywordsUpdate?.(minimalResult);
          // Also set empty AI analysis so polling loop can complete
          setAiAnalysis({
            keywordSuggestions: {
              primary: formattedPrimaryKeyword,
              variations: [],
              longTail: [],
              semantic: [],
            },
            h2Suggestions: [],
            contentGaps: [],
            peopleAlsoAsk: [],
            researchLinks: [],
          });
          analysisComplete = {
            result: minimalResult,
            aiAnalysis: emptyKeywordAiAnalysis(formattedPrimaryKeyword),
            keywordsVolumeData: volumeKeywords,
          };
        }
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
    [onKeywordsUpdate, openRouterApiKey, selectedModel, temperature, maxTokens, topP]
  );

  const regenerateKeywords = useCallback(
    async (
      primaryKeyword: string,
      selectedKeywords: string[],
      minVolume: number = 0,
      options: KeywordAnalysisOptions = {}
    ) => {
      if (!openRouterApiKey || !openRouterApiKey.trim()) {
        throw new Error("OpenRouter API key is required for keyword regeneration");
      }

      setIsAnalyzingWithAI(true);
      try {
        // Get current keyword data
        const keywordData = await getKeywordOverview(
          [primaryKeyword],
          options.location || "United States",
          options.language || "en"
        );

        if (!keywordData || keywordData.length === 0) {
          throw new Error("Could not fetch keyword data for regeneration");
        }

        const extractedKeywordData = keywordData[0];

        // Run AI analysis with selected keywords as context
        const analysis = await analyzeKeywordWithAI(
          extractedKeywordData,
          undefined,
          {
            apiKey: openRouterApiKey,
            model: selectedModel,
            temperature,
            maxTokens,
            topP,
            selectedKeywords: selectedKeywords.length > 0 ? selectedKeywords : undefined,
            minVolume: minVolume > 0 ? minVolume : undefined,
            location: options.location, // Pass location for local optimization
            entity: entity, // Pass entity for content optimization
            connectedSite, // Pass connected site if available
            siteUrl: connectedSite ? getPublicSiteUrl(connectedSite) : undefined, // Public URL for competitor filtering
            companyName: connectedSite?.name, // Pass company name for competitor filtering
          }
        );

        // Merge new suggestions with held (selected) keywords
        // Keep selected keywords and add new ones (like holding cards in a card game)
        const heldKeywords = new Set(selectedKeywords.map(kw => kw.toLowerCase()));
        
        // Filter out held keywords from new suggestions to avoid duplicates
        const newVariations = analysis.keywordSuggestions.variations.filter(
          kw => !heldKeywords.has(kw.toLowerCase())
        );
        const newLongTail = analysis.keywordSuggestions.longTail.filter(
          kw => !heldKeywords.has(kw.toLowerCase())
        );
        const newSemantic = analysis.keywordSuggestions.semantic.filter(
          kw => !heldKeywords.has(kw.toLowerCase())
        );
        
        // Merge: held keywords + new suggestions
        const mergedAnalysis = {
          ...analysis,
          keywordSuggestions: {
            ...analysis.keywordSuggestions,
            variations: [...selectedKeywords.filter(kw => 
              // Only include held keywords that are variations (not long-tail or semantic)
              kw.split(' ').length <= 3
            ), ...newVariations],
            longTail: [...selectedKeywords.filter(kw => 
              // Only include held keywords that are long-tail (4+ words)
              kw.split(' ').length >= 4
            ), ...newLongTail],
            semantic: [...selectedKeywords.filter(kw => 
              // Include held keywords that don't fit variations or long-tail
              kw.split(' ').length === 3 && !analysis.keywordSuggestions.variations.includes(kw)
            ), ...newSemantic],
          }
        };
        
        setAiAnalysis(mergedAnalysis);
        console.log('[Keyword Research] Keywords reshuffled - held keywords preserved:', {
          heldKeywords: selectedKeywords,
          newVariations: newVariations.length,
          newLongTail: newLongTail.length,
          newSemantic: newSemantic.length,
          totalAfterMerge: {
            variations: mergedAnalysis.keywordSuggestions.variations.length,
            longTail: mergedAnalysis.keywordSuggestions.longTail.length,
            semantic: mergedAnalysis.keywordSuggestions.semantic.length,
          }
        });

        // Fetch search volume for both held keywords and new regenerated keywords
        const allKeywordsToFetch = [
          ...selectedKeywords, // Held keywords need volume data too
          ...newVariations,
          ...newLongTail,
          ...newSemantic
        ].filter(Boolean);

        let regeneratedKeywordsWithData: KeywordData[] = [];
        if (allKeywordsToFetch.length > 0) {
          try {
            const keywordData = await getKeywordOverview(
              allKeywordsToFetch,
              options.location || "United States",
              options.language || "en"
            );
            regeneratedKeywordsWithData = keywordData || [];
            
            // Filter by min volume if specified
            if (minVolume > 0) {
              regeneratedKeywordsWithData = regeneratedKeywordsWithData.filter(
                kw => kw.searchVolume >= minVolume
              );
            }
            
            // Update volume data map
            setKeywordsVolumeData(prev => {
              const volumeMap = new Map(prev);
              regeneratedKeywordsWithData.forEach(kw => {
                volumeMap.set(kw.keyword.toLowerCase(), kw);
              });
              return volumeMap;
            });
            
            console.log('[Keyword Research] Fetched search volume for', regeneratedKeywordsWithData.length, 'keywords (held + new)');
          } catch (error) {
            console.warn("Error fetching search volume for regenerated keywords:", error);
          }
        }

        notify.success(notifyReshuffledXNewKeywordsXHeld(newVariations.length + newLongTail.length + newSemantic.length, selectedKeywords.length));
        return { analysis: mergedAnalysis, keywordsWithData: regeneratedKeywordsWithData };
      } catch (error) {
        console.error("Error regenerating keywords:", error);
        throw error;
      } finally {
        setIsAnalyzingWithAI(false);
      }
    },
    [openRouterApiKey, selectedModel, temperature, maxTokens, topP]
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

