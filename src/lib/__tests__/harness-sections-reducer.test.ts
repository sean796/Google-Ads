import { describe, expect, it } from "vitest";
import { reduceHarnessSectionList } from "@/lib/bulk/harness-sections-reducer";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";

function startPayload(i: number, title: string, total = 3): BulkHarnessSectionPayload {
  return {
    rowIndex: 0,
    sectionIndex: i,
    totalSections: total,
    title,
    phase: "start",
  };
}

function donePayload(i: number, title: string, total = 3): BulkHarnessSectionPayload {
  return {
    rowIndex: 0,
    sectionIndex: i,
    totalSections: total,
    title,
    phase: "done",
    markdownSlice: `<p>${title}</p>`,
    truncated: false,
  };
}

describe("reduceHarnessSectionList", () => {
  it("keeps multiple sections in generating when starts overlap (parallel harness)", () => {
    let state = reduceHarnessSectionList([], startPayload(0, "A"));
    state = reduceHarnessSectionList(state, startPayload(1, "B"));
    expect(state[0]?.status).toBe("generating");
    expect(state[1]?.status).toBe("generating");
  });

  it("marks done only for the section that finished", () => {
    let state = reduceHarnessSectionList([], startPayload(0, "A"));
    state = reduceHarnessSectionList(state, startPayload(1, "B"));
    state = reduceHarnessSectionList(state, donePayload(0, "A"));
    expect(state[0]?.status).toBe("done");
    expect(state[1]?.status).toBe("generating");
  });

  it("fills sparse indices when later sections complete first", () => {
    let state = reduceHarnessSectionList([], startPayload(1, "B", 2));
    state = reduceHarnessSectionList(state, donePayload(1, "B", 2));
    expect(state[1]?.status).toBe("done");
    expect(state.length).toBeGreaterThanOrEqual(2);
  });

  it("progress keeps generating and clears markdown", () => {
    let state = reduceHarnessSectionList([], startPayload(2, "Generate", 4));
    state = reduceHarnessSectionList(state, {
      rowIndex: 0,
      sectionIndex: 2,
      totalSections: 4,
      title: "Generate",
      phase: "progress",
      markdownSlice: "Looking for image on city peers",
    });
    expect(state[2]?.status).toBe("generating");
    expect(state[2]?.markdown).toBeUndefined();
    state = reduceHarnessSectionList(state, {
      rowIndex: 0,
      sectionIndex: 2,
      totalSections: 4,
      title: "Generate",
      phase: "progress",
      markdownSlice: "Looking for image on city peers\nFound on Heritage",
    });
    expect(state[2]?.status).toBe("generating");
    expect(state[2]?.markdown).toBeUndefined();
  });
});
