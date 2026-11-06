import type { Dispatch, SetStateAction } from "react";
import { notify } from "@/lib/app-notifications";
import { logger } from "@/lib/logger";
import { NOTIFY_PAA_EXTRACTION_FAILED_CONTINUING_WITHOUT, notifyAiAnalysisCompletedXH2SectionsXCo, notifyKeywordDataReceivedButAiAnalysisFa } from "@/lib/notify-messages";
import type {
  KeywordData,
  KeywordResearchResult,
  KeywordAnalysisOptions,
  KeywordAnalysisComplete,
  KeywordAIAnalysis,
  PeopleAlsoAsk,
} from "@/lib/keyword-types";
import {
  getKeywordOverview,
  getSemanticKeywordSuggestions,
} from "@/lib/keyword-api";
import { analyzeKeywordWithAI } from "@/lib/keyword-ai-analyzer";
import { formatKeyword } from "@/lib/keyword-formatter";
import type { ConnectedSiteSummary } from "@/components/integrations/types";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";

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
export interface LegacySequentialKeywordRunnerDeps {
  extractedKeywordData: KeywordData | null;
  primaryKeyword: string;
  options: KeywordAnalysisOptions;
  localPaaRawResponse: unknown;
  strict: boolean;
  openRouterApiKey?: string;
  selectedModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  entity?: string;
  connectedSite?: ConnectedSiteSummary;
  setIsAnalyzingWithAI: Dispatch<SetStateAction<boolean>>;
  setPaaAiRawResponse: Dispatch<SetStateAction<string>>;
  setAiAnalysis: Dispatch<SetStateAction<KeywordAIAnalysis | null>>;
  setIsLoadingSuggestions: Dispatch<SetStateAction<boolean>>;
  setKeywordsVolumeData: Dispatch<SetStateAction<Map<string, KeywordData>>>;
  setCurrentResult: Dispatch<SetStateAction<KeywordResearchResult | null>>;
  onKeywordsUpdate?: (keywords: KeywordResearchResult) => void;
}

export async function runLegacySequentialKeywordRunner(
  deps: LegacySequentialKeywordRunnerDeps,
): Promise<KeywordAnalysisComplete | null> {
  const {
    extractedKeywordData,
    primaryKeyword,
    options,
    localPaaRawResponse,
    strict,
    openRouterApiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    entity,
    connectedSite,
    setIsAnalyzingWithAI,
    setPaaAiRawResponse,
    setAiAnalysis,
    setIsLoadingSuggestions,
    setKeywordsVolumeData,
    setCurrentResult,
    onKeywordsUpdate,
  } = deps;
  let analysisComplete: KeywordAnalysisComplete | null = null;
  let volumeKeywords: KeywordData[] = [];
// If we have keyword data and OpenRouter API key, trigger AI analysis with full SERP data
        if (extractedKeywordData && openRouterApiKey && openRouterApiKey.trim()) {
setIsAnalyzingWithAI(true);
          
          try {
            if (localPaaRawResponse) {
              /* SERP data present, passed to AI analysis below */
            } else {
              logger.warn('[Keyword Research] No SERP data available, AI will analyze without it');
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
              logger.error('[Keyword Research] Error in AI analysis:', analysisError);
              throw new Error(`AI analysis failed: ${analysisError instanceof Error ? analysisError.message : 'Unknown error'}`);
            }
            
            // Extract PAA in a SEPARATE step with its own prompt - get both raw response AND parsed questions
            let paaAiRawResponseText = '';
            let paaQuestions: PeopleAlsoAsk[] = [];
            if (localPaaRawResponse && openRouterApiKey && openRouterApiKey.trim()) {
              try {
                
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
              } catch (paaError) {
                logger.error('[Keyword Research] Error extracting PAA questions:', paaError);
                // Continue without PAA data - don't fail the whole operation
                paaAiRawResponseText = '';
                paaQuestions = [];
                notify.warning(NOTIFY_PAA_EXTRACTION_FAILED_CONTINUING_WITHOUT);
              }
            } else {
              logger.warn('[Keyword Research] PAA extraction skipped:', {
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
            
            // Validate structure before setting state
            try {
              // Ensure all arrays are actually arrays
              if (!Array.isArray(finalAnalysis.h2Suggestions)) {
                logger.warn('[Keyword Research] Invalid h2Suggestions, defaulting to empty array');
                finalAnalysis.h2Suggestions = [];
              }
              if (!Array.isArray(finalAnalysis.contentGaps)) {
                logger.warn('[Keyword Research] Invalid contentGaps, defaulting to empty array');
                finalAnalysis.contentGaps = [];
              }
              if (!Array.isArray(finalAnalysis.peopleAlsoAsk)) {
                logger.warn('[Keyword Research] Invalid peopleAlsoAsk, defaulting to empty array');
                finalAnalysis.peopleAlsoAsk = [];
              }
              if (!Array.isArray(finalAnalysis.researchLinks)) {
                logger.warn('[Keyword Research] Invalid researchLinks, defaulting to empty array');
                finalAnalysis.researchLinks = [];
              }
              if (!finalAnalysis.keywordSuggestions || typeof finalAnalysis.keywordSuggestions !== 'object') {
                logger.warn('[Keyword Research] Invalid keywordSuggestions, defaulting to empty structure');
                finalAnalysis.keywordSuggestions = {
                  primary: primaryKeyword || "",
                  variations: [],
                  longTail: [],
                  semantic: [],
                };
              }
setAiAnalysis(finalAnalysis);
            } catch (stateError) {
              logger.error('[Keyword Research] Error setting AI analysis state:', stateError);
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
                logger.error('[Keyword Research] Failed to set fallback AI analysis:', fallbackError);
              }
            }
            
            // State transition logging: After setAiAnalysis
            
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
              
              
              // Fetch search volume for AI-generated keywords
              if (allAiKeywords.length > 0) {
                try {
                  const aiKeywordData = await getKeywordOverview(
                    allAiKeywords,
                    options.location || "United States",
                    options.language || "en"
                  );
                  aiGeneratedKeywordsWithData = aiKeywordData || [];
                } catch (aiKwError) {
                  logger.warn("Error fetching search volume for AI-generated keywords:", aiKwError);
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
              } catch (semError) {
                logger.warn("Error fetching semantic keywords:", semError);
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
              logger.warn("Error fetching keyword suggestions:", error);
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
              logger.error('[Keyword Research] Error setting keyword result:', resultError);
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
            logger.error("Error in AI keyword analysis:", aiError);
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
                logger.error('[Keyword Research] Error setting basic result after AI failure:', resultError);
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
  return analysisComplete;
}
