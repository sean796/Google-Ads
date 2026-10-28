import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { OrganicReportingPrintFrame } from "@/components/organic-dashboard/OrganicReportingPrintFrame";
import {
  buildOrganicReportingShareSearch,
  parseOrganicReportingShareParams,
  type OrganicReportingShareState,
} from "@/lib/organic-dashboard/organic-reporting-share-url";
import { resolveOrganicDashboardSite } from "@/lib/organic-dashboard/resolve-organic-dashboard-site";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WordPressSite } from "@/components/integrations/types";
import { getStoredSites } from "@/components/integrations/storage";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { useManagerErrorLog } from "@/contexts/manager-error-log-context";
import { OrganicDashboardBody } from "@/components/organic-dashboard/OrganicDashboardBody";
import { OrganicReportingSpeedSection } from "@/components/organic-dashboard/OrganicReportingSpeedSection";
import { ReportingSectionPills } from "@/components/organic-dashboard/ReportingSectionPills";
import { OrganicDashboardWorkspaceHeader } from "@/components/organic-dashboard/OrganicDashboardWorkspaceHeader";
import {
  NEO_PULSE_OPEN_ORGANIC_REPORTING_EVENT,
  type OpenOrganicReportingDetail,
} from "@/lib/organic-dashboard/organic-reporting-nav";
import { ORGANIC_DASHBOARD_SCROLL_CLASS } from "@/components/organic-dashboard/organic-dashboard-styles";
import {
  CONTENT_OPTIMIZER_BODY_INSET_CLASS,
  CONTENT_OPTIMIZER_WORKSPACE_SHELL_CLASS,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import {
  SEO_WORKSPACE_BODY_SCROLL_CLASS,
  SEO_WORKSPACE_HEADER_CLASS,
} from "@/components/seo/seo-workspace-layout";
import { cn } from "@/lib/utils";
import { fetchProposalSiteAudit } from "@/lib/research/proposal-site-audit-fetch";
import {
  normalizeReportingSectionId,
  readReportingSectionSession,
  writeReportingSectionSession,
  type ReportingSectionId,
} from "@/lib/organic-dashboard/reporting-sections";
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
  organicReportingHighlightsQueryKey,
  runOrganicReportingHighlightsQuery,
  useOrganicReportingHighlightsQuery,
} from "@/hooks/use-organic-reporting-highlights-query";
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
import { publishOrganicClientReportDeckAndBuildShareUrl } from "@/lib/organic-dashboard/organic-client-report-deck-publish";
import { downloadOrganicClientReportPdf } from "@/lib/organic-dashboard/organic-client-report-print";
import { writeOrganicDashboardDateSession } from "@/lib/organic-dashboard/organic-dashboard-date-session";
import { formatLocalYmd } from "@/lib/reporting/reporting-date-presets";

