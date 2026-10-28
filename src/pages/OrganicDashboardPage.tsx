import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import {
  buildOrganicReportingShareSearch,
  type OrganicReportingShareState,
} from "@/lib/organic-dashboard/organic-reporting-share-url";
import { resolveOrganicDashboardSite } from "@/lib/organic-dashboard/resolve-organic-dashboard-site";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WordPressSite } from "@/components/integrations/types";
import { getStoredSites } from "@/components/integrations/storage";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { useManagerErrorLog } from "@/contexts/manager-error-log-context";
import { OrganicReportingStudioShell } from "@/components/organic-dashboard/OrganicReportingStudioShell";
import {
  NEO_PULSE_OPEN_ORGANIC_REPORTING_EVENT,
  type OpenOrganicReportingDetail,
} from "@/lib/organic-dashboard/organic-reporting-nav";
import type { Ga4ReportingDateHarness } from "@/components/research/reporting/Ga4ReportingDateRangePopover";
import {
  resolveGa4PropertyIdForReporting,
  resolveGa4PropertyIdForReportingAsync,
} from "@/lib/ga4-reporting-property";
import {
  resolveGoogleAdsCustomerIdForReporting,
  resolveGoogleAdsCustomerIdForReportingAsync,
} from "@/lib/ads-reporting/ads-reporting-metrics";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { useOrganicDashboardBundleQuery } from "@/hooks/use-organic-dashboard-bundle-query";
import {
  mergeHighlightsWithLocalGridNarrative,
  organicReportingHighlightsQueryKey,
  runOrganicReportingHighlightsQuery,
  useLocalGridReportNarrativeQuery,
  useOrganicReportingHighlightsQuery,
} from "@/hooks/use-organic-reporting-highlights-query";
import {
  buildOrganicReportingHighlightsSnapshot,
  fetchLocalGridReportingNarrative,
} from "@/lib/organic-dashboard/organic-reporting-highlights";
import { ORGANIC_DASHBOARD_QUERY_STALE_MS } from "@/lib/organic-dashboard/organic-dashboard-prefetch";
import { buildOrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import {
  buildOrganicDashboardFetchParams,
  defaultOrganicReportingDateHarness,
  refreshOrganicReportingDateHarness,
} from "@/lib/organic-dashboard/organic-dashboard-fetch-params";
import {
  reportOrganicDashboardFetchError,
  reportOrganicDashboardSourceErrors,
} from "@/lib/organic-dashboard/organic-dashboard-report-errors";
import { resolveSemrushProjectDashboardUrlForSite } from "@/lib/semrush-project-id-defaults";
import { buildOrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";
import {
  buildLocalGridReportingSnapshot,
  fetchLatestLocalGridScanForSite,
} from "@/lib/organic-dashboard/local-grid-client-report";
import { publishOrganicClientReportDeckAndBuildShareUrl } from "@/lib/organic-dashboard/organic-client-report-deck-publish";
import { downloadOrganicClientReportMarkdown } from "@/lib/organic-dashboard/organic-client-report-markdown";
import { downloadOrganicClientReportPdf } from "@/lib/organic-dashboard/organic-client-report-print";
import { writeOrganicDashboardDateSession } from "@/lib/organic-dashboard/organic-dashboard-date-session";
import { formatLocalYmd } from "@/lib/reporting/reporting-date-presets";

/** Deep links only: hand off to the main app Reporting tab (same shell as Generator). */
export default function OrganicDashboardPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const { sites: sitesFromHook } = useWordPressSites();
  const { activeWordPressSiteId } = useActiveWordPressSite();
  const sites = useMemo(
    () => (sitesFromHook.length > 0 ? sitesFromHook : getStoredSites()),
    [sitesFromHook],
  );

  const site = useMemo(
    () => resolveOrganicDashboardSite(sites, siteId, activeWordPressSiteId),
    [sites, siteId, activeWordPressSiteId],
  );

  useEffect(() => {
    if (!site) return;
    window.dispatchEvent(
      new CustomEvent(NEO_PULSE_OPEN_ORGANIC_REPORTING_EVENT, {
        detail: { siteId: site.id } satisfies OpenOrganicReportingDetail,
      }),
    );
    const search =
      typeof window !== "undefined" && window.location.search.startsWith("?")
        ? window.location.search
        : "";
    navigate({ pathname: "/", search, hash: "#organic-reporting" }, { replace: true, flushSync: true });
  }, [navigate, site]);

  return (
    <div className="flex flex-1 items-center justify-center bg-background p-8 text-base text-muted-foreground">
      Opening Reporting…
    </div>
  );
}

export type OrganicReportingPanelProps = {
  site: WordPressSite;
  /** Main Index tab: do not navigate to `/sites/.../organic`. */
  inAppTab?: boolean;
};

export function OrganicReportingPanel({ site, inAppTab = false }: OrganicReportingPanelProps) {
  const { setActiveWordPressSiteId } = useActiveWordPressSite();
  const { reportError } = useManagerErrorLog();
  const { handlePatchSite } = useWordPressSites();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [dateHarness, setDateHarness] = useState<Ga4ReportingDateHarness>(() =>
    refreshOrganicReportingDateHarness(defaultOrganicReportingDateHarness()),
  );
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [downloadPdfBusy, setDownloadPdfBusy] = useState(false);
  const [clientReportBusy, setClientReportBusy] = useState(false);
  const clientReportOpenLock = useRef(false);
  const [ga4PropertyId, setGa4PropertyId] = useState(() => resolveGa4PropertyIdForReporting(site));
  const [googleAdsCustomerId, setGoogleAdsCustomerId] = useState(() =>
    resolveGoogleAdsCustomerIdForReporting(site),
  );
  const [logoBoxTheme, setLogoBoxTheme] = useState<"black" | "white">(
    () => site.clientLogoBoxTheme ?? "black",
  );

  useEffect(() => {
    setActiveWordPressSiteId(site.id);
  }, [site, setActiveWordPressSiteId]);

  useEffect(() => {
    if (site.clientLogoBoxTheme) {
      setLogoBoxTheme(site.clientLogoBoxTheme);
    }
  }, [site.id, site.clientLogoBoxTheme]);

  const shareState = useMemo(
    (): OrganicReportingShareState => ({
      section: "performance",
      ...dateHarness,
    }),
    [dateHarness],
  );

  const siteDisplayName = site.name?.trim() || site.siteUrl;
  const sitePublicUrl = useMemo(
    () => getPublicSiteUrl(site).trim() || site.siteUrl.trim(),
    [site],
  );

  useEffect(() => {
    const qs = buildOrganicReportingShareSearch(shareState);
    const nextSearch = `?${qs}`;
    if (typeof window === "undefined" || window.location.search === nextSearch) return;
    if (inAppTab) {
      const path = window.location.pathname;
      window.history.replaceState(null, "", `${path}${nextSearch}#organic-reporting`);
      return;
    }
    navigate({ pathname: `/sites/${site.id}/organic`, search: qs }, { replace: true });
  }, [inAppTab, navigate, shareState, site.id]);

  useEffect(() => {
    if (!inAppTab) return;
    return () => {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
    };
  }, [inAppTab]);

  useEffect(() => {
    setGa4PropertyId(resolveGa4PropertyIdForReporting(site));
    setGoogleAdsCustomerId(resolveGoogleAdsCustomerIdForReporting(site));
    let cancelled = false;
    void resolveGa4PropertyIdForReportingAsync(site).then((id) => {
      if (!cancelled) setGa4PropertyId(id);
    });
    void resolveGoogleAdsCustomerIdForReportingAsync(site).then((id) => {
      if (!cancelled) setGoogleAdsCustomerId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [site]);

  useEffect(() => {
    writeOrganicDashboardDateSession(dateHarness);
  }, [dateHarness]);

  const todayYmdMax = formatLocalYmd(new Date());
  const showCompare = dateHarness.compareEnabled;

  const fetchParams = useMemo(
    () => buildOrganicDashboardFetchParams(site, dateHarness, ga4PropertyId, googleAdsCustomerId),
    [site, dateHarness, ga4PropertyId, googleAdsCustomerId],
  );

  const siteSemrushProjectDashboardUrl = useMemo(
    () => resolveSemrushProjectDashboardUrlForSite(site),
    [site],
  );

  const bundleQuery = useOrganicDashboardBundleQuery({
    siteId: site.id,
    fetchParams,
    enabled: fetchParams != null,
  });

  const localGridScanQuery = useQuery({
    queryKey: ["organic-reporting-local-grid-scan", site.id] as const,
    queryFn: () => fetchLatestLocalGridScanForSite(site.id),
    staleTime: ORGANIC_DASHBOARD_QUERY_STALE_MS,
    refetchOnWindowFocus: false,
  });

  const localGridSnapshot = useMemo(
    () =>
      localGridScanQuery.data ? buildLocalGridReportingSnapshot(localGridScanQuery.data) : null,
    [localGridScanQuery.data],
  );

  const viewModel = useMemo(
    () =>
      bundleQuery.data
        ? buildOrganicDashboardViewModel(bundleQuery.data, {
            showCompare,
            siteSemrushProjectDashboardUrl,
            googleAdsCustomerIdForReporting: googleAdsCustomerId,
          })
        : undefined,
    [bundleQuery.data, showCompare, siteSemrushProjectDashboardUrl, googleAdsCustomerId],
  );

  const highlightsQuery = useOrganicReportingHighlightsQuery({
    siteId: site.id,
    bundle: bundleQuery.data,
    fetchParams,
    showCompare,
    siteDisplayName,
    sitePublicUrl,
    googleAdsCustomerIdForReporting: googleAdsCustomerId,
    localGridSnapshot,
    enabled: bundleQuery.data != null,
  });

  const highlights = highlightsQuery.data;

  const highlightsSnapshotForGridNarrative = useMemo(() => {
    if (!viewModel) return null;
    return buildOrganicReportingHighlightsSnapshot(
      viewModel,
      siteDisplayName,
      sitePublicUrl,
      showCompare,
      localGridSnapshot,
    );
  }, [viewModel, siteDisplayName, sitePublicUrl, showCompare, localGridSnapshot]);

  const localGridNarrativeQuery = useLocalGridReportNarrativeQuery({
    siteId: site.id,
    snapshot: highlightsSnapshotForGridNarrative,
    highlights,
    enabled: Boolean(viewModel && bundleQuery.data),
  });

  const mergedHighlights = useMemo(
    () => mergeHighlightsWithLocalGridNarrative(highlights, localGridNarrativeQuery.data),
    [highlights, localGridNarrativeQuery.data],
  );

  const localGridNarrativeLoading =
    Boolean(localGridScanQuery.data?.points?.length) &&
    Boolean(mergedHighlights) &&
    (mergedHighlights?.localGridNarrative.length ?? 0) === 0 &&
    (localGridNarrativeQuery.isPending || localGridNarrativeQuery.isFetching);

  const performanceLoading =
    fetchParams != null && bundleQuery.isPending && bundleQuery.data == null;

  const highlightsPending =
    Boolean(bundleQuery.data && viewModel) &&
    !mergedHighlights &&
    (highlightsQuery.isPending || highlightsQuery.isFetching);

  const reportExportReady = Boolean(bundleQuery.data && viewModel && !performanceLoading);

  const preparedOn = formatLocalYmd(new Date());

  const reportContent = useMemo(
    () =>
      viewModel && mergedHighlights
        ? buildOrganicClientReportContent({
            viewModel,
            highlights: mergedHighlights,
            siteName: siteDisplayName,
            siteUrl: sitePublicUrl,
            showCompare,
            preparedOn,
            localGridScan: localGridScanQuery.data ?? null,
            clientLogoUrl: site.clientLogoUrl,
            clientLogoBoxTheme: logoBoxTheme,
          })
        : null,
    [
      viewModel,
      mergedHighlights,
      siteDisplayName,
      sitePublicUrl,
      showCompare,
      preparedOn,
      localGridScanQuery.data,
      site.clientLogoUrl,
      logoBoxTheme,
    ],
  );

  const highlightsError = highlightsQuery.error
    ? highlightsQuery.error instanceof Error
      ? highlightsQuery.error.message
      : "Could not generate report narratives."
    : null;

  useEffect(() => {
    if (bundleQuery.data) {
      reportOrganicDashboardSourceErrors(bundleQuery.data, reportError);
    }
  }, [bundleQuery.data, reportError]);

  useEffect(() => {
    if (bundleQuery.error) {
      reportOrganicDashboardFetchError(bundleQuery.error, reportError);
    }
  }, [bundleQuery.error, reportError]);

  useEffect(() => {
    if (highlightsQuery.error) {
      reportOrganicDashboardFetchError(highlightsQuery.error, reportError);
    }
  }, [highlightsQuery.error, reportError]);

  const handleDateHarnessApply = useCallback((next: Ga4ReportingDateHarness) => {
    setDateHarness(next);
  }, []);

  const handleRefresh = useCallback(() => {
    if (!fetchParams) return;
    void bundleQuery.refetch();
    void localGridScanQuery.refetch();
    if (bundleQuery.data) void highlightsQuery.refetch();
  }, [bundleQuery, fetchParams, highlightsQuery, localGridScanQuery]);

  const handleToggleLogoBoxTheme = useCallback(() => {
    setLogoBoxTheme((prev) => {
      const nextTheme: "black" | "white" = prev === "black" ? "white" : "black";
      handlePatchSite(site.id, { clientLogoBoxTheme: nextTheme });
      return nextTheme;
    });
  }, [handlePatchSite, site.id]);

  const resolveReadyHighlights = useCallback(async () => {
    if (
      mergedHighlights &&
      (!localGridSnapshot?.scanId || mergedHighlights.localGridNarrative.length > 0)
    ) {
      return mergedHighlights;
    }
    if (mergedHighlights && localGridSnapshot && viewModel) {
      const snapshot = buildOrganicReportingHighlightsSnapshot(
        viewModel,
        siteDisplayName,
        sitePublicUrl,
        showCompare,
        localGridSnapshot,
      );
      const supplemental = await fetchLocalGridReportingNarrative(snapshot, site.id);
      if (supplemental.length > 0) {
        return { ...mergedHighlights, localGridNarrative: supplemental };
      }
      return mergedHighlights;
    }
    if (!bundleQuery.data || !fetchParams) {
      throw new Error("Performance data is not ready yet.");
    }
    const queryKey = organicReportingHighlightsQueryKey({
      siteId: site.id,
      fetchParams,
      showCompare,
      siteDisplayName,
      sitePublicUrl,
      localGridScanId: localGridSnapshot?.scanId ?? null,
    });
    return queryClient.fetchQuery({
      queryKey,
      staleTime: ORGANIC_DASHBOARD_QUERY_STALE_MS,
      retry: 0,
      queryFn: ({ signal }) =>
        runOrganicReportingHighlightsQuery(
          {
            siteId: site.id,
            bundle: bundleQuery.data,
            fetchParams,
            showCompare,
            siteDisplayName,
            sitePublicUrl,
            googleAdsCustomerIdForReporting: googleAdsCustomerId,
            localGridSnapshot,
          },
          signal,
        ),
    });
  }, [
    bundleQuery.data,
    fetchParams,
    googleAdsCustomerId,
    localGridSnapshot,
    mergedHighlights,
    queryClient,
    showCompare,
    site.id,
    siteDisplayName,
    sitePublicUrl,
    viewModel,
  ]);

  const handleShareLink = useCallback(async () => {
    if (clientReportBusy || clientReportOpenLock.current) return;
    if (!viewModel || !reportExportReady) {
      reportError("Client report · wait for Performance metrics to finish loading.");
      return;
    }
    clientReportOpenLock.current = true;
    setClientReportBusy(true);
    try {
      const readyHighlights = await resolveReadyHighlights();
      const { shareUrl: publishedUrl } = await publishOrganicClientReportDeckAndBuildShareUrl({
        siteId: site.id,
        siteDisplayName,
        sitePublicUrl,
        shareState,
        viewModel,
        readyHighlights,
        showCompare,
        localGridScan: localGridScanQuery.data ?? null,
      });
      await navigator.clipboard.writeText(publishedUrl);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not publish share link.";
      reportError(`Client report · ${message}`);
      setShareCopied(false);
    } finally {
      clientReportOpenLock.current = false;
      setClientReportBusy(false);
    }
  }, [
    clientReportBusy,
    reportExportReady,
    reportError,
    resolveReadyHighlights,
    shareState,
    showCompare,
    site.id,
    siteDisplayName,
    sitePublicUrl,
    viewModel,
    localGridScanQuery.data,
  ]);

  const handleDownloadPdf = useCallback(async () => {
    if (downloadPdfBusy) return;
    if (!viewModel || !reportExportReady) {
      reportError("Client report · wait for Performance metrics to finish loading.");
      return;
    }
    setDownloadPdfBusy(true);
    try {
      const readyHighlights = await resolveReadyHighlights();
      const content = buildOrganicClientReportContent({
        viewModel,
        highlights: readyHighlights,
        siteName: siteDisplayName,
        siteUrl: sitePublicUrl,
        showCompare,
        preparedOn,
        localGridScan: localGridScanQuery.data ?? null,
        clientLogoUrl: site.clientLogoUrl,
        clientLogoBoxTheme: logoBoxTheme,
      });
      await downloadOrganicClientReportPdf({ content, preparedOn });
    } catch (err) {
      const message = err instanceof Error ? err.message : "PDF download failed.";
      reportError(`Client report · ${message}`);
    } finally {
      setDownloadPdfBusy(false);
    }
  }, [
    downloadPdfBusy,
    reportExportReady,
    reportError,
    resolveReadyHighlights,
    showCompare,
    siteDisplayName,
    sitePublicUrl,
    viewModel,
    localGridScanQuery.data,
    site.clientLogoUrl,
    logoBoxTheme,
    preparedOn,
  ]);

  const handleDownloadMarkdown = useCallback(() => {
    if (!reportContent) return;
    downloadOrganicClientReportMarkdown(reportContent);
  }, [reportContent]);

  const studioBusy =
    performanceLoading ||
    highlightsPending ||
    bundleQuery.isFetching ||
    highlightsQuery.isFetching ||
    downloadPdfBusy ||
    clientReportBusy;

  const splashVisible = studioBusy && !reportContent;

  const activeStatusText = useMemo(() => {
    if (performanceLoading || bundleQuery.isFetching) {
      return "Loading GA4, Search Console, Semrush & Google Ads metrics";
    }
    if (highlightsPending || highlightsQuery.isFetching) {
      return "Generating AI overview, keyword narrative & SEO opportunities";
    }
    if (downloadPdfBusy) {
      return "Preparing PDF report download";
    }
    if (clientReportBusy) {
      return "Publishing client report link";
    }
    return "";
  }, [
    performanceLoading,
    bundleQuery.isFetching,
    highlightsPending,
    highlightsQuery.isFetching,
    downloadPdfBusy,
    clientReportBusy,
  ]);

  return (
    <OrganicReportingStudioShell
      siteName={siteDisplayName}
      dateHarness={dateHarness}
      onDateHarnessApply={handleDateHarnessApply}
      todayYmdMax={todayYmdMax}
      dateRangePopoverOpen={datePopoverOpen}
      onDateRangePopoverOpenChange={setDatePopoverOpen}
      splashVisible={splashVisible}
      busy={studioBusy}
      activeStatusText={activeStatusText}
      reportContent={reportContent}
      highlightsLoading={highlightsPending || highlightsQuery.isFetching}
      localGridNarrativeLoading={localGridNarrativeLoading}
      highlightsError={highlightsError}
      onRefresh={handleRefresh}
      onShareLink={() => void handleShareLink()}
      shareCopied={shareCopied}
      onDownloadMarkdown={handleDownloadMarkdown}
      onDownloadPdf={() => void handleDownloadPdf()}
      downloadPdfBusy={downloadPdfBusy}
      exportDisabled={!reportExportReady}
      clientLogoBoxTheme={logoBoxTheme}
      onToggleLogoBoxTheme={handleToggleLogoBoxTheme}
    />
  );
}
