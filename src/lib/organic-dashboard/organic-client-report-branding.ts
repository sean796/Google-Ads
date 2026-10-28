/** Neo Digital wordmark for report cover. */
export const AGENCY_REPORT_LOGO_URL = "/branding/neodigital-logo.png";

export function resolveAgencyReportLogoUrl(): string {
  if (typeof window !== "undefined" && window.location.origin) {
    return `${window.location.origin}${AGENCY_REPORT_LOGO_URL}`;
  }
  return AGENCY_REPORT_LOGO_URL;
}
