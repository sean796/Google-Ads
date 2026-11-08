import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOverviewBridgeSyncPatch } from "../use-pulse-assist-overview-bridge";

describe("usePulseAssistOverviewBridge", () => {
  it("buildOverviewBridgeSyncPatch keeps postId 0 and passes expand context", () => {
    expect(
      buildOverviewBridgeSyncPatch({
        sitemapSource: "pages",
        expandedPageUrl: "https://example.com/solar/",
        expandedPageTitle: "Solar Page",
      }),
    ).toEqual({
      sitemapSource: "pages",
      expandedPageUrl: "https://example.com/solar/",
      expandedPageTitle: "Solar Page",
      postId: 0,
    });
  });

  it("buildOverviewBridgeSyncPatch nulls missing title", () => {
    expect(
      buildOverviewBridgeSyncPatch({
        sitemapSource: "posts",
        expandedPageUrl: null,
      }),
    ).toEqual({
      sitemapSource: "posts",
      expandedPageUrl: null,
      expandedPageTitle: null,
      postId: 0,
    });
  });

  it("module does not import or call resolveNeoPulseUrl", () => {
    const src = readFileSync(resolve(__dirname, "../use-pulse-assist-overview-bridge.ts"), "utf8");
    expect(src).not.toMatch(/resolveNeoPulseUrl/);
    expect(src).not.toMatch(/REMOVED_NEO_PULSE_WP_TOOLs/);
  });
});
