import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { resolveGoogleAdsCustomerIdForReporting } from "@/lib/ads-reporting/ads-reporting-metrics";
import { resolveGa4PropertyIdForReporting } from "@/lib/ga4-property-id";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { resolveOrganicDashboardSite } from "@/lib/organic-dashboard/resolve-organic-dashboard-site";
import {
  hydrateOrganicClientReportForHarness,
} from "@/lib/organic-dashboard/organic-client-report-share-hydrate";
import { resolveSiteForClientReport } from "@/lib/organic-dashboard/resolve-site-for-client-report";
import {
  buildOrganicReportingShareSearch,
  shareStateFromDateHarness,
} from "@/lib/organic-dashboard/organic-reporting-share-url";
import {
  fetchOrganicClientReportDeckShare,
  resolveOrganicClientReportDeckId,
} from "@/lib/organic-dashboard/organic-client-report-share-api";
import { resolveOrganicReportingDateHarnessFromSearch } from "@/lib/organic-dashboard/organic-dashboard-fetch-params";
import type { WordPressSite } from "@/components/integrations/types";
import { writeOrganicDashboardDateSession } from "@/lib/organic-dashboard/organic-dashboard-date-session";
import {
  Ga4ReportingDateRangePopover,
  type Ga4ReportingDateHarness,
} from "@/components/research/reporting/Ga4ReportingDateRangePopover";
import { formatLocalYmd } from "@/lib/reporting/reporting-date-presets";
import { OrganicClientReportExportDocument } from "@/components/organic-dashboard/OrganicClientReportExportDocument";
import { Button } from "@/components/ui/button";
import "@/components/organic-dashboard/organic-reporting-client-deck.css";
import {
  publishOrganicClientReportDeckSession,
  readOrganicClientReportDeckSession,
  type OrganicClientReportDeckPayload,
} from "@/lib/organic-dashboard/organic-client-report-deck-session";
import { buildOrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";
import { clientReportDeckNeedsAgentHighlights } from "@/lib/organic-dashboard/organic-client-report-highlights-status";
import { buildOrganicDashboardFetchParams } from "@/lib/organic-dashboard/organic-dashboard-fetch-params";
import { ORGANIC_DASHBOARD_QUERY_STALE_MS } from "@/lib/organic-dashboard/organic-dashboard-prefetch";
import { buildOrganicReportingHighlightsSnapshot, fetchOrganicReportingHighlights } from "@/lib/organic-dashboard/organic-reporting-highlights";
import {
  organicReportingHighlightsQueryKey,
} from "@/hooks/use-organic-reporting-highlights-query";
import { downloadOrganicClientReportMarkdown } from "@/lib/organic-dashboard/organic-client-report-markdown";
import { downloadOrganicClientReportPdf } from "@/lib/organic-dashboard/organic-client-report-print";
import { readOrganicClientReportClientLabel } from "@/lib/organic-dashboard/organic-client-report-link-preview";
import { resolveClientReportSiteIdFromRoute } from "@/lib/organic-dashboard/organic-client-report-site-path";
import { useOrganicClientReportDocumentMeta } from "@/hooks/use-organic-client-report-document-meta";
import { REPORTING_TOOLBAR_ACTION_BTN } from "@/components/organic-dashboard/organic-reporting-toolbar-buttons";
import { cn } from "@/lib/utils";

function readDeckPayload(deckId: string, siteId: string): OrganicClientReportDeckPayload | null {
  if (!deckId || !siteId) return null;
  return readOrganicClientReportDeckSession(deckId, siteId);
}

export default function OrganicClientReportPreviewPage() {
  const { siteId: routeSiteSegment = "" } = useParams<{ siteId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const deckId = resolveOrganicClientReportDeckId(searchParams);
  const shareSearch = searchParams.toString();
  const { sites } = useWordPressSites();
  const resolvedSiteId = useMemo(
    () => resolveClientReportSiteIdFromRoute(routeSiteSegment, shareSearch, sites),
    [routeSiteSegment, shareSearch, sites],
  );
  const [deckUseLiveFallback, setDeckUseLiveFallback] = useState(false);
  const liveReportMode = (!deckId || deckUseLiveFallback) && resolvedSiteId !== "";
  const siteFromList = useMemo(
    () => resolveOrganicDashboardSite(sites, resolvedSiteId, null),
    [resolvedSiteId, sites],
  );
  const [resolvedSite, setResolvedSite] = useState<WordPressSite | undefined>(undefined);
  const [siteResolving, setSiteResolving] = useState(Boolean(resolvedSiteId));
  const reportSite = resolvedSite ?? siteFromList;
  const dashboardSiteId = reportSite?.id ?? resolvedSiteId;
  const queryClient = useQueryClient();

  const [dateHarness, setDateHarness] = useState<Ga4ReportingDateHarness>(() =>
    resolveOrganicReportingDateHarnessFromSearch(shareSearch),
  );
  const todayYmdMax = formatLocalYmd(new Date());

  const [payload, setPayload] = useState<OrganicClientReportDeckPayload | null>(() =>
    readDeckPayload(deckId, resolvedSiteId),
  );
  const [shareHydrating, setShareHydrating] = useState(liveReportMode);
  const [shareHydrateError, setShareHydrateError] = useState<string | null>(null);
  const [deckLoading, setDeckLoading] = useState(Boolean(deckId && resolvedSiteId));
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  const [highlightsError, setHighlightsError] = useState<string | null>(null);

  const reportContent = useMemo(
    () => (payload ? buildOrganicClientReportContent(payload) : null),
    [payload],
  );

  useOrganicClientReportDocumentMeta(payload);

  const toolbarClientLabel =
    payload?.siteName.trim() ||
    readOrganicClientReportClientLabel(shareSearch) ||
    reportSite?.name?.trim() ||
    routeSiteSegment;

  useEffect(() => {
    const data = readDeckPayload(deckId, resolvedSiteId);
    setPayload(data);
    if (data) {
      document.title = `${data.siteName} Organic Performance`;
    }
  }, [deckId, resolvedSiteId]);

  useEffect(() => {
    setDeckUseLiveFallback(false);
  }, [deckId, resolvedSiteId]);

  const needsAgentHighlights = Boolean(
    payload &&
      reportSite &&
      !liveReportMode &&
      clientReportDeckNeedsAgentHighlights(payload.highlights, payload.viewModel),
  );

  useEffect(() => {
    if (!deckId || !resolvedSiteId) {
      setDeckLoading(false);
      return;
    }

    const local = readDeckPayload(deckId, resolvedSiteId);
    if (local) {
      setDeckLoading(false);
      return;
    }

    let cancelled = false;
    setDeckLoading(true);

    void fetchOrganicClientReportDeckShare(deckId, resolvedSiteId).then((remote) => {
      if (cancelled) return;
      if (remote) {
        setPayload(remote);
        document.title = `${remote.siteName} Organic Performance`;
      } else {
        setPayload(null);
        setDeckUseLiveFallback(true);
      }
      setDeckLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [deckId, resolvedSiteId]);

  useEffect(() => {
    if (!resolvedSiteId) {
      setResolvedSite(undefined);
      setSiteResolving(false);
      return;
    }
    let cancelled = false;
    setSiteResolving(true);
    void resolveSiteForClientReport(sites, resolvedSiteId).then((site) => {
      if (!cancelled) {
        setResolvedSite(site);
        setSiteResolving(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedSiteId, sites]);

  useEffect(() => {
    setDateHarness(resolveOrganicReportingDateHarnessFromSearch(shareSearch));
  }, [shareSearch]);

  const handleDateHarnessApply = useCallback(
    (next: Ga4ReportingDateHarness) => {
      setDateHarness(next);
      writeOrganicDashboardDateSession(next);
      const qs = buildOrganicReportingShareSearch(shareStateFromDateHarness("performance", next));
      setSearchParams(new URLSearchParams(qs), { replace: true });
      if (deckId) {
        setDeckUseLiveFallback(true);
      }
      setPayload(null);
      setShareHydrateError(null);
    },
    [deckId, setSearchParams],
  );

  useEffect(() => {
    if (!needsAgentHighlights || !payload || !reportSite) {
      setHighlightsLoading(false);
      return;
    }

    let cancelled = false;
    setHighlightsLoading(true);
    setHighlightsError(null);

    const deckPayload = payload;
    const ga4PropertyId = resolveGa4PropertyIdForReporting(reportSite);
    const googleAdsCustomerId = resolveGoogleAdsCustomerIdForReporting(reportSite);
    const fetchParams = buildOrganicDashboardFetchParams(
      reportSite,
      dateHarness,
      ga4PropertyId,
      googleAdsCustomerId,
    );
    const queryKey = organicReportingHighlightsQueryKey({
      siteId: reportSite.id,
      fetchParams,
      showCompare: deckPayload.showCompare,
      siteDisplayName: deckPayload.siteName,
      sitePublicUrl: deckPayload.siteUrl,
    });

    void (async () => {
      try {
        const cached = queryClient.getQueryData(queryKey);
        if (
          cached &&
          !clientReportDeckNeedsAgentHighlights(cached, deckPayload.viewModel)
        ) {
          if (!cancelled) {
            setPayload((prev) => (prev ? { ...prev, highlights: cached } : null));
          }
          return;
        }
        const next = await queryClient.fetchQuery({
          queryKey,
          staleTime: ORGANIC_DASHBOARD_QUERY_STALE_MS,
          retry: 0,
          queryFn: ({ signal }) => {
            const snapshot = buildOrganicReportingHighlightsSnapshot(
              deckPayload.viewModel,
              deckPayload.siteName,
              deckPayload.siteUrl,
              deckPayload.showCompare,
            );
            return fetchOrganicReportingHighlights(snapshot, reportSite.id, signal);
          },
        });
        if (cancelled) return;
        const updated = { ...deckPayload, highlights: next };
        setPayload(updated);
        if (deckId) {
          void publishOrganicClientReportDeckSession(deckId, updated).catch(() => {
            /* session storage already updated */
          });
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Overview could not be generated.";
          setHighlightsError(message);
        }
      } finally {
        if (!cancelled) setHighlightsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      void queryClient.cancelQueries({ queryKey });
      setHighlightsLoading(false);
    };
  }, [dateHarness, deckId, needsAgentHighlights, payload, queryClient, reportSite]);

  useEffect(() => {
    if (!liveReportMode || !reportSite) return;
    if (deckId && !deckUseLiveFallback) return;

    let cancelled = false;
    setShareHydrateError(null);
    setShareHydrating(true);
    setPayload(null);

    void (async () => {
      try {
        const next = await hydrateOrganicClientReportForHarness(reportSite, dateHarness);
        if (cancelled) return;
        if (!next) {
          setShareHydrateError("Could not build this client report. Check the date range and try again.");
          return;
        }
        setPayload(next);
        document.title = `${next.siteName} Organic Performance`;
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to load report data.";
          setShareHydrateError(message);
        }
      } finally {
        if (!cancelled) setShareHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dateHarness, deckId, deckUseLiveFallback, liveReportMode, reportSite]);

  const handleDownloadPdf = useCallback(async () => {
    if (!reportContent || !payload) return;
    setPdfError(null);
    setPdfBusy(true);
    try {
      await downloadOrganicClientReportPdf({
        content: reportContent,
        preparedOn: payload.preparedOn,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "PDF export failed.";
      setPdfError(message);
    } finally {
      setPdfBusy(false);
    }
  }, [payload, reportContent]);

  const handleDownloadMarkdown = useCallback(() => {
    if (!reportContent) return;
    setPdfError(null);
    downloadOrganicClientReportMarkdown(reportContent);
  }, [reportContent]);

  const awaitingShareHydrate =
    liveReportMode &&
    !payload &&
    !shareHydrateError &&
    (shareHydrating || siteResolving || !reportSite);

  if (deckId && deckLoading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#f4f4f5] px-6 font-sans text-base text-[#18181b]">
        <p>Loading client report…</p>
      </div>
    );
  }

  if (awaitingShareHydrate || (liveReportMode && shareHydrating && !payload)) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#f4f4f5] px-6 font-sans text-base text-[#18181b]">
        <p>Loading client report…</p>
      </div>
    );
  }

  if (liveReportMode && !siteResolving && resolvedSiteId && !reportSite) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#f4f4f5] px-6 font-sans text-base text-[#18181b]">
        <p role="alert">This property is not available in your workspace.</p>
        <Link className="text-base font-semibold text-[#18181b] underline" to="/">
          Back to Neo Pulse
        </Link>
      </div>
    );
  }

  if (shareHydrateError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#f4f4f5] px-6 font-sans text-base text-[#18181b]">
        <p role="alert">{shareHydrateError}</p>
        {dashboardSiteId ? (
          <Link className="text-base font-semibold text-[#18181b] underline" to={`/sites/${dashboardSiteId}/organic?section=performance`}>
            Back to Reporting
          </Link>
        ) : null}
      </div>
    );
  }

  if (!liveReportMode && !deckId) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#f4f4f5] px-6 font-sans text-base text-[#18181b]">
        <p>This client report link is missing or expired. Generate it again from Reporting.</p>
        {dashboardSiteId ? (
          <Link className="text-base font-semibold text-[#18181b] underline" to={`/sites/${dashboardSiteId}/organic?section=performance`}>
            Back to Reporting
          </Link>
        ) : (
          <Link className="text-base font-semibold text-[#18181b] underline" to="/">
            Back to Neo Pulse
          </Link>
        )}
      </div>
    );
  }

  if (!payload || !reportContent) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#f4f4f5] px-6 font-sans text-base text-[#18181b]">
        <p>This client report link is missing or expired. Generate it again from Reporting.</p>
        {dashboardSiteId ? (
          <Link className="text-base font-semibold text-[#18181b] underline" to={`/sites/${dashboardSiteId}/organic?section=performance`}>
            Back to Reporting
          </Link>
        ) : (
          <Link className="text-base font-semibold text-[#18181b] underline" to="/">
            Back to Neo Pulse
          </Link>
        )}
      </div>
    );
  }

  const pdfDisabled = pdfBusy || highlightsLoading;

  return (
    <div className="organic-client-report-preview-shell min-h-dvh overflow-auto">
      <div className="organic-client-report-preview-toolbar">
        <div className="min-w-0 truncate text-base font-medium text-white">
          {`${toolbarClientLabel} · Client report`}
        </div>
        <div className="organic-client-report-preview-toolbar-actions">
          <div className="organic-client-report-preview-date-slot">
            <Ga4ReportingDateRangePopover
              busy={shareHydrating}
              value={dateHarness}
              onApply={handleDateHarnessApply}
              todayYmdMax={todayYmdMax}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            disabled={pdfDisabled}
            className={cn(REPORTING_TOOLBAR_ACTION_BTN, "min-w-[4.75rem] tabular-nums")}
            aria-busy={pdfBusy}
            aria-label={pdfBusy ? "Preparing PDF" : "Download PDF"}
            onClick={() => void handleDownloadPdf()}
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            {pdfBusy ? "…" : "PDF"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={cn(REPORTING_TOOLBAR_ACTION_BTN, "min-w-8 px-2")}
            aria-label="Download Markdown"
            onClick={handleDownloadMarkdown}
          >
            <FileText className="h-4 w-4 shrink-0" aria-hidden />
          </Button>
        </div>
      </div>
      {pdfError ? (
        <p className="mx-auto max-w-[52rem] px-4 pt-3 font-sans text-base text-[#b91c1c]" role="alert">
          {pdfError}
        </p>
      ) : null}
      <OrganicClientReportExportDocument
        content={reportContent}
        highlightsLoading={highlightsLoading}
        highlightsError={highlightsError}
      />
    </div>
  );
}
