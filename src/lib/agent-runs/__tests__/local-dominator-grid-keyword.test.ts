import { describe, expect, it } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import { resolveEffectiveGridKeyword } from "@/lib/agent-runs/run-local-dominator-export-client-harness";
import {
  LOCAL_DOMINATOR_GRID_KEYWORD_PROPERTY,
  resolveLocalDominatorExportKeyword,
  resolveWorkflowLocalDominatorGridKeyword,
} from "@/lib/local-dominator/local-dominator-export-keyword";
import { resolvePropertyPrimaryLocalKeyword } from "@/lib/local-grid-studio/resolve-property-primary-local-keyword";

describe("resolveEffectiveGridKeyword", () => {
  it("returns explicit keyword when provided", () => {
    expect(resolveEffectiveGridKeyword("blinds near me", "Keyword,Rank\nignored,1")).toBe(
      "blinds near me",
    );
  });

  it("infers dominant keyword from exported grid CSV when keyword is auto", () => {
    const csv = [
      "Keyword,Rank,Latitude,Longitude",
      "roller shades,3,49.1,-97.5",
      "roller shades,5,49.2,-97.6",
      "window coverings,8,49.3,-97.7",
    ].join("\n");
    expect(resolveEffectiveGridKeyword("auto", csv)).toBe("roller shades");
  });

  it("falls back to business name for business listing CSV without Keyword column", () => {
    const csv = [
      "Business Name,Address,Average Rank,Latitude,Longitude,Place ID",
      '"Advance Blinds","303A Main Ave",3.46,49.1904838,-97.7626737,ChIJabc',
    ].join("\n");
    expect(resolveEffectiveGridKeyword("auto", csv, "Advance Blinds")).toBe("Advance Blinds");
  });

  it("uses property keyword mode when template keyword leaked for another business", () => {
    const stored = resolveWorkflowLocalDominatorGridKeyword(
      { keyword: "blinds near me", businessName: "KWB" },
      "blinds near me",
      "KWB",
    );
    expect(stored).toBe(LOCAL_DOMINATOR_GRID_KEYWORD_PROPERTY);
    expect(resolveLocalDominatorExportKeyword(stored)).toBe(LOCAL_DOMINATOR_GRID_KEYWORD_PROPERTY);
  });
});

describe("resolvePropertyPrimaryLocalKeyword", () => {
  const site = {
    id: "wp-1",
    name: "Test Client",
    siteUrl: "https://example.com",
    username: "u",
    appPassword: "p",
    connectedAt: 1,
    primaryLocalKeyword: "blinds near me",
  } satisfies WordPressSite;

  it("returns profile keyword for property mode", () => {
    expect(resolvePropertyPrimaryLocalKeyword(site, "property")).toBe("blinds near me");
  });

  it("throws when property mode and profile keyword missing", () => {
    expect(() =>
      resolvePropertyPrimaryLocalKeyword({ ...site, primaryLocalKeyword: undefined }, "property"),
    ).toThrow(/Primary keyword/);
  });
});
