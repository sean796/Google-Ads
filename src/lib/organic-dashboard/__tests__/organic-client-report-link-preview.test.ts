import { describe, expect, it } from "vitest";
import {
  appendOrganicClientReportClientQuery,
  buildOrganicClientReportLinkPreviewMeta,
  readOrganicClientReportClientLabel,
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
});
