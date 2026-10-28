import { formatLocalYmd } from "@/lib/reporting/reporting-date-presets";
import { appendOrganicClientReportClientQuery } from "@/lib/organic-dashboard/organic-client-report-link-preview";
import { buildOrganicClientReportAppPath } from "@/lib/organic-dashboard/organic-client-report-site-path";
import {
  publishOrganicClientReportDeckSession,
  type OrganicClientReportDeckPayload,
} from "@/lib/organic-dashboard/organic-client-report-deck-session";
import {
  buildOrganicReportingShareSearch,
  type OrganicReportingShareState,
} from "@/lib/organic-dashboard/organic-reporting-share-url";
import type { OrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import type { OrganicReportingHighlights } from "@/lib/organic-dashboard/organic-reporting-highlights";
import type { LocalGridScanDocument } from "@/lib/local-grid-studio/local-grid-types";

export type PublishOrganicClientReportDeckInput = {
  siteId: string;
  siteDisplayName: string;
  sitePublicUrl: string;
  shareState: OrganicReportingShareState;
  viewModel: OrganicDashboardViewModel;
  readyHighlights: OrganicReportingHighlights;
  showCompare: boolean;
  localGridScan?: LocalGridScanDocument | null;
  preparedOn?: string;
  deckId?: string;
  origin?: string;
  clientLogoUrl?: string | null;
  clientLogoBoxTheme?: "black" | "white" | null;
};

export type PublishOrganicClientReportDeckResult = {
  deckId: string;
  payload: OrganicClientReportDeckPayload;
  shareUrl: string;
};

/** Persists deck to browser + hub, returns absolute SPA URL with deck and date query params. */
export async function publishOrganicClientReportDeckAndBuildShareUrl(
  input: PublishOrganicClientReportDeckInput,
): Promise<PublishOrganicClientReportDeckResult> {
  const deckId = input.deckId ?? crypto.randomUUID();
  const preparedOn = input.preparedOn ?? formatLocalYmd(new Date());
  const payload: OrganicClientReportDeckPayload = {
    siteId: input.siteId,
    highlights: input.readyHighlights,
    viewModel: input.viewModel,
    siteName: input.siteDisplayName,
    siteUrl: input.sitePublicUrl,
    showCompare: input.showCompare,
    preparedOn,
    localGridScan: input.localGridScan ?? null,
    clientLogoUrl: input.clientLogoUrl ?? null,
    clientLogoBoxTheme: input.clientLogoBoxTheme ?? null,
  };
  await publishOrganicClientReportDeckSession(deckId, payload);

  const shareQs = buildOrganicReportingShareSearch(input.shareState);
  const deckParam = `deck=${encodeURIComponent(deckId)}`;
  const search = appendOrganicClientReportClientQuery(
    shareQs ? `${deckParam}&${shareQs}` : deckParam,
    input.siteDisplayName,
  );
  const path = buildOrganicClientReportAppPath({
    siteId: input.siteId,
    siteDisplayName: input.siteDisplayName,
    search,
  });
  const origin =
    input.origin ??
    (typeof window !== "undefined" ? window.location.origin : "https://app.example.com");
  const shareUrl = new URL(path, origin).href;

  return { deckId, payload, shareUrl };
}
