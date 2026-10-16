import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { OrganicReportingPrintFrame } from "@/components/organic-dashboard/OrganicReportingPrintFrame";
import {
  buildOrganicReportingShareSearch,
  buildOrganicReportingShareUrl,
  parseOrganicReportingShareParams,
  type OrganicReportingShareState,
} from "@/lib/organic-dashboard/organic-reporting-share-url";
import { resolveOrganicDashboardSite } from "@/lib/organic-dashboard/resolve-organic-dashboard-site";
import { useQuery } from "@tanstack/react-query";
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
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { fetchOrganicDashboardBundle } from "@/lib/organic-dashboard/organic-dashboard-fetch";
import {
  buildOrganicDashboardFetchParams,
  defaultOrganicReportingDateHarness,
} from "@/lib/organic-dashboard/organic-dashboard-fetch-params";
import { ORGANIC_DASHBOARD_QUERY_STALE_MS } from "@/lib/organic-dashboard/organic-dashboard-prefetch";
import type { OrganicDashboardFetchParams } from "@/lib/organic-dashboard/organic-dashboard-types";
import {
  reportOrganicDashboardFetchError,
  reportOrganicDashboardSourceErrors,
} from "@/lib/organic-dashboard/organic-dashboard-report-errors";
import { buildOrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import { writeOrganicClientReportDeckSession } from "@/lib/organic-dashboard/organic-client-report-deck-session";
import { buildOrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";
import { downloadOrganicClientReportPdf } from "@/lib/organic-dashboard/organic-client-report-print";
import { resolveClientReportHighlights } from "@/lib/organic-dashboard/organic-reporting-highlights";
import { useOrganicReportingHighlightsQuery } from "@/hooks/use-organic-reporting-highlights-query";
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

  const [reportingSection, setReportingSection] = useState<ReportingSectionId>(() =>
    initialReportingSection(),
  );
  const [dateHarness, setDateHarness] = useState<Ga4ReportingDateHarness>(() =>
    defaultOrganicReportingDateHarness(),
  );
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [downloadPdfBusy, setDownloadPdfBusy] = useState(false);
  const [ga4PropertyId, setGa4PropertyId] = useState(() => resolveGa4PropertyIdForReporting(site));

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

  const shareUrl = useMemo(
    () => buildOrganicReportingShareUrl(site.id, shareState),
    [site.id, shareState],
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
    let cancelled = false;
    void resolveGa4PropertyIdForReportingAsync(site).then((id) => {
      if (!cancelled) setGa4PropertyId(id);
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
    () => buildOrganicDashboardFetchParams(site, dateHarness, ga4PropertyId),
    [site, dateHarness, ga4PropertyId],
  );

  const query = useQuery({
    queryKey: ["organic-dashboard", site.id, fetchParams] as const,
    queryFn: async ({ queryKey }) => {
      const params = queryKey[2] as OrganicDashboardFetchParams | null;
      if (!params) throw new Error("Invalid date range");
      return fetchOrganicDashboardBundle(params);
    },
    enabled: fetchParams != null,
    refetchOnWindowFocus: false,
    retry: 0,
    staleTime: ORGANIC_DASHBOARD_QUERY_STALE_MS,
  });

  const performanceLoading =
    reportingSection === "performance" &&
    fetchParams != null &&
    !query.data &&
    (query.isLoading || query.isFetching);

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
    if (query.data) {
      reportOrganicDashboardSourceErrors(query.data, reportError);
    }
  }, [query.data, reportError]);

  useEffect(() => {
    if (query.error) {
      reportOrganicDashboardFetchError(query.error, reportError);
    }
  }, [query.error, reportError]);

  const viewModel = useMemo(
    () => buildOrganicDashboardViewModel(query.data, { showCompare }),
    [query.data, showCompare],
  );

  const siteDisplayName = site.name?.trim() || site.siteUrl;
  const sitePublicUrl = useMemo(
    () => getPublicSiteUrl(site).trim() || site.siteUrl.trim(),
    [site],
  );

  const highlightsQuery = useOrganicReportingHighlightsQuery({
    siteId: site.id,
    bundle: query.data,
    fetchParams,
    showCompare,
    siteDisplayName,
    sitePublicUrl,
    enabled: reportingSection === "performance",
  });

  const handleDateHarnessApply = useCallback((next: Ga4ReportingDateHarness) => {
    setDateHarness(next);
  }, []);

  const handleRefresh = useCallback(() => {
    if (reportingSection === "performance") {
      if (!fetchParams) return;
      void query.refetch().then((result) => {
        if (result.isSuccess) {
          void highlightsQuery.refetch();
        }
      });
      return;
    }
    if (reportingSection === "speed") {
      void speedQuery.refetch();
    }
  }, [fetchParams, highlightsQuery, query, reportingSection, speedQuery]);

  const handleExportPdf = useCallback(() => {
    if (reportingSection !== "performance") return;
    if (!query.data || query.isLoading) {
      reportError("Client report · load Performance data before exporting.");
      return;
    }
    const vm = buildOrganicDashboardViewModel(query.data, { showCompare });
    const highlights = resolveClientReportHighlights(highlightsQuery.data, siteDisplayName, vm);
    const preparedOn = formatLocalYmd(new Date());
    const deckId = crypto.randomUUID();
    writeOrganicClientReportDeckSession(deckId, {
      siteId: site.id,
      highlights,
      viewModel: vm,
      siteName: siteDisplayName,
      siteUrl: sitePublicUrl,
      showCompare,
      preparedOn,
    });
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const path = `${base}/sites/${site.id}/organic/client-report?deck=${encodeURIComponent(deckId)}`;
    const absolute = new URL(path, window.location.origin).href;
    const opened = window.open(absolute, "_blank");
    if (!opened) {
      reportError("Client report · allow pop-ups to open the report in a new tab.");
    }
  }, [
    query.data,
    query.isLoading,
    highlightsQuery.data,
    reportingSection,
    reportError,
    showCompare,
    site.id,
    siteDisplayName,
    sitePublicUrl,
  ]);

  const handleDownloadPdf = useCallback(async () => {
    if (reportingSection !== "performance" || downloadPdfBusy) return;
    if (!query.data || query.isLoading) {
      reportError("Client report · load Performance data before downloading PDF.");
      return;
    }
    setDownloadPdfBusy(true);
    try {
      const vm = buildOrganicDashboardViewModel(query.data, { showCompare });
      let resolvedHighlights = highlightsQuery.data;
      if (!resolvedHighlights) {
        const refetched = await highlightsQuery.refetch();
        resolvedHighlights = refetched.data;
      }
      const highlights = resolveClientReportHighlights(resolvedHighlights, siteDisplayName, vm);
      const preparedOn = formatLocalYmd(new Date());
      const content = buildOrganicClientReportContent({
        viewModel: vm,
        highlights,
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
    highlightsQuery,
    query.data,
    query.isLoading,
    reportError,
    reportingSection,
    showCompare,
    siteDisplayName,
    sitePublicUrl,
  ]);

  const handleShareLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
    } catch {
      setShareCopied(false);
    }
  }, [shareUrl]);

  return (
    <div className={CONTENT_OPTIMIZER_WORKSPACE_SHELL_CLASS}>
      <div className={SEO_WORKSPACE_HEADER_CLASS}>
        <OrganicDashboardWorkspaceHeader
          workspaceBusy={downloadPdfBusy}
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
          exportPdfDisabled={reportingSection !== "performance" || !query.data}
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
