import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import type { GscCompetitorDateRange, GscSiteQueryRow } from "@/lib/competitor-research/types";

export type FetchCompetitorGscQueriesResult =
  | { ok: true; queries: GscSiteQueryRow[]; dateRange: GscCompetitorDateRange }
  | { ok: false; error: string; dateRange: GscCompetitorDateRange; errorType?: string };

/** Service account has no access to this site in GSC - flows should continue without GSC data and without loud errors. */
export function isGscSiteNotInListFailure(res: FetchCompetitorGscQueriesResult): boolean {
  return res.ok === false && res.errorType === "site_not_in_list";
}

/** Last 90 days ending ≈ today − 3 days (GSC data lag). Used for site warm cache and Details GSC export. */
export function getGscNinetyDayCompetitorDateRange(): GscCompetitorDateRange {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() - 3);
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 90);
  const startDateStr = startDate.toISOString().split("T")[0]!;
  const endDateStr = endDate.toISOString().split("T")[0]!;
  return { startDate: startDateStr, endDate: endDateStr };
}

/** Last 3 calendar months (from end date), end ≈ today − 3 days (GSC data lag). */
export function getDefaultGscCompetitorDateRange(): GscCompetitorDateRange {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() - 3);
  const startDate = new Date(endDate);
  startDate.setMonth(endDate.getMonth() - 3);
  const startDateStr = startDate.toISOString().split("T")[0]!;
  const endDateStr = endDate.toISOString().split("T")[0]!;
  return { startDate: startDateStr, endDate: endDateStr };
}

/** Last 6 calendar months (from end date), end ≈ today − 3 days (GSC data lag). */
export function getGscSixMonthCompetitorDateRange(): GscCompetitorDateRange {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() - 3);
  const startDate = new Date(endDate);
  startDate.setMonth(endDate.getMonth() - 6);
  const startDateStr = startDate.toISOString().split("T")[0]!;
  const endDateStr = endDate.toISOString().split("T")[0]!;
  return { startDate: startDateStr, endDate: endDateStr };
}

/** Enough rows for exclude-intent hints; GSC returns top rows by metric (not 10k). */
export const COMPETITOR_GSC_QUERY_ROW_LIMIT = 500;

export async function fetchCompetitorGscQueries(options: {
  siteUrl: string;
  startDate?: string;
  endDate?: string;
  rowLimit?: number;
}): Promise<FetchCompetitorGscQueriesResult> {
  const dateRange =
    options.startDate && options.endDate
      ? { startDate: options.startDate, endDate: options.endDate }
      : getDefaultGscCompetitorDateRange();

  const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
  const url = `${base}/api/gsc/fetch-queries`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        siteUrl: options.siteUrl,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        rowLimit:
          options.rowLimit != null && options.rowLimit > 0
            ? Math.min(options.rowLimit, 10000)
            : COMPETITOR_GSC_QUERY_ROW_LIMIT,
      }),
    });
    const j = (await res.json()) as {
      success?: boolean;
      error?: string;
      queries?: GscSiteQueryRow[];
      message?: string;
      errorType?: string;
    };

    const errorType = typeof j.errorType === "string" && j.errorType.trim() ? j.errorType.trim() : undefined;

    if (!res.ok) {
      const err = typeof j.error === "string" && j.error.trim() ? j.error.trim() : `GSC request failed (${res.status})`;
      return { ok: false, error: err, dateRange, errorType };
    }
    if (!j.success) {
      const err = typeof j.error === "string" && j.error.trim() ? j.error.trim() : "GSC returned no data";
      return { ok: false, error: err, dateRange, errorType };
    }

    const queries = Array.isArray(j.queries) ? j.queries : [];
    return { ok: true, queries, dateRange };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg || "GSC fetch failed", dateRange };
  }
}
