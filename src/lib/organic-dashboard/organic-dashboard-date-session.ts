import type { Ga4ReportingDateHarness } from "@/components/research/reporting/Ga4ReportingDateRangePopover-types";

const STORAGE_KEY = "neo-pulse-organic-dashboard-dates";

export type OrganicDashboardDateSession = Ga4ReportingDateHarness;

export function readOrganicDashboardDateSession(): OrganicDashboardDateSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrganicDashboardDateSession;
    if (!parsed?.compareRangeDraft?.primary?.startDate) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeOrganicDashboardDateSession(session: OrganicDashboardDateSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}
