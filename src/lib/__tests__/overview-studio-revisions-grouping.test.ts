import { describe, expect, it } from "vitest";
import {
  groupOverviewStudioRevisionsIntoRuns,
  sortRevisionsChronological,
} from "@/lib/overview/studio-doc-revisions-grouping";
import type { OverviewStudioRevision } from "@/lib/overview/studio-doc-revisions-store";

function rev(partial: Partial<OverviewStudioRevision> & Pick<OverviewStudioRevision, "id" | "at">): OverviewStudioRevision {
  return {
    urlKey: "https://example.com/page/",
    stepLabel: "Section",
    beforeHtml: "",
    afterHtml: "",
    beforePlain: "before",
    afterPlain: "after",
    changed: true,
    ...partial,
  };
}

describe("groupOverviewStudioRevisionsIntoRuns", () => {
  it("groups by runId and sorts runs newest first", () => {
    const list = [
      rev({ id: "a", at: 100, runId: "1" }),
      rev({ id: "b", at: 200, runId: "2" }),
      rev({ id: "c", at: 150, runId: "2" }),
    ];
    const runs = groupOverviewStudioRevisionsIntoRuns(list);
    expect(runs).toHaveLength(2);
    expect(runs[0]!.runId).toBe("2");
    expect(runs[0]!.revisions.map((r) => r.id)).toEqual(["b", "c"]);
    expect(runs[1]!.runId).toBe("1");
  });

  it("sortRevisionsChronological orders oldest first", () => {
    const list = [rev({ id: "b", at: 200 }), rev({ id: "a", at: 100 })];
    expect(sortRevisionsChronological(list).map((r) => r.id)).toEqual(["a", "b"]);
  });
});
