import { describe, expect, it } from "vitest";
import {
  appendOrganicClientReportClientQuery,
  buildOrganicClientReportLinkPreviewMeta,
  buildOrganicClientReportOpenUrl,
  readOrganicClientReportClientLabel,
  resolveOrganicClientReportPreviewImageUrl,
} from "@/lib/organic-dashboard/organic-client-report-link-preview";

describe("organic-client-report-link-preview", () => {
  it("round-trips client label in query string", () => {
    const qs = appendOrganicClientReportClientQuery("deck=abc&section=performance", "Blind Magic");
    expect(readOrganicClientReportClientLabel(qs)).toBe("Blind Magic");
    expect(qs).toContain("client=Blind");
  });

  it("builds preview title and description from deck payload", () => {
    const meta = buildOrganicClientReportLinkPreviewMeta({
      siteName: "Blind Magic Custom Blinds & Drapery",
      siteUrl: "https://blindmagic.com/",
      showCompare: true,
      viewModel: {
        periodLabels: {
          compare: "Aug 22 - Sep 20, 2026",
          primary: "Sep 21 - Oct 20, 2026",
        },
      } as never,
    });
    expect(meta.title).toContain("Blind Magic Custom Blinds");
    expect(meta.description).toContain("blindmagic.com");
    expect(meta.description).toContain("vs");
  });

  it("builds open URL with app redirect on the static origin", () => {
    const openUrl = buildOrganicClientReportOpenUrl({
      siteId: "wp-42",
      search: "deck=abc&section=performance",
      siteDisplayName: "Blind Magic",
      appOrigin: "https://neo-pulse-static.onrender.com",
      linkOrigin: "https://neo-pulse-static.onrender.com",
    });
    expect(openUrl).toMatch(
      /^https:\/\/neo-pulse-static\.onrender\.com\/api\/organic-dashboard\/client-report\/open\?/,
    );
    expect(openUrl).toContain("siteId=wp-42");
    expect(openUrl).toContain("app=");
    expect(decodeURIComponent(openUrl)).toContain("/sites/blind-magic/organic/client-report");
  });

  it("resolves relative client logo against app URL origin", () => {
    expect(
      resolveOrganicClientReportPreviewImageUrl(
        "/client-logos/wp-42.png",
        "https://neo-pulse-static.onrender.com/sites/x/organic/client-report?deck=1",
      ),
    ).toBe("https://neo-pulse-static.onrender.com/client-logos/wp-42.png");
  });
});
