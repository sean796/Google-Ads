/**
 * Publish Blind Magic organic client report deck on Render hub and print share URL.
 * Usage: npx tsx scripts/publish-blind-magic-organic-share.ts
 */
import { setPostCreatorWorkerApiBase } from "../src/lib/wordpress-api/connection";
import { buildGa4ReportingRanges } from "../src/lib/reporting/ga4-analytics-date-ranges";
import { buildOrganicDashboardFetchParams } from "../src/lib/organic-dashboard/organic-dashboard-fetch-params";
import { fetchOrganicDashboardBundle } from "../src/lib/organic-dashboard/organic-dashboard-fetch";
import { buildOrganicDashboardViewModel } from "../src/lib/organic-dashboard/organic-dashboard-view-model";
import {
  buildOrganicReportingHighlightsSnapshot,
  normalizeOrganicReportingHighlights,
  type OrganicReportingHighlights,
} from "../src/lib/organic-dashboard/organic-reporting-highlights";
import { publishOrganicClientReportDeckAndBuildShareUrl } from "../src/lib/organic-dashboard/organic-client-report-deck-publish";
import type { Ga4ReportingDateHarness } from "../src/components/research/reporting/Ga4ReportingDateRangePopover";
import type { WordPressSite } from "../src/components/integrations/types";

const HUB = "https://pulse-host-wp-hub.onrender.com";
const STATIC = "https://neo-pulse-static.onrender.com";

const SITE: WordPressSite = {
  id: "wp-1791924906059-1",
  name: "Blind Magic",
  siteUrl: "https://blindmagic.com/",
  username: "",
  appPassword: "",
  ga4PropertyId: "289673706",
  googleAdsCustomerId: "5619137403",
  semrushSiteAuditProjectId: "25751625",
  semrushPositionTrackingProjectId: "25751625",
  connectedAt: 0,
  enabled: true,
};

const dateHarness: Ga4ReportingDateHarness = {
  primaryPreset: "last_3_months",
  compareBaseline: "previous_period",
  compareEnabled: false,
  compareRangeDraft: buildGa4ReportingRanges({
    primaryPreset: "last_3_months",
    primaryCustom: { startDate: "", endDate: "" },
    compareEnabled: false,
    compareBaseline: "previous_period",
    compareCustom: { startDate: "", endDate: "" },
  }),
};

async function main() {
  setPostCreatorWorkerApiBase(HUB);

  const fetchParams = buildOrganicDashboardFetchParams(
    SITE,
    dateHarness,
    SITE.ga4PropertyId ?? "",
    SITE.googleAdsCustomerId,
  );
  if (!fetchParams) {
    throw new Error("Invalid reporting date harness for last_3_months.");
  }

  console.log("Fetching organic dashboard bundle from hub…");
  const bundle = await fetchOrganicDashboardBundle(fetchParams);
  const viewModel = buildOrganicDashboardViewModel(bundle, {
    showCompare: false,
    googleAdsCustomerIdForReporting: SITE.googleAdsCustomerId,
  });

  console.log("Generating AI highlights…");
  const snapshot = buildOrganicReportingHighlightsSnapshot(
    viewModel,
    SITE.name,
    "https://blindmagic.com/",
    false,
    null,
  );
  const hlRes = await fetch(`${HUB}/api/organic-dashboard/reporting-highlights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteId: SITE.id,
      snapshot: { ...snapshot, periods: undefined },
    }),
  });
  const hlData = (await hlRes.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    highlights?: unknown;
  };
  if (!hlRes.ok || hlData.success === false) {
    throw new Error(hlData.error ?? `Highlights HTTP ${hlRes.status}`);
  }
  const highlights = normalizeOrganicReportingHighlights(hlData.highlights);
  if (!highlights) {
    throw new Error("Highlights model returned empty content.");
  }

  console.log("Publishing deck…");
  const { shareUrl, deckId } = await publishOrganicClientReportDeckAndBuildShareUrl({
    siteId: SITE.id,
    siteDisplayName: SITE.name,
    sitePublicUrl: "https://blindmagic.com/",
    shareState: { section: "performance", ...dateHarness },
    viewModel,
    readyHighlights: highlights,
    showCompare: false,
    origin: STATIC,
  });

  const spaUrl = `${STATIC}/sites/blind-magic/organic/client-report?deck=${encodeURIComponent(deckId)}&section=performance&structure=filter&preset=last_3_months&client=${encodeURIComponent(SITE.name)}&siteId=${encodeURIComponent(SITE.id)}`;

  console.log("\ndeckId:", deckId);
  console.log("shareUrl (open link):", shareUrl);
  console.log("spaUrl (direct app):", spaUrl);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
