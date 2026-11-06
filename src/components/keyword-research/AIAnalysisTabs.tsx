import { useState, useCallback } from "react";
import { getResearchModel } from "@/lib/optimization-settings-storage";

import { Sparkles } from "lucide-react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_NO_SERP_DATA_AVAILABLE_TO_EXTRACT_FROM, NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED_TO_EXTRAC, notifyExtractedXPaaQuestions, notifyFailedToExtractPaaQuestionsX } from "@/lib/notify-messages";
import type { KeywordAIAnalysis, KeywordData, KeywordResearchResult, PeopleAlsoAsk } from "@/lib/keyword-types";
import { extractPeopleAlsoAskWithAI } from "@/lib/keyword-ai-analyzer";
import { Button, CheckField, Tabs, TabsList, TabsTrigger, TabsContent, Card, ScrollArea } from "@/ui";

interface AIAnalysisTabsProps {
  aiAnalysis: KeywordAIAnalysis;
  result: KeywordResearchResult;
  currentResult: KeywordResearchResult | null;
  selectedKeywords: Set<string>;
  selectedH2Sections: Set<string>;
  selectedContentGaps: Set<string>;
  selectedPeopleAlsoAsk: Set<string>;
  selectedResearchLinks: Set<string>;
  keywordsWithVolumeData: Map<string, KeywordData>;
  minVolumeFilter: number;
  isAnalyzingWithAI: boolean;
  showAIAnalysis: boolean;
  primaryKeyword: string;
  location: string;
  language: string;
  forceRefresh: boolean;
  paaRawResponse: unknown;
  paaExtractionLog: string[];
  paaAiRawResponse: string;
  openRouterApiKey?: string;
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  onShowAIAnalysisChange: (show: boolean) => void;
  onKeywordToggle: (keyword: string) => void;
  onH2Toggle: (heading: string) => void;
  onGapToggle: (topic: string) => void;
  onPaaToggle: (question: string) => void;
  onResearchLinkToggle: (url: string) => void;
  onSelectAllKeywords: (keywords: string[]) => void;
  onSetPrimaryKeyword: (keyword: string) => void;
  onAnalyzeKeyword: (keyword: string, options?: { location?: string; language?: string }) => Promise<void>;
  onRegenerateKeywords: (primaryKeyword: string, selectedKeywords: string[], minVolumeFilter: number, options: { location: string; language: string }) => Promise<unknown>;
  onMinVolumeFilterChange: (filter: number) => void;
  onPaaQuestionsUpdate?: (questions: PeopleAlsoAsk[]) => void;
}

