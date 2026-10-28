import { describe, expect, it, vi } from "vitest";
import { EMPTY_CLIENT_REPORT_HIGHLIGHTS } from "@/lib/organic-dashboard/organic-client-report-content";
import { publishOrganicClientReportDeckAndBuildShareUrl } from "@/lib/organic-dashboard/organic-client-report-deck-publish";
import type { OrganicDashboardViewModel } from "@/lib/organic-dashboard/organic-dashboard-view-model";

vi.mock("@/lib/organic-dashboard/organic-client-report-deck-session", () => ({
  publishOrganicClientReportDeckSession: vi.fn(async () => undefined),
}));

const minimalViewModel = {
  periodLabels: { primary: "Apr 2026", compare: "Mar 2026" },
  hasGoogleAds: false,
} as OrganicDashboardViewModel;

describe("organic-client-report-deck-publish", () => {
  it("builds share URL with deck, siteId, and reporting period params", async () => {
    const deckId = "11111111-1111-4111-8111-111111111111";
    const { shareUrl } = await publishOrganicClientReportDeckAndBuildShareUrl({
      siteId: "wp-42",
      siteDisplayName: "Blind Magic",
      sitePublicUrl: "https://blindmagic.com",
      shareState: {
        section: "performance",
        primaryPreset: "last_30",
        compareBaseline: "previous_period",
        compareEnabled: true,
        compareRangeDraft: {
          primary: { startDate: "2026-04-07", endDate: "2026-04-13" },
          compare: { startDate: "2026-03-31", endDate: "2026-04-06" },
        },
      },
      viewModel: minimalViewModel,
      readyHighlights: EMPTY_CLIENT_REPORT_HIGHLIGHTS,
      showCompare: true,
      deckId,
      preparedOn: "2026-04-13",
      origin: "https://neo-pulse-static.onrender.com",
    });

    expect(shareUrl).toContain("/api/organic-dashboard/client-report/open");
    expect(shareUrl).toContain("deck=11111111-1111-4111-8111-111111111111");
    expect(shareUrl).toContain("siteId=wp-42");
    expect(shareUrl).toContain("preset=last_30");
    expect(shareUrl).toContain(encodeURIComponent("/sites/blind-magic/organic/client-report"));
  });
});
