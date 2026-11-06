import { describe, expect, it } from "vitest";
import {
  applyCompetitorHarnessStep,
  buildCompetitorHarnessGroups,
  buildCompetitorMicroSnapshot,
  countCompetitorHarnessSteps,
  setCompetitorHarnessDomain,
  setCompetitorHarnessTitle,
} from "@/lib/competitor-research/competitor-comparison-harness-state";

describe("competitor-comparison-harness-state", () => {
  it("builds groups with four steps per competitor", () => {
    const groups = buildCompetitorHarnessGroups(["Alpha Blinds", "Beta Shades"]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.steps).toHaveLength(4);
    expect(groups[0]?.competitorName).toBe("Alpha Blinds");
    expect(groups[0]?.steps[0]?.id).toBe("ScanSitemap");
  });

  it("updates step status and counts progress", () => {
    let groups = buildCompetitorHarnessGroups(["Alpha Blinds"]);
    const key = groups[0]!.competitorKey;
    groups = applyCompetitorHarnessStep(groups, key, "ScanSitemap", {
      status: "done",
      detail: "Alpha Blinds blinds near me · 3 hit(s)",
    });
    groups = setCompetitorHarnessDomain(groups, key, null);
    groups = applyCompetitorHarnessStep(groups, key, "WriteCsvRow", {
      status: "done",
      detail: "Title here",
    });
    groups = setCompetitorHarnessTitle(groups, key, "Title here");

    expect(groups[0]?.domain).toBeNull();
    expect(groups[0]?.generatedTitle).toBe("Title here");
    const { done, total } = countCompetitorHarnessSteps(groups);
    expect(total).toBe(4);
    expect(done).toBe(2);
  });

  it("buildCompetitorMicroSnapshot exposes progressPct from 0 at start", () => {
    const groups = buildCompetitorHarnessGroups(["Alpha Blinds"]);
    const snap = buildCompetitorMicroSnapshot({
      phase: "Google SERP query for Alpha Blinds…",
      harnessGroups: groups,
    });
    expect(snap?.progressPct).toBe(0);
    expect(snap?.completed).toBe(0);
    expect(snap?.total).toBe(4);
  });
});