export function AIAnalysisTabs({
  aiAnalysis,
  result,
  currentResult,
  selectedKeywords,
  selectedH2Sections,
  selectedContentGaps,
  selectedPeopleAlsoAsk,
  selectedResearchLinks,
  keywordsWithVolumeData,
  minVolumeFilter,
  isAnalyzingWithAI,
  showAIAnalysis,
  primaryKeyword,
  location,
  language,
  forceRefresh,
  paaRawResponse,
  paaExtractionLog,
  paaAiRawResponse,
  openRouterApiKey,
  selectedModel = getResearchModel(),
  temperature = 1.0,
  maxTokens = 4000,
  topP = 0.9,
  onShowAIAnalysisChange,
  onKeywordToggle,
  onH2Toggle,
  onGapToggle,
  onPaaToggle,
  onResearchLinkToggle,
  onSelectAllKeywords,
  onSetPrimaryKeyword,
  onAnalyzeKeyword,
  onRegenerateKeywords,
  onMinVolumeFilterChange,
  onPaaQuestionsUpdate,
}: AIAnalysisTabsProps) {
  const [isExtractingPaa, setIsExtractingPaa] = useState(false);
  const [extractedPaaQuestions, setExtractedPaaQuestions] = useState<PeopleAlsoAsk[]>([]);

  // Ensure all required properties exist with safe defaults
  const safeAiAnalysis = {
    keywordSuggestions: aiAnalysis?.keywordSuggestions || {
      primary: primaryKeyword || "",
      variations: [],
      longTail: [],
      semantic: [],
    },
    h2Suggestions: Array.isArray(aiAnalysis?.h2Suggestions) ? aiAnalysis.h2Suggestions : [],
    contentGaps: Array.isArray(aiAnalysis?.contentGaps) ? aiAnalysis.contentGaps : [],
    peopleAlsoAsk: Array.isArray(aiAnalysis?.peopleAlsoAsk) ? aiAnalysis.peopleAlsoAsk : [],
    researchLinks: Array.isArray(aiAnalysis?.researchLinks) ? aiAnalysis.researchLinks : [],
  };

  const handleExtractPaaQuestions = useCallback(async () => {
    if (!paaRawResponse) {
      notify.error(NOTIFY_NO_SERP_DATA_AVAILABLE_TO_EXTRACT_FROM);
      return;
    }

    if (!openRouterApiKey || !openRouterApiKey.trim()) {
      notify.error(NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED_TO_EXTRAC);
      return;
    }

    setIsExtractingPaa(true);
    try {
      const result = await extractPeopleAlsoAskWithAI(paaRawResponse, {
        apiKey: openRouterApiKey,
        model: selectedModel,
        temperature,
        maxTokens,
        topP,
      });

      setExtractedPaaQuestions(result.questions);
      
      if (onPaaQuestionsUpdate) {
        onPaaQuestionsUpdate(result.questions);
      }

      notify.success(notifyExtractedXPaaQuestions(result.questions.length));
    } catch (error) {
      console.error("[AIAnalysisTabs] Error extracting PAA questions:", error);
      notify.error(notifyFailedToExtractPaaQuestionsX(error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsExtractingPaa(false);
    }
  }, [paaRawResponse, openRouterApiKey, selectedModel, temperature, maxTokens, topP, onPaaQuestionsUpdate]);

  // Use extracted questions if available, otherwise use from aiAnalysis
  const displayPaaQuestions = extractedPaaQuestions.length > 0 
    ? extractedPaaQuestions 
    : (safeAiAnalysis.peopleAlsoAsk || []);

  const h2Count = safeAiAnalysis.h2Suggestions?.length || 0;
  const gapsCount = safeAiAnalysis.contentGaps?.length || 0;
  const paaCount = displayPaaQuestions.length;
  const linksCount = safeAiAnalysis.researchLinks?.length || 0;

  // Validate aiAnalysis structure to prevent crashes (after all hooks)
  if (!aiAnalysis) {
    return (
      <Card variant="neonFlat" className="p-4">
        <div className="text-center text-muted-foreground">
          <p>AI Analysis data is not available.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="neonFlat" className="p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">AI Analysis Results</h3>
          <p className="text-xs text-muted-foreground">
            Click to select keywords. Selected keywords will be included in blog template generation and analysis.
          </p>
        </div>

        <Tabs defaultValue="h2" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="h2">
              H2 Sections ({h2Count})
            </TabsTrigger>
            <TabsTrigger value="gaps">
              Content Gaps ({gapsCount})
            </TabsTrigger>
            <TabsTrigger value="paa">
              People Also Ask ({paaCount})
            </TabsTrigger>
            <TabsTrigger value="links">
              Research Links ({linksCount})
            </TabsTrigger>
            <TabsTrigger value="intersection">
              Content Intersection ({linksCount})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="h2" className="mt-4">
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {safeAiAnalysis.h2Suggestions?.map((h2, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 border rounded">
                    <CheckField
                      aria-label={h2.heading}
                      checked={selectedH2Sections.has(h2.heading)}
                      onCheckedChange={() => onH2Toggle(h2.heading)}
                    />
                    <div className="flex-1">
                      <div className="font-medium">{h2.heading}</div>
                      <div className="text-sm text-muted-foreground">{h2.description}</div>
                    </div>
                  </div>
                ))}
                {h2Count === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    <p>No H2 section suggestions available.</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="gaps" className="mt-4">
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {safeAiAnalysis.contentGaps?.map((gap, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 border rounded">
                    <CheckField
                      aria-label={gap.topic}
                      checked={selectedContentGaps.has(gap.topic)}
                      onCheckedChange={() => onGapToggle(gap.topic)}
                    />
                    <div className="flex-1">
                      <div className="font-medium">{gap.topic}</div>
                      <div className="text-sm text-muted-foreground">{gap.description}</div>
                    </div>
                  </div>
                ))}
                {gapsCount === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    <p>No content gap suggestions available.</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="paa" className="mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Raw SERP JSON response</label>
                <Button
                  variant="run"
                  onClick={handleExtractPaaQuestions}
                  disabled={isExtractingPaa || !paaRawResponse || !openRouterApiKey}
                >
                  {isExtractingPaa ? (
                    <>
                      
                      Extracting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Extract PAA Questions
                    </>
                  )}
                </Button>
              </div>

              {paaRawResponse && (
                <ScrollArea className="h-[400px] border rounded p-4">
                  <pre className="text-xs whitespace-pre-wrap">
                    {JSON.stringify(paaRawResponse, null, 2)}
                  </pre>
                </ScrollArea>
              )}

              {displayPaaQuestions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium">Extracted Questions:</h4>
                  <ScrollArea className="h-[300px]">
                    {displayPaaQuestions.map((paa, idx) => (
                      <div key={idx} className="flex items-start gap-2 p-2 border rounded mb-2">
                        <CheckField
                          aria-label={paa.question}
                          checked={selectedPeopleAlsoAsk.has(paa.question)}
                          onCheckedChange={() => onPaaToggle(paa.question)}
                        />
                        <div className="flex-1">
                          <div className="font-medium">{paa.question}</div>
                          {paa.answer && (
                            <div className="text-sm text-muted-foreground mt-1">{paa.answer}</div>
                          )}
                          {paa.url && (
                            <div className="text-xs text-muted-foreground mt-1">{paa.url}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </ScrollArea>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="links" className="mt-4">
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {safeAiAnalysis.researchLinks?.map((link, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 border rounded">
                    <CheckField
                      aria-label={link.title || link.url}
                      checked={selectedResearchLinks.has(link.url)}
                      onCheckedChange={() => onResearchLinkToggle(link.url)}
                    />
                    <div className="flex-1">
                      <div className="font-medium">{link.title || link.url}</div>
                      {link.description && (
                        <div className="text-sm text-muted-foreground">{link.description}</div>
                      )}
                      <div className="text-xs text-muted-foreground">{link.url}</div>
                    </div>
                  </div>
                ))}
                {linksCount === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    <p>No research links available.</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="intersection" className="mt-4">
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {safeAiAnalysis.researchLinks?.map((link, idx) => (
                  <div key={idx} className="p-2 border rounded">
                    <div className="font-medium">{link.title || link.url}</div>
                    {link.description && (
                      <div className="text-sm text-muted-foreground">{link.description}</div>
                    )}
                  </div>
                ))}
                {linksCount === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    <p>No content intersection data available.</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </Card>
  );
}
