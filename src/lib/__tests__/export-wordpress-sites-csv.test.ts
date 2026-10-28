import { describe, expect, it } from "vitest";
import { buildWordPressSitesCsv } from "@/lib/export-wordpress-sites-csv";
import type { WordPressSite } from "@/components/integrations/types";

describe("buildWordPressSitesCsv", () => {
  it("includes primaryLocalKeyword column", () => {
    const site: WordPressSite = {
      id: "wp-1",
      name: "Demo",
      siteUrl: "https://demo.example",
      username: "admin",
      appPassword: "secret",
      connectedAt: 1,
      primaryLocalKeyword: "blinds near me",
    };
    const csv = buildWordPressSitesCsv([site]);
    const header = csv.split("\r\n")[0] ?? "";
    expect(header).toContain("primaryLocalKeyword");
    expect(csv).toContain("blinds near me");
  });
});
