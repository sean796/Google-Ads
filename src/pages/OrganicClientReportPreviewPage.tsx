import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileText, Printer } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
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
  deckHighlightsNeedsAgentNarratives,
  readOrganicClientReportDeckSession,
  writeOrganicClientReportDeckSession,
  type OrganicClientReportDeckPayload,
} from "@/lib/organic-dashboard/organic-client-report-deck-session";
import { buildOrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";
import { downloadOrganicClientReportMarkdown } from "@/lib/organic-dashboard/organic-client-report-markdown";
import { downloadOrganicClientReportPdf } from "@/lib/organic-dashboard/organic-client-report-print";
import {
  buildOrganicReportingHighlightsSnapshot,
  fetchOrganicReportingHighlights,
} from "@/lib/organic-dashboard/organic-reporting-highlights";
import {
  REPORTING_TOOLBAR_ACTION_BTN,
  REPORTING_TOOLBAR_DOWNLOAD_MARKDOWN_BTN_CLASS,
  REPORTING_TOOLBAR_DOWNLOAD_PDF_BTN_CLASS,
  REPORTING_TOOLBAR_LABEL_RESERVE_CLASS,
  REPORTING_TOOLBAR_LABEL_SLOT_CLASS,
  REPORTING_TOOLBAR_LABEL_VISIBLE_CLASS,
} from "@/components/organic-dashboard/organic-reporting-toolbar-buttons";

function readDeckPayload(deckId: string, siteId: string): OrganicClientReportDeckPayload | null {
  if (!deckId || !siteId) return null;
  return readOrganicClientReportDeckSession(deckId, siteId);
}

export default function OrganicClientReportPreviewPage() {
  const { siteId = "" } = useParams<{ siteId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const deckId = searchParams.get("deck")?.trim() ?? "";
  const shareSearch = searchParams.toString();
  const liveReportMode = !deckId && siteId !== "";
  const { sites } = useWordPressSites();
  const siteFromList = useMemo(
    () => resolveOrganicDashboardSite(sites, siteId, null),
    [siteId, sites],
  );
  const [resolvedSite, setResolvedSite] = useState<WordPressSite | undefined>(undefined);
  const [siteResolving, setSiteResolving] = useState(liveReportMode);
  const reportSite = deckId ? siteFromList : resolvedSite ?? siteFromList;

  const [dateHarness, setDateHarness] = useState<Ga4ReportingDateHarness>(() =>
    resolveOrganicReportingDateHarnessFromSearch(shareSearch),
  );
  const todayYmdMax = formatLocalYmd(new Date());

  const [payload, setPayload] = useState<OrganicClientReportDeckPayload | null>(() =>
    readDeckPayload(deckId, siteId),
  );
  const [shareHydrating, setShareHydrating] = useState(liveReportMode);
  const [shareHydrateError, setShareHydrateError] = useState<string | null>(null);
  const [hydratingNarratives, setHydratingNarratives] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const reportContent = useMemo(
    () => (payload ? buildOrganicClientReportContent(payload) : null),
    [payload],
  );

  useEffect(() => {
    const data = readDeckPayload(deckId, siteId);
    setPayload(data);
    if (data) {
      document.title = `${data.siteName} Organic Performance`;
    }
  }, [deckId, siteId]);

  useEffect(() => {
    if (!liveReportMode) {
      setResolvedSite(undefined);
      setSiteResolving(false);
      return;
    }
    let cancelled = false;
    setSiteResolving(true);
    void resolveSiteForClientReport(sites, siteId).then((site) => {
      if (!cancelled) {
        setResolvedSite(site);
        setSiteResolving(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [liveReportMode, siteId, sites]);

  useEffect(() => {
    setDateHarness(resolveOrganicReportingDateHarnessFromSearch(shareSearch));
  }, [shareSearch]);

  const handleDateHarnessApply = useCallback(
    (next: Ga4ReportingDateHarness) => {
      setDateHarness(next);
      writeOrganicDashboardDateSession(next);
      const qs = buildOrganicReportingShareSearch(shareStateFromDateHarness("performance", next));
      setSearchParams(new URLSearchParams(qs), { replace: true });
      setPayload(null);
      setShareHydrateError(null);
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (deckId || !liveReportMode || !reportSite) return;

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
  }, [dateHarness, deckId, liveReportMode, reportSite]);

  useEffect(() => {
    if (!siteId || !deckId) return;

    const data = readDeckPayload(deckId, siteId);
    if (!data || !deckHighlightsNeedsAgentNarratives(data.highlights)) {
      setHydratingNarratives(false);
      return;
    }

    let cancelled = false;
    setHydratingNarratives(true);

    void (async () => {
      try {
        const snapshot = buildOrganicReportingHighlightsSnapshot(
          data.viewModel,
          data.siteName,
          data.siteUrl,
          data.showCompare,
        );
        const highlights = await fetchOrganicReportingHighlights(snapshot, siteId);
        const next: OrganicClientReportDeckPayload = { ...data, highlights };
        writeOrganicClientReportDeckSession(deckId, next);
        if (!cancelled) setPayload(next);
      } catch {
        /* Keep deck visible with stored highlights. */
      } finally {
        if (!cancelled) setHydratingNarratives(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deckId, siteId]);

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

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const awaitingShareHydrate =
    liveReportMode &&
    !payload &&
    !shareHydrateError &&
    (shareHydrating || siteResolving || !reportSite);

  if (awaitingShareHydrate || (liveReportMode && shareHydrating && !payload)) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#f4f4f5] px-6 font-sans text-base text-[#18181b]">
        <p>Loading client report…</p>
      </div>
    );
  }

  if (liveReportMode && !siteResolving && siteId && !reportSite) {
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
        {siteId ? (
          <Link className="text-base font-semibold text-[#18181b] underline" to={`/sites/${siteId}/organic?section=performance`}>
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
        {siteId ? (
          <Link className="text-base font-semibold text-[#18181b] underline" to={`/sites/${siteId}/organic?section=performance`}>
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
        {siteId ? (
          <Link className="text-base font-semibold text-[#18181b] underline" to={`/sites/${siteId}/organic?section=performance`}>
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

  const pdfDisabled = hydratingNarratives || pdfBusy;

  return (
    <div className="organic-client-report-preview-shell min-h-dvh overflow-auto">
      <div className="organic-client-report-preview-toolbar">
        <div className="min-w-0 truncate text-base font-medium text-white">
          {hydratingNarratives ? "Updating executive narrative…" : `${payload.siteName} · Printer-friendly report`}
        </div>
        <div className="organic-client-report-preview-toolbar-actions">
          {liveReportMode ? (
            <Ga4ReportingDateRangePopover
              busy={shareHydrating}
              value={dateHarness}
              onApply={handleDateHarnessApply}
              todayYmdMax={todayYmdMax}
            />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            disabled={hydratingNarratives}
            className={REPORTING_TOOLBAR_ACTION_BTN}
            onClick={handlePrint}
          >
            <Printer className="h-4 w-4 shrink-0" aria-hidden />
            Print
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pdfDisabled}
            className={REPORTING_TOOLBAR_DOWNLOAD_PDF_BTN_CLASS}
            aria-busy={pdfBusy}
            onClick={() => void handleDownloadPdf()}
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            <span className={REPORTING_TOOLBAR_LABEL_SLOT_CLASS}>
              <span className={REPORTING_TOOLBAR_LABEL_RESERVE_CLASS} aria-hidden>
                Download PDF
              </span>
              <span className={REPORTING_TOOLBAR_LABEL_VISIBLE_CLASS}>
                {pdfBusy ? "Preparing…" : "Download PDF"}
              </span>
            </span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={hydratingNarratives}
            className={REPORTING_TOOLBAR_DOWNLOAD_MARKDOWN_BTN_CLASS}
            onClick={handleDownloadMarkdown}
          >
            <FileText className="h-4 w-4 shrink-0" aria-hidden />
            <span className={REPORTING_TOOLBAR_LABEL_SLOT_CLASS}>
              <span className={REPORTING_TOOLBAR_LABEL_RESERVE_CLASS} aria-hidden>
                Download Markdown
              </span>
              <span className={REPORTING_TOOLBAR_LABEL_VISIBLE_CLASS}>Download Markdown</span>
            </span>
          </Button>
        </div>
      </div>
      {pdfError ? (
        <p className="mx-auto max-w-[52rem] px-4 pt-3 font-sans text-base text-[#b91c1c]" role="alert">
          {pdfError}
        </p>
      ) : null}
      <OrganicClientReportExportDocument content={reportContent} />
    </div>
  );
}
