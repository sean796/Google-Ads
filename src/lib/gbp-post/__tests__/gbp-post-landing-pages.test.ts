import { describe, expect, it } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import {
  buildGbpLandingPageAssignments,
  isGbpHomepageUrl,
  pickInitialGbpLandingPage,
  pickRandomGbpLandingPage,
} from "@/lib/gbp-post/gbp-post-landing-pages";

const sampleSite: WordPressSite = {
  id: "site-1",
  name: "Advance Blinds",
  siteUrl: "https://example.com",
  username: "user",
  appPassword: "pass",
  connectedAt: 0,
  gbpLocationId: "loc-1",
  enabled: true,
};

describe("gbp-post-landing-pages", () => {
  it("detects homepage URLs", () => {
    expect(isGbpHomepageUrl("https://example.com/", "https://example.com")).toBe(true);
    expect(isGbpHomepageUrl("https://example.com/blinds/", "https://example.com")).toBe(false);
  });

  it("pickInitialGbpLandingPage prefers non-homepage when available", () => {
    const picked = pickInitialGbpLandingPage(
      ["https://example.com/", "https://example.com/blinds/", "https://example.com/drapes/"],
      "https://example.com",
    );
    expect(picked).toBe("https://example.com/blinds/");
  });

  it("pickInitialGbpLandingPage falls back to first candidate when only homepage exists", () => {
    expect(pickInitialGbpLandingPage(["https://example.com/"], "https://example.com")).toBe(
      "https://example.com/",
    );
  });

  it("pickRandomGbpLandingPage prefers a different URL when possible", () => {
    const candidates = [
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c",
    ];
    for (let i = 0; i < 20; i += 1) {
      const picked = pickRandomGbpLandingPage(candidates, "https://example.com/a");
      expect(candidates).toContain(picked);
      expect(picked).not.toBe("https://example.com/a");
    }
  });

  it("buildGbpLandingPageAssignments leaves blank when no candidates", () => {
    const assignments = buildGbpLandingPageAssignments([sampleSite], { "site-1": [] }, "initial");
    expect(assignments["site-1"]).toBe("");
  });

  it("buildGbpLandingPageAssignments initial mode assigns first real page", () => {
    const assignments = buildGbpLandingPageAssignments(
      [sampleSite],
      {
        "site-1": ["https://example.com/", "https://example.com/services/"],
      },
      "initial",
    );
    expect(assignments["site-1"]).toBe("https://example.com/services/");
  });

  it("buildGbpLandingPageAssignments shuffle mode returns a candidate", () => {
    const assignments = buildGbpLandingPageAssignments(
      [sampleSite],
      {
        "site-1": ["https://example.com/a", "https://example.com/b"],
      },
      "shuffle",
      { "site-1": "https://example.com/a" },
    );
    expect(["https://example.com/a", "https://example.com/b"]).toContain(assignments["site-1"]);
  });
});
