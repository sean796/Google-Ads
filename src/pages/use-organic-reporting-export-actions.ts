import { useCallback, useRef, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { WordPressSite } from "@/components/integrations/types";
import {
  organicReportingHighlightsQueryKey,
  runOrganicReportingHighlightsQuery,
} from "@/hooks/use-organic-reporting-highlights-query";
import { ORGANIC_DASHBOARD_QUERY_STALE_MS } from "@/lib/organic-dashboard/organic-dashboard-prefetch";
import {
  buildOrganicReportingHighlightsSnapshot,
  fetchLocalGridReportingNarrative,
  type OrganicReportingHighlights,
} from "@/lib/organic-dashboard/organic-reporting-highlights";
import type { OrganicReportingShareState } from "@/lib/organic-dashboard/organic-reporting-share-url";
import { buildOrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";
import {
  fetchAllLocalGridScansForSite,
  type LocalGridReportingSnapshot,
} from "@/lib/organic-dashboard/local-grid-client-report";
import type { LocalGridScanDocument } from "@/lib/local-grid-studio/local-grid-types";
import { publishOrganicClientReportDeckAndBuildShareUrl } from "@/lib/organic-dashboard/organic-client-report-deck-publish";
import { downloadOrganicClientReportPdf } from "@/lib/organic-dashboard/organic-client-report-print";
import type {
  OrganicDashboardBundleResponse,
  OrganicDashboardFetchParams,
} from "@/lib/organic-dashboard/organic-dashboard-types";
import type { OrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model-types";

export type UseOrganicReportingExportActionsArgs = {
  site: WordPressSite;
  mergedHighlights: OrganicReportingHighlights | undefined;
  localGridSnapshot: LocalGridReportingSnapshot | null;
  viewModel: OrganicDashboardViewModel | undefined;
  bundleData: OrganicDashboardBundleResponse | undefined;
  localGridScansData: LocalGridScanDocument[] | undefined;
  fetchParams: OrganicDashboardFetchParams | null;
  showCompare: boolean;
  siteDisplayName: string;
  sitePublicUrl: string;
  googleAdsCustomerId: string;
  queryClient: QueryClient;
  reportExportReady: boolean;
  reportError: (message: string) => void;
  shareState: OrganicReportingShareState;
  preparedOn: string;
  clientLogoUrl: string;
  logoBoxTheme: "black" | "white";
  primaryLocalGridScan: LocalGridScanDocument | null;
};

export function useOrganicReportingExportActions(args: UseOrganicReportingExportActionsArgs) {
  const {
    site, mergedHighlights, localGridSnapshot, viewModel, fetchParams, showCompare,
    siteDisplayName, sitePublicUrl, googleAdsCustomerId, queryClient,
    reportExportReady, reportError, shareState,
    preparedOn, clientLogoUrl, logoBoxTheme, primaryLocalGridScan,
  } = args;
  const [shareCopied, setShareCopied] = useState(false);
  const [downloadPdfBusy, setDownloadPdfBusy] = useState(false);
  const [clientReportBusy, setClientReportBusy] = useState(false);
  const clientReportOpenLock = useRef(false);
  const bundleQuery = { data: args.bundleData };
  const localGridScansQuery = { data: args.localGridScansData };
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
      const [readyHighlights, freshScans] = await Promise.all([
        resolveReadyHighlights(),
        fetchAllLocalGridScansForSite(site.id),
      ]);
      const scansForReport =
        freshScans.length > 0 ? freshScans : (localGridScansQuery.data ?? null);
      const { shareUrl: publishedUrl } = await publishOrganicClientReportDeckAndBuildShareUrl({
        siteId: site.id,
        siteDisplayName,
        sitePublicUrl,
        shareState,
        viewModel,
        readyHighlights,
        showCompare,
        localGridScan: scansForReport?.[0] ?? primaryLocalGridScan,
        localGridScans: scansForReport,
        clientLogoUrl,
        clientLogoBoxTheme: logoBoxTheme,
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
    clientLogoUrl,
    logoBoxTheme,
    siteDisplayName,
    sitePublicUrl,
    viewModel,
    primaryLocalGridScan,
    localGridScansQuery.data,
  ]);

  const handleDownloadPdf = useCallback(async () => {
    if (downloadPdfBusy) return;
    if (!viewModel || !reportExportReady) {
      reportError("Client report · wait for Performance metrics to finish loading.");
      return;
    }
    setDownloadPdfBusy(true);
    try {
      const [readyHighlights, freshScans] = await Promise.all([
        resolveReadyHighlights(),
        fetchAllLocalGridScansForSite(site.id),
      ]);
      const scansForReport =
        freshScans.length > 0 ? freshScans : (localGridScansQuery.data ?? null);
      const content = buildOrganicClientReportContent({
        viewModel,
        highlights: readyHighlights,
        siteName: siteDisplayName,
        siteUrl: sitePublicUrl,
        showCompare,
        preparedOn,
        localGridScan: scansForReport?.[0] ?? primaryLocalGridScan,
        localGridScans: scansForReport,
        clientLogoUrl,
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
    site.id,
    siteDisplayName,
    sitePublicUrl,
    viewModel,
    primaryLocalGridScan,
    localGridScansQuery.data,
    clientLogoUrl,
    logoBoxTheme,
    preparedOn,
  ]);


  return { shareCopied, downloadPdfBusy, clientReportBusy, handleShareLink, handleDownloadPdf };
}
