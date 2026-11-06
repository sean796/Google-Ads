export interface GA4OrganicAcquisitionPeriod {
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  averageSessionDurationSec: number;
  keyEvents: number;
  eventCount: number;
  eventsPerSession: number;
}

/** GA4 report data returned by POST /api/ga/report-data. All metrics are organic-only (Organic Search channel). */
export interface GA4ReportData {
  /** Conversions from organic search sessions only. */
  conversions?: {
    current: number;
    previous: number;
    change: number;
    /** null when prior period has no data (do not show 100%). */
    changePercent: number | null;
  };
  /** Organic search sessions only. */
  organicTraffic?: {
    sessionsCurrent: number;
    sessionsPrevious: number;
    change: number;
    /** null when prior period has no data (do not show 100%). */
    changePercent: number | null;
  };
  /** Rich organic engagement metrics for reporting CSV (current vs compare date ranges). */
  organicAcquisition?: {
    current: GA4OrganicAcquisitionPeriod;
    previous: GA4OrganicAcquisitionPeriod;
  };
  /**
   * Same shape as `organicAcquisition`. Returned by some deployed `/api/ga/report-data` handlers.
   */
  organicTrafficAcquisition?: {
    current: GA4OrganicAcquisitionPeriod;
    previous: GA4OrganicAcquisitionPeriod;
  };
  /** Optional channel breakdown when the API returns multi-channel rows. */
  trafficByChannel?: {
    channels: GA4TrafficChannelRow[];
  };
  /** firstUserMedium = organic, current vs compare period totals (User acquisition report). */
  organicUsers?: {
    current: GA4OrganicUsersPeriodTotals;
    previous: GA4OrganicUsersPeriodTotals;
  };
  /** firstUserMedium = organic, monthly rows + period totals (User acquisition). */
  organicUsersMonthly?: GA4OrganicUsersMonthlyBlock;
  /** sessionDefaultChannelGroup = Organic Search, monthly traffic acquisition rows. */
  organicTrafficAcquisitionMonthly?: GA4OrganicTrafficAcquisitionMonthlyBlock;
}

export type GA4OrganicTrafficAcquisitionMonthlyBlock = {
  channel: "Organic Search";
  dimension: "sessionDefaultChannelGroup";
  periodStart: string;
  periodEnd: string;
  totals: GA4OrganicAcquisitionPeriod;
  months: Array<
    {
      yearMonth: string;
      label: string;
    } & GA4OrganicAcquisitionPeriod
  >;
};

export type GA4OrganicUsersPeriodTotals = {
  totalUsers: number;
  newUsers: number;
  userKeyEventRate: number;
  keyEvents: number;
};

export type GA4OrganicUsersMonthlyBlock = {
  medium: "organic";
  dimension: "firstUserMedium";
  periodStart: string;
  periodEnd: string;
  totals: GA4OrganicUsersPeriodTotals;
  months: Array<{
    yearMonth: string;
    label: string;
    totalUsers: number;
    newUsers: number;
    userKeyEventRate: number;
    keyEvents: number;
  }>;
};

/** Accept `organicAcquisition` or legacy/alternate `organicTrafficAcquisition` from GA report-data. */
export function pickGa4OrganicAcquisition(
  data: GA4ReportData,
): GA4ReportData["organicAcquisition"] | undefined {
  return data.organicAcquisition ?? data.organicTrafficAcquisition;
}

export type GA4TrafficChannelRow = {
  channel: string;
  sessionsCurrent: number;
  sessionsPrevious: number;
  change: number;
  changePercent: number | null;
};
