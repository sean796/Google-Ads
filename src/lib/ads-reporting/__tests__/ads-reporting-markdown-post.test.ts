import { describe, expect, it } from "vitest";
import {
  applyAdsReportingMarkdownPost,
  stripMarkdownSectionH2,
} from "@/lib/ads-reporting/ads-reporting-markdown-post";

describe("ads-reporting-markdown-post", () => {
  it("drops leftover H2 lines from the section body", () => {
    const md = [
      "Spend rose in August.",
      "",
      "## Campaign Performance",
      "",
      "| Theme | Spend |",
      "| --- | --- |",
      "| **Brand** | 100 |",
    ].join("\n");
    expect(stripMarkdownSectionH2(md)).not.toContain("## Campaign Performance");
    expect(applyAdsReportingMarkdownPost(md, "campaign_performance")).toContain("Spend rose in August.");
    expect(applyAdsReportingMarkdownPost(md, "campaign_performance")).toContain("| Brand | 100 |");
    expect(applyAdsReportingMarkdownPost(md, "campaign_performance")).not.toContain("**Brand**");
    expect(applyAdsReportingMarkdownPost(md, "campaign_performance")).not.toMatch(/^## /m);
  });

  it("keeps Key Insights H3 on Executive Summary", () => {
    const md = "Period story.\n\n### Key Insights\n\n- **Spend:** up";
    expect(applyAdsReportingMarkdownPost(md, "executive_summary")).toContain("### Key Insights");
  });
});
