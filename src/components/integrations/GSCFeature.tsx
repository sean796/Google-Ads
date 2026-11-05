import React, { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_FAILED_TO_COPY_EMAIL_TO_CLIPBOARD, NOTIFY_FAILED_TO_COPY_LIST, NOTIFY_GSC_EMAIL_COPIED_TO_CLIPBOARD, NOTIFY_GSC_NO_PROPERTIES_RETURNED, NOTIFY_GSC_QUERIES_FETCHED_BUT_KEYWORD_ANALYSIS, NOTIFY_NO_ANALYSIS_RESULTS_GENERATED_PLEASE_CHE, NOTIFY_PROPERTY_LIST_COPIED_TO_CLIPBOARD, NOTIFY_TESTING_GSC_CONNECTION, notifyFetchedXGscQueriesAnalyzingXUnique, notifyFetchingGscQueriesForX, notifyGscConnectedXProperties, notifyGscQueriesAddedX, notifyKeywordAnalysisCompleteFoundMetrics, notifyNoGscQueriesFoundForXInTheSpecif, notifyRunningXAnalysisMethodS, notifySuccessfullyAnalyzedGscQueriesFromX } from "@/lib/notify-messages";
import { TestTube, Copy, Check, Search } from "lucide-react";
import { loadApiKey } from "@/lib/api";
import { getKeywordOverview } from "@/lib/keyword-api";
import {
  runAnalyses,
  type GSCQuery,
  type AnalysisMethod,
  ANALYSIS_METHODS,
} from "@/lib/gsc-keyword-analyzer";
import { type WordPressSite, KB_FILES_STORAGE_KEY, type StoredFile } from "./types";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { Button } from "@/ui";

export interface GSCFeatureRef {
  openDialog: (site: WordPressSite) => void;
  isFetchingGSC: string | null;
}

/** Placeholder until `/api/gsc/service-account-email` loads (server derives real email from credential JSON). */
const GSC_EMAIL_FALLBACK = "neopulse@neopulse-505422.iam.gserviceaccount.com";

export type GscServiceAccountIdentity = {
  /** Service account email — must be added in Search Console for each property (matches server JWT). */
  email: string;
};

const GSC_IDENTITY_FALLBACK: GscServiceAccountIdentity = {
  email: GSC_EMAIL_FALLBACK,
};

export function useGscServiceAccountIdentity(): GscServiceAccountIdentity {
  const [identity, setIdentity] = React.useState<GscServiceAccountIdentity>(GSC_IDENTITY_FALLBACK);
  React.useEffect(() => {
    fetch(`${BACKEND_API_BASE}/api/gsc/service-account-email`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { email?: string } | null) => {
        if (!data?.email?.trim()) return;
        setIdentity({ email: data.email.trim() });
      })
      .catch(() => {});
  }, []);
  return identity;
}

/** Row from GET /api/gsc/test-connection `sites` array */
type GscTestSiteRow = {
  siteUrl: string;
  permissionLevel?: string;
  originalFormat?: string;
};

