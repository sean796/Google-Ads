import { buildOrganicClientReportAppPath } from "@/lib/organic-dashboard/organic-client-report-site-path";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import {
  formatClientReportPeriodLine,
  normalizeClientReportPeriodLabel,
} from "@/lib/organic-dashboard/organic-client-report-copy";
import type { OrganicClientReportDeckPayload } from "@/lib/organic-dashboard/organic-client-report-deck-session";

export const ORGANIC_CLIENT_REPORT_CLIENT_QUERY = "client";

export function appendOrganicClientReportClientQuery(
  search: string,
  siteDisplayName: string,
): string {
  const label = siteDisplayName.trim();
  if (!label) return search;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.set(ORGANIC_CLIENT_REPORT_CLIENT_QUERY, label);
  return params.toString();
}

export function readOrganicClientReportClientLabel(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get(ORGANIC_CLIENT_REPORT_CLIENT_QUERY)?.trim() ?? "";
}

export function buildOrganicClientReportAppUrl(
  siteId: string,
  search: string,
  origin?: string,
  siteDisplayName?: string,
): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const qs = appendOrganicClientReportClientQuery(search, siteDisplayName?.trim() ?? "");
  const path = buildOrganicClientReportAppPath({
    siteId,
    siteDisplayName: siteDisplayName?.trim() || siteId,
    search: qs,
  });
  return `${base}${path}`;
}

export type OrganicClientReportLinkPreviewMeta = {
  title: string;
  description: string;
};

export function buildOrganicClientReportLinkPreviewMeta(
  payload: Pick<OrganicClientReportDeckPayload, "siteName" | "siteUrl" | "showCompare" | "viewModel">,
): OrganicClientReportLinkPreviewMeta {
  const comparePeriodLabel = normalizeClientReportPeriodLabel(payload.viewModel.periodLabels.compare);
  const primaryPeriodLabel = normalizeClientReportPeriodLabel(payload.viewModel.periodLabels.primary);
  const periodLine = formatClientReportPeriodLine(
    payload.showCompare,
    comparePeriodLabel,
    primaryPeriodLabel,
  );
  const title = `${payload.siteName.trim()} · Organic performance report`;
  const description = [payload.siteUrl.trim(), periodLine].filter(Boolean).join(" · ");
  return { title, description };
}

/** Public HTML entry for Slack/link previews; redirects to the SPA client report URL. */
export function buildOrganicClientReportOpenUrl(args: {
  siteId: string;
  search: string;
  siteDisplayName: string;
  appOrigin?: string;
}): string {
  const appSearch = appendOrganicClientReportClientQuery(args.search, args.siteDisplayName);
  const appUrl = buildOrganicClientReportAppUrl(
    args.siteId,
    appSearch,
    args.appOrigin,
    args.siteDisplayName,
  );
  const params = new URLSearchParams(appSearch.startsWith("?") ? appSearch.slice(1) : appSearch);
  params.set("siteId", args.siteId.trim());
  params.set("app", appUrl);
  const base = BACKEND_API_BASE.replace(/\/+$/, "");
  return `${base}/api/organic-dashboard/client-report/open?${params.toString()}`;
}
