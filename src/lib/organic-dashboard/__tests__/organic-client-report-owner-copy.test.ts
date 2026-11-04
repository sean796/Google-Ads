import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/organic-dashboard/OrganicClientReportLocalGridMapSnapshot", () => ({
  OrganicClientReportLocalGridMapSnapshot: () => null,
}));

import {
  CLIENT_REPORT_ACCORDION_COPY,
  formatOwnerReportHeading,
  formatOwnerReportMetricLabel,
  getOwnerReportHeadingTooltip,
  getOwnerReportMetricTooltip,
} from "@/lib/organic-dashboard/organic-client-report-copy";
import { buildOrganicClientReportContent } from "@/lib/organic-dashboard/organic-client-report-content";
import { buildOrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import { OrganicClientReportExportDocument } from "@/components/organic-dashboard/OrganicClientReportExportDocument";
import type { OrganicDashboardBundleResponse } from "@/lib/organic-dashboard/organic-dashboard-types";

const sampleBundle: OrganicDashboardBundleResponse = {
  success: true,
  meta: {
    fetchedAt: "2026-10-01T00:00:00Z",
    primary: { startDate: "2026-09-01", endDate: "2026-09-30" },
    compare: { startDate: "2026-08-01", endDate: "2026-08-31" },
  },
  ga4: {
    organicUsers: {
      current: { totalUsers: 1689, newUsers: 1639, userKeyEventRate: 0, keyEvents: 0 },
      previous: { totalUsers: 0, newUsers: 0, userKeyEventRate: 0, keyEvents: 0 },
    },
    organicUsersMonthly: {
      medium: "organic",
      dimension: "firstUserMedium",
      periodStart: "2026-08-01",
      periodEnd: "2026-10-31",
      totals: { totalUsers: 1689, newUsers: 1639, userKeyEventRate: 0, keyEvents: 0 },
      months: [
        { yearMonth: "202608", label: "August 2026", totalUsers: 552, newUsers: 519, userKeyEventRate: 0, keyEvents: 0 },
        { yearMonth: "202609", label: "September 2026", totalUsers: 687, newUsers: 649, userKeyEventRate: 0, keyEvents: 0 },
        { yearMonth: "202610", label: "October 2026", totalUsers: 500, newUsers: 471, userKeyEventRate: 0, keyEvents: 0 },
      ],
    },
    organicAcquisition: {
      current: {
        sessions: 1200,
        engagedSessions: 1100,
        engagementRate: 0.916,
        averageSessionDurationSec: 80,
        keyEvents: 11,
        eventCount: 100,
        eventsPerSession: 1.2,
      },
      previous: {
        sessions: 983,
        engagedSessions: 962,
        engagementRate: 0.979,
        averageSessionDurationSec: 66,
        keyEvents: 5,
        eventCount: 90,
        eventsPerSession: 1.1,
      },
    },
  },
  gsc: {
    stats: {
      currentPeriod: {
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        clicks: 881,
        impressions: 73432,
        ctr: 0.012,
        avgPosition: 13.2,
      },
      comparisonPeriod: {
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        clicks: 830,
        impressions: 88428,
        ctr: 0.009,
        avgPosition: 16.2,
      },
      comparisons: {
        clicksChangePercent: 6.1,
      },
      topKeywords: [
        {
          query: "blind magic edmonton",
          currentRanking: 1.2,
          previousRanking: 1.5,
          rankingChange: 0.3,
          currentClicks: 140,
          previousClicks: 120,
          clicksChange: 20,
          currentImpressions: 600,
          previousImpressions: 550,
          impressionsChange: 50,
        },
      ],
    },
  },
  googleAds: {
    success: true,
    currencyCode: "CAD",
    customerId: "123-456-7890",
    account: {
      impressions: 10000,
      clicks: 800,
      costMicros: 11922910000,
      conversions: 649,
      ctr: 0.08,
      averageCpc: 14900000,
    },
    dailySeries: [],
  },
  sources: { ga4: "ok", gsc: "ok", semrush: "skipped" },
};

function buildSampleContent() {
  const vm = buildOrganicDashboardViewModel(sampleBundle, { showCompare: false });
  const content = buildOrganicClientReportContent({
    viewModel: vm,
    highlights: {
      executiveSummary:
        "Shoppers searching for Blind Magic drove strong website visits and quote inquiries.",
      keyTakeaways: [
        "Website visits grew as more homeowners searched for custom window coverings.",
        "Quote and call actions increased alongside stronger Google visibility.",
      ],
      performanceNarrative: [
        "More buyers visited your website from Google searches this period.",
      ],
      keywordNarrative: [
        "Homeowners searched directly for **Blind Magic Edmonton** and custom blinds.",
      ],
      googleAdsNarrative: ["Paid ads delivered steady customer inquiries."],
      localGridNarrative: [],
      topOpportunities: [
        {
          rank: 1,
          label: "Grow Custom Shades Inquiries",
          why: "Capturing more shoppers searching for **Custom Shades Edmonton** can bring in high-value quote requests.",
          comparisonRows: [
            { metric: "Clicks", comparePeriodValue: "n/a", primaryPeriodValue: "35" },
          ],
          metrics: "",
          action: "",
        },
      ],
    },
    siteName: "Blind Magic",
    siteUrl: "https://blindmagic.com",
    showCompare: false,
    preparedOn: "2026-11-02",
  });
  return content;
}

describe("owner report heading and metric copy", () => {
  it("keeps section headings relative and simple (GA4, Semrush, Keyword Performance, Highlights, Google Ads)", () => {
    expect(formatOwnerReportHeading("Performance summary")).toBe("GA4");
    expect(getOwnerReportHeadingTooltip("Performance summary")).toContain("shoppers");
    expect(formatOwnerReportHeading("Website traffic (GA4) by month")).toBe("GA4");
    expect(formatOwnerReportHeading("Semrush estimates")).toBe("Semrush");
    expect(formatOwnerReportHeading("Keyword performance")).toBe("Keyword Performance");
    expect(formatOwnerReportHeading("Highlights")).toBe("Highlights");
    expect(formatOwnerReportHeading("Google Ads")).toBe("Google Ads");
  });

  it("maps technical GA4, GSC, Semrush, Map, and Ads metrics to CEO-friendly labels and tooltips", () => {
    expect(formatOwnerReportMetricLabel("Sessions")).toBe("Website Visits");
    expect(formatOwnerReportMetricLabel("Key events")).toBe("Leads & Quote Actions");
    expect(formatOwnerReportMetricLabel("Total impressions")).toBe("Times Seen on Google");
    expect(formatOwnerReportMetricLabel("Average CTR")).toBe("Click-Through %");
    expect(formatOwnerReportMetricLabel("Average position")).toBe("Average Google Spot");
    expect(formatOwnerReportMetricLabel("TARP (avg map rank)")).toBe("Overall Map Ranking Score");
    expect(getOwnerReportMetricTooltip("Key events")).toContain("quote requests");
    expect(getOwnerReportMetricTooltip("Total impressions")).toContain("Google");
  });

  it("uses the main section heading as the accordion dropdown, shows only GA4 in performance, and hides n/a when showCompare is false", () => {
    const content = buildSampleContent();

    const html = renderToStaticMarkup(
      createElement(OrganicClientReportExportDocument, { content }),
    ).replace(/&amp;/g, "&");

    expect(html).toContain(CLIENT_REPORT_ACCORDION_COPY.coverInsights.label);
    expect(html).toContain(">GA4<");
    expect(html).toContain(">Highlights<");
    expect(html).toContain(">Google Ads<");
    expect(html).toContain("Grow Custom Shades Inquiries");
    expect(html).not.toContain("Website & Search Story");
    expect(html).not.toContain("What Customers Are Searching For");
    expect(html).not.toContain("How Often You Show Up on Google");
    expect(html).not.toContain("Times Seen on Google");
    expect(html).not.toContain(">n/a<");
    expect(html).not.toContain("Period Total");
    expect(html).toContain("Total Users");
    expect(html).toContain("New Users");
    expect(html).toContain(">687<");
    expect(html).toContain(">649<");
    expect(html).toContain('data-state="closed"');
    expect(html).not.toContain('data-state="open"');
    expect(html).not.toContain('title="');
  });

  it("PDF export shows every section narrative and highlight body with no chevron or collapse state", () => {
    const html = renderToStaticMarkup(
      createElement(OrganicClientReportExportDocument, { content: buildSampleContent(), pdfExport: true }),
    ).replace(/&amp;/g, "&");

    expect(html).toContain("More buyers visited your website from Google searches this period.");
    expect(html).toContain("Paid ads delivered steady customer inquiries.");
    expect(html).toContain("Capturing more shoppers searching for");
    expect(html).not.toContain("aria-expanded");
    expect(html).not.toContain("data-state=\"closed\"");
    expect(html).not.toContain("organic-client-report-export__accordion");
  });
});