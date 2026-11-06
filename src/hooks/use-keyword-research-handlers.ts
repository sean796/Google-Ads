import { useCallback } from "react";
import { NOTIFY_PLEASE_ENTER_A_PRIMARY_KEYWORD, NOTIFY_KEYWORD_RESEARCH_CLEARED, NOTIFY_ALL_CACHED_KEYWORD_DATA_CLEARED, NOTIFY_PLEASE_ENTER_A_KEYWORD_TO_ANALYZE, NOTIFY_CHECKING_KEYWORD_SERVER_STATUS, notifyFailedToCheckServerStatusX, notifyServerErrorX, NOTIFY_KEYWORD_SERVER_STARTED_SUCCESSFULLY, notifyAnalyzingKeywordX, notifyKeywordXAnalyzedSuccessfully, notifyAnalysisFailedX, notifyUnexpectedErrorX } from "@/lib/notify-messages";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { clearAllKeywordData, clearKeywordResearchCache } from "@/lib/keyword-db";
import { clearKeywordCache } from "@/lib/keyword-api";
import { ensureServerRunning } from "@/lib/server-manager";
import type { KeywordAnalysisOptions } from "@/lib/keyword-types";

interface UseKeywordResearchHandlersProps {
  primaryKeyword: string;
  location: string;
  language: string;
  forceRefresh: boolean;
  setBlueprintAnalysisResult: (result: null) => void;
  setIsAnalyzingKeyword: (isAnalyzing: boolean) => void;
  analyzeKeyword: (keyword: string, options: KeywordAnalysisOptions) => Promise<void>;
  clearResults: () => void;
}

export function useKeywordResearchHandlers({
  primaryKeyword,
  location,
  language,
  forceRefresh,
  setBlueprintAnalysisResult,
  setIsAnalyzingKeyword,
  analyzeKeyword,
  clearResults,
}: UseKeywordResearchHandlersProps) {
  const handleAnalyze = useCallback(async () => {
    if (!primaryKeyword.trim()) {
      notify.error(NOTIFY_PLEASE_ENTER_A_PRIMARY_KEYWORD);
      return;
    }

    try {
      // Clear blueprint analysis results when user searches for a keyword manually
      // This prevents blueprint analysis from interfering with keyword search
      setBlueprintAnalysisResult(null);
      
      // Clear any old/cached data for this keyword to ensure fresh results
      clearResults();
      
      await analyzeKeyword(primaryKeyword, {
        location,
        language,
        depth: 10,
        peopleAlsoAskClickDepth: 4,
        forceRefresh: forceRefresh, // Force fresh data from API
      });
    } catch (err) {
      console.error("Analysis error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to analyze keyword";
      notifyHeaderError("Keyword analysis failed", err);
      // Don't show stale data if analysis fails
      clearResults();
    }
  }, [primaryKeyword, location, language, forceRefresh, analyzeKeyword, clearResults, setBlueprintAnalysisResult]);

  const handleClear = useCallback(() => {
    clearResults();
    // Also clear cache and database for this keyword to remove any placeholder data
    if (primaryKeyword) {
      clearKeywordCache();
      clearKeywordResearchCache();
    }
    notify.info(NOTIFY_KEYWORD_RESEARCH_CLEARED);
  }, [clearResults, primaryKeyword]);

  const handleClearAllCache = useCallback(() => {
    clearAllKeywordData();
    clearKeywordCache();
    clearResults();
    notify.success(NOTIFY_ALL_CACHED_KEYWORD_DATA_CLEARED);
  }, [clearResults]);

  const handleAnalyzeKeyword = useCallback(async () => {
    // Validate that a keyword is entered
    if (!primaryKeyword.trim()) {
      notify.error(NOTIFY_PLEASE_ENTER_A_KEYWORD_TO_ANALYZE);
      return;
    }

    setIsAnalyzingKeyword(true);
    setBlueprintAnalysisResult(null);

    try {
      // Ensure keyword server is running before proceeding
      notify.info(NOTIFY_CHECKING_KEYWORD_SERVER_STATUS);
      let serverResult;
      try {
        serverResult = await ensureServerRunning((message) => {
          notify.info(message, { duration: 2000 });
        });
      } catch (serverCheckError) {
        console.error('[Keyword Research] Error checking server status:', serverCheckError);
        notify.error(notifyFailedToCheckServerStatusX(serverCheckError instanceof Error ? serverCheckError.message : 'Unknown error'));
        setIsAnalyzingKeyword(false);
        return;
      }

      if (!serverResult || !serverResult.success) {
        notify.error(notifyServerErrorX(serverResult?.message || 'Unknown server error'));
        setIsAnalyzingKeyword(false);
        return;
      }

      if (!serverResult.wasAlreadyRunning) {
        notify.success(NOTIFY_KEYWORD_SERVER_STARTED_SUCCESSFULLY);
      }

      notify.info(notifyAnalyzingKeywordX(primaryKeyword));
      
      // Clear any old/cached data for this keyword to ensure fresh results
      try {
        clearResults();
      } catch (clearError) {
        console.warn('[Keyword Research] Error clearing results:', clearError);
        // Continue anyway
      }
      
      // Analyze the keyword directly using the analyzeKeyword function
      try {
        await analyzeKeyword(primaryKeyword.trim(), {
          location,
          language,
          depth: 10,
          peopleAlsoAskClickDepth: 4,
          forceRefresh: forceRefresh, // Force fresh data from API
        });

        notify.success(notifyKeywordXAnalyzedSuccessfully(primaryKeyword.trim()));
      } catch (analysisError) {
        console.error("Keyword analysis error:", analysisError);
        const errorMessage = analysisError instanceof Error ? analysisError.message : 'Unknown error';
        notify.error(notifyAnalysisFailedX(errorMessage));
        // Don't show stale data if analysis fails
        try {
          clearResults();
        } catch (clearError) {
          console.warn('[Keyword Research] Error clearing results after analysis failure:', clearError);
        }
        // Re-throw to be caught by outer catch
        throw analysisError;
      }
    } catch (error) {
      // Catch any unexpected errors
      console.error("Unexpected error in keyword analysis:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      notify.error(notifyUnexpectedErrorX(errorMessage));
      
      // Ensure results are cleared on any error
      try {
        clearResults();
      } catch (clearError) {
        console.warn('[Keyword Research] Error clearing results in error handler:', clearError);
      }
      } finally {
      try {
        setIsAnalyzingKeyword(false);
      } catch (stateError) {
        console.error('[Keyword Research] Error resetting analyzing state:', stateError);
      }
    }
  }, [primaryKeyword, location, language, forceRefresh, analyzeKeyword, clearResults, setIsAnalyzingKeyword, setBlueprintAnalysisResult]);

  return {
    handleAnalyze,
    handleClear,
    handleClearAllCache,
    handleAnalyzeKeyword,
  };
}

