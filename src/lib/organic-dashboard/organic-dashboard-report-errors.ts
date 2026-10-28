import type {
  OrganicDashboardBundleResponse,
  OrganicDashboardSkippedBlock,
  OrganicDashboardSourceStatus,
} from "@/lib/organic-dashboard/organic-dashboard-types";
import { isOrganicSkippedBlock } from "@/lib/organic-dashboard/organic-dashboard-types";

/** Expected gaps (no property ID, no API key, etc.) stay off the error bell. */
function isSilentOrganicSourceReason(reason: string): boolean {
  if (reason.startsWith("missing_") || reason === "no_api_key") return true;
  if (reason === "site_not_in_list") return true;
  return false;
}

function shouldReportOrganicSkippedBlock(
  status: OrganicDashboardSourceStatus | undefined,
  block: unknown,
): block is OrganicDashboardSkippedBlock {
  if (!isOrganicSkippedBlock(block)) return false;
  const reason = block.reason?.trim() ?? "";
  if (isSilentOrganicSourceReason(reason)) return false;
  if (status === "error") return true;
  if (status === "skipped" && block.reason?.trim() === "semrush_error") return true;
  if (status === "skipped") return false;
  return false;
}

function formatBlockMessage(prefix: string, block: { reason?: string; error?: string; client_email?: string; serviceAccountEmail?: string }): string {
  const parts = [block.error?.trim() || block.reason?.trim()].filter(Boolean);
  const email = block.client_email?.trim() || block.serviceAccountEmail?.trim();
  if (email) parts.push(`Service account: ${email}`);
  const body = parts.join(" · ") || "Unavailable";
  return `${prefix}: ${body}`;
}

/** Log real source failures to the manager bell tray; missing config stays silent. */
export function reportOrganicDashboardSourceErrors(
  data: OrganicDashboardBundleResponse,
  reportError: (message: string) => void,
): void {
  const sources = data.sources;
  if (shouldReportOrganicSkippedBlock(sources?.ga4, data.ga4)) {
    reportError(formatBlockMessage("Organic dashboard · GA4", data.ga4));
  }
  if (shouldReportOrganicSkippedBlock(sources?.gsc, data.gsc)) {
    reportError(formatBlockMessage("Organic dashboard · GSC", data.gsc));
  }
  if (shouldReportOrganicSkippedBlock(sources?.gscHistorical, data.gscHistorical)) {
    reportError(formatBlockMessage("Organic dashboard · GSC trend", data.gscHistorical));
  }
  if (shouldReportOrganicSkippedBlock(sources?.semrush, data.semrush)) {
    reportError(formatBlockMessage("Organic dashboard · Semrush", data.semrush));
  }
}

export function reportOrganicDashboardFetchError(
  err: unknown,
  reportError: (message: string) => void,
): void {
  const message = err instanceof Error ? err.message.trim() : "Organic dashboard fetch failed";
  reportError(`Organic dashboard · fetch failed: ${message}`);
}
