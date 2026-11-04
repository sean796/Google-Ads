import { describe, expect, it } from "vitest";
import {
  mergePropertyBrandingIntoClientReportDeck,
  normalizeClientLogoBoxTheme,
} from "@/lib/organic-dashboard/organic-client-report-property-branding";
import type { OrganicClientReportDeckPayload } from "@/lib/organic-dashboard/organic-client-report-deck-session";
import { EMPTY_CLIENT_REPORT_HIGHLIGHTS } from "@/lib/organic-dashboard/organic-client-report-content";

const basePayload: OrganicClientReportDeckPayload = {
  siteId: "wp-neo",
  siteName: "Neo Digital",
  siteUrl: "https://neodigital.ca/",
  showCompare: false,
  preparedOn: "2026-11-04",
  viewModel: {} as OrganicClientReportDeckPayload["viewModel"],
  highlights: EMPTY_CLIENT_REPORT_HIGHLIGHTS,
  clientLogoBoxTheme: "white",
  clientLogoUrl: "https://neodigital.ca/logo.svg",
};

describe("normalizeClientLogoBoxTheme", () => {
  it("defaults to black", () => {
    expect(normalizeClientLogoBoxTheme(undefined)).toBe("black");
    expect(normalizeClientLogoBoxTheme(null)).toBe("black");
    expect(normalizeClientLogoBoxTheme("black")).toBe("black");
  });

  it("keeps white", () => {
    expect(normalizeClientLogoBoxTheme("white")).toBe("white");
  });
});

describe("mergePropertyBrandingIntoClientReportDeck", () => {
  it("overrides stale deck white box with property black", () => {
    const merged = mergePropertyBrandingIntoClientReportDeck(
      basePayload,
      { clientLogoBoxTheme: "black", clientLogoUrl: "https://neodigital.ca/logo.svg" },
      "https://neo-pulse-static.onrender.com",
    );
    expect(merged.clientLogoBoxTheme).toBe("black");
    expect(merged.clientLogoUrl).toContain("/api/manager-wordpress-properties/client-logo/wp-neo");
  });
});
