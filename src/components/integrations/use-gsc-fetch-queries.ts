import { useCallback, useState } from "react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_GSC_QUERIES_FETCHED_BUT_KEYWORD_ANALYSIS, NOTIFY_NO_ANALYSIS_RESULTS_GENERATED_PLEASE_CHE, notifyFetchedXGscQueriesAnalyzingXUnique, notifyFetchingGscQueriesForX, notifyGscQueriesAddedX, notifyKeywordAnalysisCompleteFoundMetrics, notifyNoGscQueriesFoundForXInTheSpecif, notifyRunningXAnalysisMethodS, notifySuccessfullyAnalyzedGscQueriesFromX } from "@/lib/notify-messages";
import { loadApiKey } from "@/lib/api";
import { getKeywordOverview } from "@/lib/keyword-api";
import {
  runAnalyses,
  type GSCQuery,
  type AnalysisMethod,
} from "@/lib/gsc-keyword-analyzer";
import { type WordPressSite, KB_FILES_STORAGE_KEY, type StoredFile } from "./types";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { logger } from "@/lib/logger";

export function useGscFetchQueries(gscEmail: string) {
  const [gscAnalysisDialogOpen, setGscAnalysisDialogOpen] = useState(false);
  const [selectedAnalysisMethods, setSelectedAnalysisMethods] = useState<AnalysisMethod[]>([]);
  const [pendingGSCSite, setPendingGSCSite] = useState<WordPressSite | null>(null);
  const [isFetchingGSC, setIsFetchingGSC] = useState<string | null>(null);

  // Expose method to open dialog from WordPressFeature
  const handleOpenGSCAnalysisDialog = useCallback((site: WordPressSite) => {
    setPendingGSCSite(site);
    setSelectedAnalysisMethods([]);
    setGscAnalysisDialogOpen(true);
  }, []);
  /**
   * Convert query data to CSV format with keyword analysis data
   */
  const convertQueriesToCSV = useCallback((queries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    date: string;
    searchVolume?: number;
    difficulty?: number;
    cpc?: number;
    competition?: string;
  }>): string => {
    // CSV header with keyword analysis fields
    const header = 'query,clicks,impressions,ctr,position,date,search_volume,keyword_difficulty,cpc,competition\n';
    
    // Convert each query to CSV row
    const rows = queries.map(q => {
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      const escapedQuery = q.query.includes(',') || q.query.includes('"') || q.query.includes('\n')
        ? `"${q.query.replace(/"/g, '""')}"`
        : q.query;
      
      // Add keyword analysis fields (or empty if not available)
      const searchVolume = q.searchVolume ?? '';
      const difficulty = q.difficulty ?? '';
      const cpc = q.cpc ?? '';
      const competition = q.competition ?? '';
      
      return `${escapedQuery},${q.clicks},${q.impressions},${q.ctr.toFixed(4)},${q.position.toFixed(2)},${q.date},${searchVolume},${difficulty},${cpc},${competition}`;
    });
    
    return header + rows.join('\n');
  }, []);

  /**
   * Fetch GSC queries for a site and add to knowledge base with analysis
   */
  const handleFetchGSCQueries = useCallback(async (site: WordPressSite, selectedMethods: AnalysisMethod[] = []) => {
    setIsFetchingGSC(site.id);
    setGscAnalysisDialogOpen(false);
    
    try {
      notify.info(notifyFetchingGscQueriesForX(site.name));
      
      // Calculate date range
      // endDate must be today - 3 days (GSC data delay)
      // startDate is 90 days before endDate
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(today.getDate() - 3); // Today - 3 days
      
      const startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - 90); // 90 days before endDate
      
      // Format dates as YYYY-MM-DD
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      
      // Call backend API
      
      const response = await fetch(`${BACKEND_API_BASE}/api/gsc/fetch-queries`, {
        method: 'POST',
        credentials: "include",
        headers: neoPulseApiHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          siteUrl: site.siteUrl,
          startDate: startDateStr,
          endDate: endDateStr,
        }),
      });

      if (!response.ok) {
        let errorData: { error?: string; message?: string; errorType?: string; details?: string; triedFormats?: string[]; serviceAccountEmail?: string; troubleshooting?: Record<string, string>; originalSiteUrl?: string };
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }

        logger.error('[GSC] API Error Response:', errorData);

        // When the site is not in the service account's GSC list, build the ENTIRE message from gscEmail only (never use backend error text - it may contain wrong email from cached server)
        if (errorData.errorType === 'site_not_in_list') {
          return;
        }

        // Build detailed error message for other error types
        let errorMessage = errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`;

        if (errorData.triedFormats && Array.isArray(errorData.triedFormats)) {
          errorMessage += `\n\nTried property formats: ${errorData.triedFormats.join(', ')}`;
        }
        if (errorData.details) {
          errorMessage += `\n\nDetails: ${errorData.details}`;
        }
        errorMessage += `\n\nService Account: ${gscEmail}`;

        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        let errorMessage = data.error || data.message || 'Failed to fetch GSC queries';
        
        // Add tried formats if available
        if (data.triedFormats && Array.isArray(data.triedFormats)) {
          errorMessage += `\n\nTried property formats: ${data.triedFormats.join(', ')}`;
        }
        
        // Add details if available
        if (data.details) {
          errorMessage += `\n\nDetails: ${data.details}`;
        }
        
        logger.error('[GSC] API returned error:', data);
        throw new Error(errorMessage);
      }
      
      if (!data.queries || data.queries.length === 0) {
        notify.info(notifyNoGscQueriesFoundForXInTheSpecif(site.name));
        return;
      }
      
      // Extract unique queries for keyword analysis (preserve original case from first occurrence)
      const uniqueQueryMap: Record<string, string> = {};
      data.queries.forEach((q: { query: string }) => {
        const lowerKey = q.query.toLowerCase();
        if (!uniqueQueryMap[lowerKey]) {
          uniqueQueryMap[lowerKey] = q.query;
        }
      });
      const uniqueQueries = Object.values(uniqueQueryMap);
      
      notify.info(notifyFetchedXGscQueriesAnalyzingXUnique(data.queries.length, uniqueQueries.length));
      
      // Fetch keyword metrics for all unique queries
      const keywordMetrics: Record<string, { searchVolume: number; difficulty: number; cpc: number; competition: string }> = {};
      
      try {
        const batchSize = 100; // Process in batches to avoid overwhelming the API
        for (let i = 0; i < uniqueQueries.length; i += batchSize) {
          const batch = uniqueQueries.slice(i, i + batchSize);
          const metrics = await getKeywordOverview(batch, "United States", "en", true);
          
          // Build a lookup map by keyword (case-insensitive)
          metrics.forEach(metric => {
            keywordMetrics[metric.keyword.toLowerCase()] = {
              searchVolume: metric.searchVolume,
              difficulty: metric.difficulty,
              cpc: metric.cpc,
              competition: metric.competition || 'LOW'
            };
          });
        }
        
        notify.success(notifyKeywordAnalysisCompleteFoundMetrics(Object.keys(keywordMetrics).length));
      } catch (error) {
        logger.warn('[GSC] Error fetching keyword metrics:', error);
        notify.warning(NOTIFY_GSC_QUERIES_FETCHED_BUT_KEYWORD_ANALYSIS);
      }
      
      // Enrich queries with keyword metrics
      const enrichedQueries = data.queries.map((q: { query: string; clicks: number; impressions: number; ctr: number; position: number; date: string }) => {
        const metrics = keywordMetrics[q.query.toLowerCase()];
        return {
          ...q,
          searchVolume: metrics?.searchVolume,
          difficulty: metrics?.difficulty,
          cpc: metrics?.cpc,
          competition: metrics?.competition
        };
      });
      
      // Get existing files
      const storedFilesString = localStorage.getItem(KB_FILES_STORAGE_KEY) || '[]';
      const existingFiles = JSON.parse(storedFilesString) as StoredFile[];
      const newFiles: StoredFile[] = [];
      const sanitizedSiteName = site.name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
      const timestamp = Date.now();
      
      // If analysis methods selected, run analyses and create separate CSV files
      if (selectedMethods.length > 0) {
        notify.info(notifyRunningXAnalysisMethodS(selectedMethods.length));
        
        // Load OpenRouter API key for AI analysis
        const openRouterApiKey = loadApiKey();
        
        // Convert enriched queries to GSCQuery format for analysis
        // Ensure position is a number for proper filtering
        const gscQueries: GSCQuery[] = enrichedQueries.map(q => ({
          query: q.query,
          clicks: typeof q.clicks === 'number' ? q.clicks : parseInt(String(q.clicks), 10) || 0,
          impressions: typeof q.impressions === 'number' ? q.impressions : parseInt(String(q.impressions), 10) || 0,
          ctr: typeof q.ctr === 'number' ? q.ctr : parseFloat(String(q.ctr)) || 0,
          position: typeof q.position === 'number' ? q.position : parseFloat(String(q.position)) || 0,
          date: q.date
        }));
        
        // Log sample of positions for debugging
        
        
        // Run analyses
        const analysisResults = await runAnalyses(
          gscQueries,
          selectedMethods,
          {
            apiKey: openRouterApiKey || '',
            model: getResearchModel(),
            temperature: 1.0,
            maxTokens: 4000,
            topP: 0.9,
            siteName: site.name,
            siteUrl: site.siteUrl,
          }
        );
        
        
        if (analysisResults.length === 0) {
          notify.warning(NOTIFY_NO_ANALYSIS_RESULTS_GENERATED_PLEASE_CHE);
          setIsFetchingGSC(null);
          return;
        }
        
        // Create CSV files for each analysis result
        let totalAnalysisQueries = 0;
        for (const result of analysisResults) {
          
          // Analysis results should already be filtered by the analysis method
          if (result.keywords.length === 0) {
            logger.warn(`[GSC] Warning: ${result.methodLabel} returned 0 queries after filtering`);
            continue; // Skip creating file for empty results
          }
          
          const analysisEnrichedQueries = result.keywords.map((q: GSCQuery) => {
            const metrics = keywordMetrics[q.query.toLowerCase()];
            return {
              ...q,
              searchVolume: metrics?.searchVolume,
              difficulty: metrics?.difficulty,
              cpc: metrics?.cpc,
              competition: metrics?.competition
            };
          });
          
          totalAnalysisQueries += analysisEnrichedQueries.length;
          
          const csvContent = convertQueriesToCSV(analysisEnrichedQueries);
          const fileName = `gsc-${result.method}-${sanitizedSiteName}-${timestamp}.csv`;
          
          newFiles.push({
            name: fileName,
            size: csvContent.length,
            content: csvContent,
            starred: false,
            timestamp: timestamp,
          });
        }
        
        // Update success message variables
        const metricsCount = Object.keys(keywordMetrics).length;
        const metricsMessage = metricsCount > 0 
          ? ` with keyword metrics for ${metricsCount} keywords` 
          : ' (keyword analysis unavailable)';
        const analysisMessage = analysisResults.length > 0
          ? ` Generated ${analysisResults.length} analysis file(s) with ${totalAnalysisQueries} filtered queries`
          : '';
        notify.success(notifySuccessfullyAnalyzedGscQueriesFromX(site.name, metricsMessage, analysisMessage));
      } else {
        // No analysis methods selected, just create main CSV with all queries
        const csvContent = convertQueriesToCSV(enrichedQueries);
        const fileName = `gsc-queries-${sanitizedSiteName}-${timestamp}.csv`;
        
        newFiles.push({
          name: fileName,
          size: csvContent.length,
          content: csvContent,
          starred: false,
          timestamp: timestamp,
        });
      }
      
      // Add all new files
      const allFiles = [...existingFiles, ...newFiles];
      localStorage.setItem(KB_FILES_STORAGE_KEY, JSON.stringify(allFiles));
      
      // Dispatch event to notify UI
      window.dispatchEvent(new CustomEvent('kb-files-updated', { 
        detail: { files: allFiles } 
      }));
      
      // Success message for non-analysis case (all queries)
      if (selectedMethods.length === 0) {
        const metricsCount = Object.keys(keywordMetrics).length;
        const metricsMessage = metricsCount > 0 
          ? ` with keyword metrics for ${metricsCount} keywords` 
          : ' (keyword analysis unavailable)';
        notify.success(notifyGscQueriesAddedX(data.queries.length));
      }
      // Analysis case success message is already shown above
      
    } catch (error) {
      logger.error('[GSC] Error fetching queries:', error);
      
      let errorMessage = 'Failed to fetch GSC queries';
      let errorDetails = '';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // If the error message contains newlines, format it nicely
        if (error.message.includes('\n')) {
          // Split by newlines and format
          const lines = error.message.split('\n');
          errorMessage = lines[0]; // First line as main message
          errorDetails = lines.slice(1).join('\n'); // Rest as details
        }
        
        // Log full error details for debugging
        if (error.stack) {
          logger.error('[GSC] Error stack:', error.stack);
        }
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      if (errorDetails) logger.error("[GSC] Error details:", errorDetails);
      const shortErr =
        errorMessage.length > 120 ? `${errorMessage.slice(0, 117)}...` : errorMessage;
      notify.error(shortErr, { duration: 10000 });
      
      // Also log to console with full details
      logger.error('[GSC] Full error details:', {
        message: errorMessage,
        details: errorDetails,
        error: error
      });
    } finally {
      setIsFetchingGSC(null);
    }
  }, [convertQueriesToCSV, gscEmail]);

  return {
    handleFetchGSCQueries,
    gscAnalysisDialogOpen,
    setGscAnalysisDialogOpen,
    isFetchingGSC,
    handleOpenGSCAnalysisDialog,
    selectedAnalysisMethods,
    setSelectedAnalysisMethods,
    pendingGSCSite,
    setPendingGSCSite,
  };
}
