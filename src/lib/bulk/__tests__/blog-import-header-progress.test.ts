import { describe, expect, it } from "vitest";
import {
  activeBlogImportPhaseIndex,
  blogImportHeaderProgressFromBulk,
  buildBlogImportMicroSnapshot,
} from "../blog-import-header-progress";

describe("activeBlogImportPhaseIndex", () => {
  it("matches pipeline phases by prefix", () => {
    expect(activeBlogImportPhaseIndex("Sending local file to OpenRouter...")).toBe(0);
    expect(activeBlogImportPhaseIndex("Running keyword research...")).toBe(1);
    expect(activeBlogImportPhaseIndex("Analyzing imported draft tone & voice...")).toBe(3);
    expect(activeBlogImportPhaseIndex("Generating blog content (harness: one section at a time)...")).toBe(6);
  });

  it("returns -1 for unknown phase", () => {
    expect(activeBlogImportPhaseIndex("")).toBe(-1);
    expect(activeBlogImportPhaseIndex("Waiting")).toBe(-1);
  });
});

describe("blogImportHeaderProgressFromBulk", () => {
  it("returns null when idle with no status", () => {
    expect(blogImportHeaderProgressFromBulk({ isProcessing: false, status: "" })).toBeNull();
  });

  it("maps harness progress when sections exist", () => {
    const progress = blogImportHeaderProgressFromBulk({
      isProcessing: true,
      status: "Generating blog content (harness: one section at a time)...",
      harnessSections: [
        { sectionIndex: 0, title: "A", status: "done" },
        { sectionIndex: 1, title: "B", status: "generating" },
      ],
      harnessPlannedSectionCount: 4,
    });
    expect(progress?.harnessActive).toBe(true);
    expect(progress?.completed).toBe(1);
    expect(progress?.total).toBe(4);
    expect(progress?.progressPct).toBe(25);
  });

  it("maps pre-harness pipeline status", () => {
    const progress = blogImportHeaderProgressFromBulk({
      isProcessing: true,
      status: "Generating checklist...",
      harnessSections: [],
    });
    expect(progress?.harnessActive).toBe(false);
    expect(activeBlogImportPhaseIndex(progress!.phase)).toBe(4);
  });

  it("prefers csv row counts when processing", () => {
    const progress = blogImportHeaderProgressFromBulk({
      isProcessing: true,
      status: "Generating blog content...",
      harnessSections: [{ sectionIndex: 0, title: "A", status: "generating" }],
      harnessPlannedSectionCount: 5,
      csvRowProgress: { done: 3, total: 10 },
    });
    expect(progress?.completed).toBe(3);
    expect(progress?.total).toBe(10);
    expect(progress?.progressPct).toBe(30);
    expect(progress?.harnessActive).toBe(false);
  });

  it("ignores csv row counts when idle", () => {
    expect(
      blogImportHeaderProgressFromBulk({
        isProcessing: false,
        status: "",
        csvRowProgress: { done: 0, total: 10 },
      }),
    ).toBeNull();
  });
});

describe("buildBlogImportMicroSnapshot", () => {
  it("builds snapshot with status message", () => {
    const snap = buildBlogImportMicroSnapshot({
      phase: "Running keyword research...",
      completed: 0,
      total: 1,
      harnessActive: false,
    });
    expect(snap?.label).toBe("Blog import");
    expect(snap?.statusMessage).toBe("Running keyword research...");
  });

  it("returns null without phase", () => {
    expect(buildBlogImportMicroSnapshot(null)).toBeNull();
  });

  it("uses progressPct for prompt checklist-style harness (total 1)", () => {
    const snap = buildBlogImportMicroSnapshot(
      {
        phase: "Generating blog ideas…",
        completed: 0,
        total: 1,
        progressPct: 25,
        harnessActive: false,
      },
      "Prompt",
    );
    expect(snap?.completed).toBe(0);
    expect(snap?.total).toBe(1);
    expect(snap?.progressPct).toBe(25);
  });
});