function initialReportingSection(): ReportingSectionId {
  if (typeof window !== "undefined") {
    const fromUrl = parseOrganicReportingShareParams(window.location.search);
    if (fromUrl) return normalizeReportingSectionId(fromUrl.section);
  }
  return readReportingSectionSession() ?? "performance";
}

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [reportingSection, setReportingSection] = useState<ReportingSectionId>(() =>
    initialReportingSection(),
  );
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

  useEffect(() => {
    setActiveWordPressSiteId(site.id);
  }, [site, setActiveWordPressSiteId]);

  useEffect(() => {
    writeReportingSectionSession(reportingSection);
  }, [reportingSection]);

  const shareState = useMemo(
    (): OrganicReportingShareState => ({
      section: reportingSection,
      ...dateHarness,
    }),
    [reportingSection, dateHarness],
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

  // Leaving the Reporting tab: drop the report query so other tabs keep a clean URL (state lives in session storage).
  useEffect(() => {
    if (!inAppTab) return;
    return () => {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
    };
  }, [inAppTab]);

  const speedTargetUrl = useMemo(() => {
    const raw = getPublicSiteUrl(site).trim() || site.siteUrl.trim();
    if (!raw) return "";
    return /^https?:\/\//i.test(raw) ? raw.replace(/\/$/, "") : `https://${raw.replace(/\/$/, "")}`;
  }, [site]);

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
    enabled: reportingSection === "performance",
  });

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
    enabled: reportingSection === "performance" && bundleQuery.data != null,
  });

  const highlights = highlightsQuery.data;

  const performanceLoading =
    reportingSection === "performance" &&
    fetchParams != null &&
    bundleQuery.isPending &&
    bundleQuery.data == null;

  /** PDF and client report use performance metrics from the bundle; AI copy merges in when highlights finish. */
  const reportExportReady = Boolean(bundleQuery.data && viewModel && !performanceLoading);

  const speedQuery = useQuery({
    queryKey: ["reporting-speed-audit", site.id, speedTargetUrl] as const,
    queryFn: async () => {
      if (!speedTargetUrl) throw new Error("Property URL is missing");
      const result = await fetchProposalSiteAudit([speedTargetUrl]);
      if (!result.ok) throw new Error(result.error);
      return result.audit;
    },
    enabled: false,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  useEffect(() => {
    if (speedQuery.error) {
      reportOrganicDashboardFetchError(speedQuery.error, reportError);
    }
  }, [speedQuery.error, reportError]);

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
    if (reportingSection === "performance") {
      if (!fetchParams) return;
      void bundleQuery.refetch();
      if (bundleQuery.data) void highlightsQuery.refetch();
      return;
    }
    if (reportingSection === "speed") {
      void speedQuery.refetch();
    }
  }, [bundleQuery, highlightsQuery, reportingSection, speedQuery]);

  const resolveReadyHighlights = useCallback(async () => {
    if (highlights) return highlights;
    if (!bundleQuery.data || !fetchParams) {
      throw new Error("Performance data is not ready yet.");
    }
    const queryKey = organicReportingHighlightsQueryKey({
      siteId: site.id,
      fetchParams,
      showCompare,
      siteDisplayName,
      sitePublicUrl,
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
          },
          signal,
        ),
    });
  }, [
    bundleQuery.data,
    fetchParams,
    googleAdsCustomerId,
    highlights,
    queryClient,
    showCompare,
    site.id,
    siteDisplayName,
    sitePublicUrl,
  ]);

  const handleExportPdf = useCallback(() => {
    if (reportingSection !== "performance" || clientReportBusy || clientReportOpenLock.current) {
      return;
    }
    if (!viewModel || !reportExportReady) {
      reportError("Client report · wait for Performance metrics to finish loading.");
      return;
    }
    clientReportOpenLock.current = true;
    setClientReportBusy(true);
    void (async () => {
      try {
        const readyHighlights = await resolveReadyHighlights();
        const { shareUrl: absolute } = await publishOrganicClientReportDeckAndBuildShareUrl({
          siteId: site.id,
          siteDisplayName,
          sitePublicUrl,
          shareState,
          viewModel,
          readyHighlights,
          showCompare,
        });
        window.open(absolute, "_blank", "noopener,noreferrer");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not open client report.";
        reportError(`Client report · ${message}`);
      } finally {
        clientReportOpenLock.current = false;
        setClientReportBusy(false);
      }
    })();
  }, [
    clientReportBusy,
    reportExportReady,
    reportingSection,
    reportError,
    resolveReadyHighlights,
    shareState,
    showCompare,
    site.id,
    siteDisplayName,
    sitePublicUrl,
    viewModel,
  ]);

  const handleDownloadPdf = useCallback(async () => {
    if (reportingSection !== "performance" || downloadPdfBusy) return;
    if (!viewModel || !reportExportReady) {
      reportError("Client report · wait for Performance metrics to finish loading.");
      return;
    }
    setDownloadPdfBusy(true);
    try {
      const readyHighlights = await resolveReadyHighlights();
      const preparedOn = formatLocalYmd(new Date());
      const content = buildOrganicClientReportContent({
        viewModel,
        highlights: readyHighlights,
        siteName: siteDisplayName,
        siteUrl: sitePublicUrl,
        showCompare,
        preparedOn,
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
    reportingSection,
    resolveReadyHighlights,
    showCompare,
    siteDisplayName,
    sitePublicUrl,
    viewModel,
  ]);

  const handleShareLink = useCallback(async () => {
    if (reportingSection !== "performance" || clientReportBusy || clientReportOpenLock.current) {
      return;
    }
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
    reportingSection,
    resolveReadyHighlights,
    shareState,
    showCompare,
    site.id,
    siteDisplayName,
    sitePublicUrl,
    viewModel,
  ]);

  return (
    <div className={CONTENT_OPTIMIZER_WORKSPACE_SHELL_CLASS}>
      <div className={SEO_WORKSPACE_HEADER_CLASS}>
        <OrganicDashboardWorkspaceHeader
          workspaceBusy={downloadPdfBusy || clientReportBusy}
          titleRowMenu={
            <ReportingSectionPills
              activeSection={reportingSection}
              onSectionChange={setReportingSection}
              gscSiteUrl={sitePublicUrl}
            />
          }
          showDateRange={reportingSection === "performance"}
          onRefresh={handleRefresh}
          onExportPdf={handleExportPdf}
          onDownloadPdf={() => void handleDownloadPdf()}
          downloadPdfBusy={downloadPdfBusy}
          exportPdfDisabled={reportingSection !== "performance" || !reportExportReady}
          clientReportBusy={clientReportBusy}
          showExportPdf={reportingSection === "performance"}
          onShareLink={() => void handleShareLink()}
          shareCopied={shareCopied}
          dateHarness={dateHarness}
          onDateHarnessApply={handleDateHarnessApply}
          todayYmdMax={todayYmdMax}
          dateRangePopoverOpen={datePopoverOpen}
          onDateRangePopoverOpenChange={setDatePopoverOpen}
        />
      </div>
      <div className={cn(SEO_WORKSPACE_BODY_SCROLL_CLASS, CONTENT_OPTIMIZER_BODY_INSET_CLASS)}>
        <OrganicReportingPrintFrame>
          {reportingSection === "performance" ? (
            <OrganicDashboardBody
              loading={performanceLoading}
              viewModel={viewModel}
              showCompare={showCompare}
              periodProgressTables={viewModel?.periodProgressTables ?? null}
            />
          ) : (
            <div className={ORGANIC_DASHBOARD_SCROLL_CLASS}>
              <OrganicReportingSpeedSection
                loading={speedQuery.isFetching}
                audit={speedQuery.data ?? null}
                targetUrl={speedTargetUrl}
              />
            </div>
          )}
        </OrganicReportingPrintFrame>
      </div>
    </div>
  );
}
