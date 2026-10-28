import { useCallback, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  buildOrganicReportingShareSearch,
  shareStateFromDateHarness,
} from "@/lib/organic-dashboard/organic-reporting-share-url";
import { writeOrganicDashboardDateSession } from "@/lib/organic-dashboard/organic-dashboard-date-session";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { resolveOrganicDashboardSite } from "@/lib/organic-dashboard/resolve-organic-dashboard-site";
import {
  hydrateOrganicClientReportForHarness,
} from "@/lib/organic-dashboard/organic-client-report-share-hydrate";
import { resolveSiteForClientReport } from "@/lib/organic-dashboard/resolve-site-for-client-report";
import {
  fetchOrganicClientReportDeckShare,
  resolveOrganicClientReportDeckId,
} from "@/lib/organic-dashboard/organic-client-report-share-api";
import { resolveOrganicReportingDateHarnessFromSearch } from "@/lib/organic-dashboard/organic-dashboard-fetch-params";
import type { WordPressSite } from "@/components/integrations/types";
import {
  Ga4ReportingDateRangePopover,
  type Ga4ReportingDateHarness,
} from "@/components/research/reporting/Ga4ReportingDateRangePopover";
import { formatLocalYmd } from "@/lib/reporting/reporting-date-presets";
import { OrganicClientReportExportDocument } from "@/components/organic-dashboard/OrganicClientReportExportDocument";
import { Button } from "@/components/ui/button";
import "@/components/organic-dashboard/organic-reporting-client-deck.css";
import {
  readOrganicClientReportDeckSession,
  type OrganicClientReportDeckPayload,
} from "@/lib/organic-dashboard/organic-client-report-deck-session";
import { buildOrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";
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
  const querySiteId = searchParams.get("siteId")?.trim() || "";
  const { sites, handlePatchSite } = useWordPressSites();
  const resolvedSiteId = useMemo(
    () => resolveClientReportSiteIdFromRoute(routeSiteSegment, shareSearch, sites),
    [routeSiteSegment, shareSearch, sites],
  );
  const isPublishedDeckLink = Boolean(deckId && resolvedSiteId);
  const liveReportMode = !deckId && resolvedSiteId !== "";
  const siteFromList = useMemo(
    () => resolveOrganicDashboardSite(sites, resolvedSiteId, null),
    [resolvedSiteId, sites],
  );
  const [resolvedSite, setResolvedSite] = useState<WordPressSite | undefined>(undefined);
  const [siteResolving, setSiteResolving] = useState(Boolean(resolvedSiteId) && !isPublishedDeckLink);
  const reportSite = resolvedSite ?? siteFromList;
  const dashboardSiteId = reportSite?.id ?? resolvedSiteId;

  const dateHarness = useMemo(
    () => resolveOrganicReportingDateHarnessFromSearch(shareSearch),
    [shareSearch],
  );
  const todayYmdMax = formatLocalYmd(new Date());

  const [payload, setPayload] = useState<OrganicClientReportDeckPayload | null>(() =>
    isPublishedDeckLink ? readDeckPayload(deckId, resolvedSiteId) : null,
  );
  const [shareHydrating, setShareHydrating] = useState(liveReportMode);
  const [shareHydrateError, setShareHydrateError] = useState<string | null>(null);
  const [deckLoading, setDeckLoading] = useState(isPublishedDeckLink);
  const [deckLoadFailed, setDeckLoadFailed] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [logoBoxTheme, setLogoBoxTheme] = useState<"black" | "white">(
    () => payload?.clientLogoBoxTheme ?? reportSite?.clientLogoBoxTheme ?? "black",
  );

  useEffect(() => {
    if (payload?.clientLogoBoxTheme) {
      setLogoBoxTheme(payload.clientLogoBoxTheme);
    } else if (reportSite?.clientLogoBoxTheme) {
      setLogoBoxTheme(reportSite.clientLogoBoxTheme);
    }
  }, [payload?.clientLogoBoxTheme, reportSite?.id, reportSite?.clientLogoBoxTheme]);

  const handleToggleLogoBoxTheme = useCallback(() => {
    setLogoBoxTheme((prev) => {
      const nextTheme: "black" | "white" = prev === "black" ? "white" : "black";
      if (reportSite?.id) {
        handlePatchSite(reportSite.id, { clientLogoBoxTheme: nextTheme });
      }
      return nextTheme;
    });
  }, [handlePatchSite, reportSite?.id]);

  const effectiveClientLogoUrl = useMemo(() => {
    const fromPayload = payload?.clientLogoUrl?.trim();
    if (fromPayload) return fromPayload;

    const fromSite = reportSite?.clientLogoUrl?.trim();
    if (fromSite) return fromSite;

    const candidateSiteId = querySiteId || resolvedSiteId?.trim() || "";
    if (candidateSiteId) {
      return `/client-logos/${candidateSiteId}.png`;
    }
    const candidateSlug = routeSiteSegment?.trim() || "";
    if (candidateSlug) {
      return `/client-logos/${candidateSlug}.png`;
    }
    const lowerName = (payload?.siteName || reportSite?.name || "").toLowerCase();
    if (lowerName.includes("blind magic")) {
      return "/client-logos/blind-magic.png";
    }
    return undefined;
  }, [
    payload?.clientLogoUrl,
    payload?.siteName,
    reportSite?.clientLogoUrl,
    reportSite?.name,
    querySiteId,
    resolvedSiteId,
    routeSiteSegment,
  ]);

  const reportContent = useMemo(
    () =>
      payload?.highlights
        ? buildOrganicClientReportContent({
            viewModel: payload.viewModel,
            highlights: payload.highlights,
            siteName: payload.siteName,
            siteUrl: payload.siteUrl,
            showCompare: payload.showCompare,
            preparedOn: payload.preparedOn,
            localGridScan: payload.localGridScan ?? null,
            clientLogoUrl: effectiveClientLogoUrl,
            clientLogoBoxTheme: logoBoxTheme,
          })
        : null,
    [payload, effectiveClientLogoUrl, logoBoxTheme],
  );

  useOrganicClientReportDocumentMeta(payload);

  const toolbarClientLabel =
    payload?.siteName.trim() ||
    readOrganicClientReportClientLabel(shareSearch) ||
    reportSite?.name?.trim() ||
    routeSiteSegment;

  useEffect(() => {
    if (!isPublishedDeckLink) return;
    const data = readDeckPayload(deckId, resolvedSiteId);
    if (data) setPayload(data);
    if (data) {
      document.title = `${data.siteName} Organic Performance`;
    }
  }, [deckId, isPublishedDeckLink, resolvedSiteId]);

  useEffect(() => {
    if (!isPublishedDeckLink) {
      setDeckLoading(false);
      setDeckLoadFailed(false);
      return;
    }

    const local = readDeckPayload(deckId, resolvedSiteId);
    if (local) {
      setDeckLoading(false);
      setDeckLoadFailed(false);
      return;
    }

    let cancelled = false;
    setDeckLoading(true);
    setDeckLoadFailed(false);

    void fetchOrganicClientReportDeckShare(deckId, resolvedSiteId).then((remote) => {
      if (cancelled) return;
      if (remote) {
        setPayload(remote);
        document.title = `${remote.siteName} Organic Performance`;
        setDeckLoadFailed(false);
      } else {
        setPayload(null);
        setDeckLoadFailed(true);
      }
      setDeckLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [deckId, isPublishedDeckLink, resolvedSiteId]);

  useEffect(() => {
    if (isPublishedDeckLink) {
      setResolvedSite(undefined);
      setSiteResolving(false);
      return;
    }
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
  }, [isPublishedDeckLink, resolvedSiteId, sites]);

  useEffect(() => {
    if (!liveReportMode || !reportSite) return;

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
  }, [dateHarness, liveReportMode, reportSite]);

  const handleDateHarnessApply = useCallback(
    (next: Ga4ReportingDateHarness) => {
      if (isPublishedDeckLink) return;
      writeOrganicDashboardDateSession(next);
      const qs = buildOrganicReportingShareSearch(shareStateFromDateHarness("performance", next));
      setSearchParams(new URLSearchParams(qs), { replace: true });
    },
    [isPublishedDeckLink, setSearchParams],
  );

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


  const awaitingShareHydrate =
    liveReportMode &&
    !payload &&
    !shareHydrateError &&
    (shareHydrating || siteResolving || !reportSite);

  if (isPublishedDeckLink && deckLoading) {
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

  if (isPublishedDeckLink && deckLoadFailed) {
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

  return (
    <div className="organic-client-report-preview-shell min-h-dvh overflow-auto">
      <div className="organic-client-report-preview-toolbar">
        <div className="min-w-0 truncate text-base font-medium text-white">
          {`${toolbarClientLabel} · Client report`}
        </div>
        <div className="organic-client-report-preview-toolbar-actions">
          {liveReportMode ? (
            <div className="organic-client-report-preview-date-slot">
              <Ga4ReportingDateRangePopover
                busy={shareHydrating}
                value={dateHarness}
                onApply={handleDateHarnessApply}
                todayYmdMax={todayYmdMax}
              />
            </div>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            disabled={pdfBusy}
            className={cn(REPORTING_TOOLBAR_ACTION_BTN, "min-w-[4.75rem] tabular-nums")}
            aria-busy={pdfBusy}
            aria-label={pdfBusy ? "Preparing PDF" : "PDF"}
            onClick={() => void handleDownloadPdf()}
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            {pdfBusy ? "…" : "PDF"}
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
        highlightsLoading={false}
        localGridNarrativeLoading={false}
        highlightsError={null}
        onToggleLogoBoxTheme={handleToggleLogoBoxTheme}
      />
    </div>
  );
}
