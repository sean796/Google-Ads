import { describe, expect, it } from "vitest";
import {
  buildPressReleaseMicroSnapshot,
  pressReleaseHeaderProgressFromState,
  PRESS_RELEASE_LABEL,
} from "../press-release-header-progress";

describe("pressReleaseHeaderProgressFromState", () => {
  it("returns null when idle", () => {
    expect(
      pressReleaseHeaderProgressFromState({
        isProcessing: false,
        harnessSections: [],
        harnessPlannedSectionCount: null,
      }),
    ).toBeNull();
  });

  it("maps pre-harness run phase", () => {
    const progress = pressReleaseHeaderProgressFromState({
      isProcessing: true,
      runPhase: "Fetching WordPress post inventory…",
      harnessSections: [],
      harnessPlannedSectionCount: null,
    });
    expect(progress?.phase).toBe("Fetching WordPress post inventory…");
    expect(progress?.harnessActive).toBe(false);
  });

  it("maps harness sections", () => {
    const progress = pressReleaseHeaderProgressFromState({
      isProcessing: true,
      runPhase: "Generating press release",
      harnessSections: [
        { sectionIndex: 0, title: "Lead", status: "done" },
        { sectionIndex: 1, title: "Body", status: "generating" },
      ],
      harnessPlannedSectionCount: 4,
    });
    expect(progress?.completed).toBe(1);
    expect(progress?.total).toBe(4);
    expect(progress?.harnessActive).toBe(true);
  });
});

describe("buildPressReleaseMicroSnapshot", () => {
  it("uses Press release label", () => {
    const snap = buildPressReleaseMicroSnapshot({
      phase: "Fetching SERP…",
      completed: 0,
      total: 1,
      progressPct: 5,
      harnessActive: false,
    });
    expect(snap?.label).toBe(PRESS_RELEASE_LABEL);
    expect(snap?.statusMessage).toBe("Fetching SERP…");
  });
});
