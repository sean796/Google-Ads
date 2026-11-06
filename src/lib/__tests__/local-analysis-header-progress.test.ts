import { describe, expect, it } from "vitest";
import {
  activePhaseIndex,
  buildLocalAnalysisMicroSnapshot,
  localAnalysisProgressBusy,
} from "@/lib/local-analysis/header-progress";

describe("buildLocalAnalysisMicroSnapshot", () => {
  it("returns null when progress is idle or missing phase", () => {
    expect(buildLocalAnalysisMicroSnapshot(null)).toBeNull();
    expect(buildLocalAnalysisMicroSnapshot(undefined)).toBeNull();
    expect(buildLocalAnalysisMicroSnapshot({ kind: "suggest", phase: "", completed: 0, total: 0 })).toBeNull();
  });

  it("maps suggest wiki phase with counters", () => {
    const snap = buildLocalAnalysisMicroSnapshot({
      kind: "suggest",
      phase: "Grepping Wiki for locations",
      completed: 2,
      total: 5,
    });
    expect(snap).toMatchObject({
      label: "Clusters",
      completed: 2,
      total: 5,
      statusMessage: "Grepping Wiki for locations",
    });
  });

  it("maps generate SAP phase with harness percent", () => {
    const snap = buildLocalAnalysisMicroSnapshot({
      kind: "generate",
      phase: "Generating SAP rows…",
      completed: 3,
      total: 10,
      progressPct: 42,
    });
    expect(snap).toMatchObject({
      label: "Generate SAP rows",
      completed: 3,
      total: 10,
      progressPct: 42,
      statusMessage: "Generating SAP rows…",
    });
  });
});

describe("localAnalysisProgressBusy", () => {
  it("is true when phase is set", () => {
    expect(localAnalysisProgressBusy({ kind: "csv", phase: "Parsing…", completed: 0, total: 0 })).toBe(true);
    expect(localAnalysisProgressBusy(null)).toBe(false);
  });
});

describe("activePhaseIndex", () => {
  it("finds matching step prefix", () => {
    expect(
      activePhaseIndex(
        ["Reading master rules", "Building cluster entities"],
        "Building cluster entities from inventory",
      ),
    ).toBe(1);
  });
});