/** Service account email, copy, and test connection - use on Settings or inside {@link GSCFeature}. */
export const GSCConnectionCard: React.FC<{ identity: GscServiceAccountIdentity }> = ({ identity }) => {
  const { email: gscEmail } = identity;
  const [isTestingGSC, setIsTestingGSC] = useState(false);
  const [gscEmailCopied, setGscEmailCopied] = useState(false);
  /** Last successful test-connection payload so users see sites.list without opening DevTools */
  const [sitesListSnapshot, setSitesListSnapshot] = useState<{
    sites: GscTestSiteRow[];
    credentialsInUse?: string | null;
    siteCount: number;
  } | null>(null);

  const handleCopyGSCEmail = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(gscEmail);
      setGscEmailCopied(true);
      notify.success(NOTIFY_GSC_EMAIL_COPIED_TO_CLIPBOARD);
      setTimeout(() => setGscEmailCopied(false), 2000);
    } catch {
      notify.error(NOTIFY_FAILED_TO_COPY_EMAIL_TO_CLIPBOARD);
    }
  }, [gscEmail]);

  const handleCopySitesList = useCallback(async () => {
    if (!sitesListSnapshot) return;
    const lines: string[] = [];
    if (sitesListSnapshot.credentialsInUse) {
      lines.push(`API identity: ${sitesListSnapshot.credentialsInUse}`);
    }
    lines.push(`Property count: ${sitesListSnapshot.siteCount}`, "");
    sitesListSnapshot.sites.forEach((s) => {
      const raw = (s.originalFormat || s.siteUrl || "").trim();
      lines.push(s.permissionLevel ? `${raw}\t(${s.permissionLevel})` : raw);
    });
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      notify.success(NOTIFY_PROPERTY_LIST_COPIED_TO_CLIPBOARD);
    } catch {
      notify.error(NOTIFY_FAILED_TO_COPY_LIST);
    }
  }, [sitesListSnapshot]);

  const handleTestGSCConnection = useCallback(async () => {
    setIsTestingGSC(true);
    try {
      notify.info(NOTIFY_TESTING_GSC_CONNECTION);
      console.log('[GSC Test] Calling API:', `${BACKEND_API_BASE}/api/gsc/test-connection`);
      const response = await fetch(`${BACKEND_API_BASE}/api/gsc/test-connection`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }
        console.error('[GSC Test] API Error Response:', errorData);
        let errorMessage = errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`;
        if (errorData.details) {
          errorMessage += `\n\nDetails: ${errorData.details}`;
        }
        if (errorData.troubleshooting) {
          errorMessage += `\n\nTroubleshooting:\n`;
          Object.values(errorData.troubleshooting).forEach((step, i) => {
            errorMessage += `${i + 1}. ${step}\n`;
          });
        }
        throw new Error(errorMessage);
      }
      const data = await response.json();
      if (!data.success) {
        let errorMessage = data.error || data.message || 'GSC connection test failed';
        if (data.details) {
          errorMessage += `\n\nDetails: ${data.details}`;
        }
        console.error('[GSC Test] API returned error:', data);
        throw new Error(errorMessage);
      }
      const credentialsInUse = (data as { credentialsInUse?: string | null }).credentialsInUse ?? null;
      const rawSites = Array.isArray(data.sites) ? (data.sites as GscTestSiteRow[]) : [];
      const siteCount =
        typeof data.siteCount === "number" ? data.siteCount : rawSites.length;
      setSitesListSnapshot({
        sites: rawSites,
        credentialsInUse,
        siteCount,
      });

      if (rawSites.length > 0) {
        const preview = rawSites.slice(0, 25).map((s) => {
          const label = (s.originalFormat || s.siteUrl || "").trim();
          const perm = s.permissionLevel ? ` (${s.permissionLevel})` : "";
          return `• ${label}${perm}`;
        });
        const descParts: string[] = [];
        if (credentialsInUse) descParts.push(`API identity:\n${credentialsInUse}`);
        descParts.push(preview.join("\n"));
        if (rawSites.length > 25) {
          descParts.push(`… +${rawSites.length - 25} more (full list in card below)`);
        }
        notify.success(notifyGscConnectedXProperties(siteCount), {
          duration: 25000,
          description: descParts.join("\n\n"),
        });
      } else {
        notify.warning(NOTIFY_GSC_NO_PROPERTIES_RETURNED, {
          duration: 14000,
          description: credentialsInUse
            ? `sites.list returned 0 rows for:\n${credentialsInUse}\n\nAdd this user under Search Console → Users for each property (Full).`
            : "sites.list returned 0 rows. Verify the service account is added in Search Console.",
        });
      }
      console.log('[GSC Test] Connection test successful:', data);
    } catch (error) {
      console.error('[GSC Test] Error testing connection:', error);
      let errorMessage = 'Failed to test GSC connection';
      let errorDetails = '';
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes('\n')) {
          const lines = error.message.split('\n');
          errorMessage = lines[0];
          errorDetails = lines.slice(1).join('\n');
        }
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      if (errorDetails) console.error('[GSC Test] Error details:', errorDetails);
      const shortErr =
        errorMessage.length > 120 ? `${errorMessage.slice(0, 117)}...` : errorMessage;
      notify.error(shortErr, { duration: 10000 });
      console.error('[GSC Test] Full error details:', { message: errorMessage, details: errorDetails, error });
    } finally {
      setIsTestingGSC(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Search className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <h3 id="gsc-heading" className="text-base font-semibold text-white">
          Google Search Console
        </h3>
      </div>
      <p className="text-base text-white">
        Add this email in Search Console → Settings → Users for each property (Full access).
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 max-w-full flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-ui-field/50 px-3 py-2 sm:flex-initial sm:max-w-[min(100%,42rem)]">
          <span className="shrink-0 text-base text-white">API identity</span>
          <code className="min-w-0 flex-1 select-all break-words font-mono text-base text-white" title={gscEmail}>
            {gscEmail}
          </code>
          <Button
            variant="quiet"
            onClick={handleCopyGSCEmail}
            title="Copy email"
            type="button"
          >
            {gscEmailCopied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
        <Button
          type="button"
          onClick={handleTestGSCConnection}
          disabled={isTestingGSC}
        >
          {isTestingGSC ? (
            <>
              
              Testing...
            </>
          ) : (
            <>
              <TestTube className="mr-2 h-4 w-4" />
              Test GSC Connection
            </>
          )}
        </Button>
      </div>
      {sitesListSnapshot ? (
        <div className="space-y-2 rounded-lg border border-white/[0.08] bg-ui-field/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-base font-semibold text-white">
              Properties from Google ({sitesListSnapshot.siteCount})
            </span>
            <Button
              type="button"
              onClick={handleCopySitesList}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy list
            </Button>
          </div>
          {sitesListSnapshot.credentialsInUse ? (
            <p className="text-xs text-muted-foreground">
              JWT used for this call:{" "}
              <code className="break-all rounded bg-black/25 px-1 py-0.5 text-base">
                {sitesListSnapshot.credentialsInUse}
              </code>
            </p>
          ) : null}
          <ul
            className="max-h-52 list-none space-y-1 overflow-y-auto rounded border border-border/60 bg-background/60 p-2 text-xs font-mono leading-relaxed"
            aria-label="Google Search Console properties returned for this service account"
          >
            {sitesListSnapshot.sites.length === 0 ? (
              <li className="italic text-muted-foreground">
                No rows: Google returned an empty sites.list for this JWT. If a domain is missing, add this user in
                Search Console or align the deployed service account JSON.
              </li>
            ) : (
              sitesListSnapshot.sites.map((s, i) => (
                <li key={`${s.siteUrl}-${i}`} className="break-all border-b border-border/40 pb-1.5 last:border-0 last:pb-0">
                  <span className="text-foreground">{s.originalFormat || s.siteUrl}</span>
                  {s.permissionLevel ? (
                    <span className="ml-1 text-muted-foreground">({s.permissionLevel})</span>
                  ) : null}
                </li>
              ))
            )}
          </ul>
          <p className="text-base text-muted-foreground">
            Values above are Google&apos;s raw <code className="text-base">siteUrl</code> strings; the app normalizes
            them when matching your WordPress site URL.
          </p>
        </div>
      ) : null}
    </div>
  );
};

/** Settings page: connection card with its own service-account email fetch. */
export const GSCSettingsConnectionSection: React.FC = () => {
  const gscIdentity = useGscServiceAccountIdentity();
  return <GSCConnectionCard identity={gscIdentity} />;
};

interface GSCFeatureProps {
  onRef?: (ref: GSCFeatureRef) => void;
  /** When false, only dialogs + ref (card lives on Settings). Default true. */
  showConnectionCard?: boolean;
}

export const GSCFeature: React.FC<GSCFeatureProps> = ({ onRef, showConnectionCard = true }) => {
  const gscIdentity = useGscServiceAccountIdentity();
  const gscEmail = gscIdentity.email;
  const [gscAnalysisDialogOpen, setGscAnalysisDialogOpen] = useState(false);
  const [selectedAnalysisMethods, setSelectedAnalysisMethods] = useState<AnalysisMethod[]>([]);
  const [pendingGSCSite, setPendingGSCSite] = useState<WordPressSite | null>(null);
  const [isFetchingGSC, setIsFetchingGSC] = useState<string | null>(null);
  
  // Store onRef in a ref to avoid infinite loop - refs don't trigger re-renders
  const onRefRef = React.useRef(onRef);
  React.useEffect(() => {
    onRefRef.current = onRef;
  }, [onRef]);

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

  // Expose ref to parent - update whenever isFetchingGSC changes
  // Use onRefRef.current instead of onRef in dependencies to break infinite loop
  React.useEffect(() => {
    if (onRefRef.current) {
      onRefRef.current({
        openDialog: handleOpenGSCAnalysisDialog,
        isFetchingGSC,
      });
    }
  }, [handleOpenGSCAnalysisDialog, isFetchingGSC]);

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
      console.log('[GSC] Calling API:', `${BACKEND_API_BASE}/api/gsc/fetch-queries`);
      console.log('[GSC] Request:', {
        siteUrl: site.siteUrl,
        startDate: startDateStr,
        endDate: endDateStr
      });
      
      const response = await fetch(`${BACKEND_API_BASE}/api/gsc/fetch-queries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteUrl: site.siteUrl,
          startDate: startDateStr,
          endDate: endDateStr,
        }),
      });

      if (!response.ok) {
        let errorData: { error?: string; message?: string; errorType?: string; details?: string; triedFormats?: string[]; serviceAccountEmail?: string; troubleshooting?: Record<string, string> };
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }

        console.error('[GSC] API Error Response:', errorData);

        // When the site is not in the service account's GSC list, build the ENTIRE message from gscEmail only (never use backend error text - it may contain wrong email from cached server)
        if (errorData.errorType === 'site_not_in_list') {
          console.info(
            '[GSC] Site not in service account property list - skipping fetch. Configure GSC in Settings if you need query export.',
            { serviceAccountEmail: gscEmail, originalSiteUrl: errorData.originalSiteUrl },
          );
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
        
        console.error('[GSC] API returned error:', data);
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
      let keywordMetrics: Record<string, { searchVolume: number; difficulty: number; cpc: number; competition: string }> = {};
      
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
        console.warn('[GSC] Error fetching keyword metrics:', error);
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
        const samplePositions = gscQueries.slice(0, 10).map(q => q.position);
        console.log(`[GSC] Sample positions from queries:`, samplePositions);
        
        console.log(`[GSC] Running ${selectedMethods.length} analysis method(s) on ${gscQueries.length} total queries`);
        
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
        
        console.log(`[GSC] Analysis complete. Got ${analysisResults.length} result(s)`);
        
        if (analysisResults.length === 0) {
          notify.warning(NOTIFY_NO_ANALYSIS_RESULTS_GENERATED_PLEASE_CHE);
          setIsFetchingGSC(null);
          return;
        }
        
        // Create CSV files for each analysis result
        let totalAnalysisQueries = 0;
        for (const result of analysisResults) {
          console.log(`[GSC] Processing ${result.methodLabel}: ${result.keywords.length} filtered queries (from ${gscQueries.length} total)`);
          
          // Analysis results should already be filtered by the analysis method
          if (result.keywords.length === 0) {
            console.warn(`[GSC] Warning: ${result.methodLabel} returned 0 queries after filtering`);
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
          console.log(`[GSC Analysis] ${result.methodLabel}: ${analysisEnrichedQueries.length} queries after filtering`);
          
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
        console.log(`[GSC] Added ${data.queries.length} queries from ${site.name}${metricsMessage}`);
        notify.success(notifyGscQueriesAddedX(data.queries.length));
      }
      // Analysis case success message is already shown above
      
    } catch (error) {
      console.error('[GSC] Error fetching queries:', error);
      
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
          console.error('[GSC] Error stack:', error.stack);
        }
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      if (errorDetails) console.error("[GSC] Error details:", errorDetails);
      const shortErr =
        errorMessage.length > 120 ? `${errorMessage.slice(0, 117)}...` : errorMessage;
      notify.error(shortErr, { duration: 10000 });
      
      // Also log to console with full details
      console.error('[GSC] Full error details:', {
        message: errorMessage,
        details: errorDetails,
        error: error
      });
    } finally {
      setIsFetchingGSC(null);
    }
  }, [convertQueriesToCSV, gscEmail]);

  return (
    <>
      {showConnectionCard ? <GSCConnectionCard identity={gscIdentity} /> : null}

      {/* GSC Analysis Dialog */}
      <Dialog open={gscAnalysisDialogOpen} onOpenChange={setGscAnalysisDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Analysis Methods</DialogTitle>
            <DialogDescription>
              Choose one or more analysis methods to analyze GSC queries for {pendingGSCSite?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {(Object.keys(ANALYSIS_METHODS) as AnalysisMethod[]).map((method) => {
              const methodInfo = ANALYSIS_METHODS[method];
              const isSelected = selectedAnalysisMethods.includes(method);
              
              return (
                <div
                  key={method}
                  className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                >
                  <Checkbox
                    id={method}
                    checked={isSelected}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedAnalysisMethods([...selectedAnalysisMethods, method]);
                      } else {
                        setSelectedAnalysisMethods(selectedAnalysisMethods.filter(m => m !== method));
                      }
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <label
                      htmlFor={method}
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      {methodInfo.label}
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                setGscAnalysisDialogOpen(false);
                setSelectedAnalysisMethods([]);
                setPendingGSCSite(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="run"
              onClick={() => {
                if (!pendingGSCSite) return;
                if (selectedAnalysisMethods.length === 0) {
                  // No methods selected, just fetch with keyword metrics
                  handleFetchGSCQueries(pendingGSCSite, []);
                } else {
                  // Methods selected, fetch and run analyses
                  handleFetchGSCQueries(pendingGSCSite, selectedAnalysisMethods);
                }
              }}
              disabled={!pendingGSCSite}
            >
              {selectedAnalysisMethods.length === 0 ? 'Fetch Queries Only' : `Fetch & Analyze (${selectedAnalysisMethods.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

