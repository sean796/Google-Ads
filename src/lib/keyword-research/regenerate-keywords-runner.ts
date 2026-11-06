import type { Dispatch, SetStateAction } from "react";
import { notify } from "@/lib/app-notifications";
import { notifyReshuffledXNewKeywordsXHeld } from "@/lib/notify-messages";
import type {
  KeywordData,
  KeywordAnalysisOptions,
  KeywordAIAnalysis,
} from "@/lib/keyword-types";
import { getKeywordOverview } from "@/lib/keyword-api";
import { analyzeKeywordWithAI } from "@/lib/keyword-ai-analyzer";
import type { ConnectedSiteSummary } from "@/components/integrations/types";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";

export interface RegenerateKeywordsRunnerDeps {
  openRouterApiKey?: string;
  selectedModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  entity?: string;
  connectedSite?: ConnectedSiteSummary;
  setIsAnalyzingWithAI: Dispatch<SetStateAction<boolean>>;
  setAiAnalysis: Dispatch<SetStateAction<KeywordAIAnalysis | null>>;
  setKeywordsVolumeData: Dispatch<SetStateAction<Map<string, KeywordData>>>;
}

export async function runRegenerateKeywords(
  deps: RegenerateKeywordsRunnerDeps,
  primaryKeyword: string,
  selectedKeywords: string[],
  minVolume: number = 0,
  options: KeywordAnalysisOptions = {},
) {
  const {
    openRouterApiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    entity,
    connectedSite,
    setIsAnalyzingWithAI,
    setAiAnalysis,
    setKeywordsVolumeData,
  } = deps;
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
}
