import { describe, expect, it } from "vitest";
import {
  buildOrganicClientReportAppPath,
  clientReportSitePathSegmentFromDisplayName,
  resolveClientReportSiteIdFromRoute,
} from "@/lib/organic-dashboard/organic-client-report-site-path";

describe("organic-client-report-site-path", () => {
  it("slugifies client display name for the URL path", () => {
    expect(clientReportSitePathSegmentFromDisplayName("Blind Magic Custom Blinds & Drapery")).toBe(
      "blind-magic-custom-blinds-drapery",
    );
  });

  it("puts client slug in path and wp id in siteId query", () => {
    const path = buildOrganicClientReportAppPath({
      siteId: "wp-1777843649561",
      siteDisplayName: "Blind Magic Custom Blinds & Drapery",
      search: "deck=abc&client=Blind+Magic",
    });
    expect(path).toContain("/sites/blind-magic-custom-blinds-drapery/organic/client-report");
    expect(path).toContain("siteId=wp-1777843649561");
    expect(path).toContain("deck=abc");
  });

  it("resolves wp id from siteId query when path is a slug", () => {
    const id = resolveClientReportSiteIdFromRoute(
      "blind-magic-custom-blinds-drapery",
      "siteId=wp-99&deck=x",
      [],
    );
    expect(id).toBe("wp-99");
  });

  it("still accepts legacy wp-* path segment", () => {
    const id = resolveClientReportSiteIdFromRoute("wp-1777843649561", "deck=x", []);
    expect(id).toBe("wp-1777843649561");
  });
});
