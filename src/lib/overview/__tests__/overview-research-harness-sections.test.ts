import { describe, expect, it } from "vitest";
import {
  collapseResearchHarnessToBrief,
  researchBriefGeneratedFile,
  RESEARCH_BRIEF_PIPELINE_TITLE,
} from "@/lib/overview/overview-research-harness-sections";

describe("researchBriefGeneratedFile", () => {
  it("returns one json brief and nothing when empty", () => {
    expect(researchBriefGeneratedFile("Solar Panel Efficiency", "")).toEqual([]);
    const files = researchBriefGeneratedFile(
      "Solar Panel Efficiency: What It Means",
      '{"version":1}',
    );
    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe("serp-research-brief-Solar_Panel_Efficiency_What_It_Means.json");
    expect(files[0]?.mimeType).toContain("json");
  });
});

describe("collapseResearchHarnessToBrief", () => {
  it("collapses seven research steps into one brief row", () => {
    const collapsed = collapseResearchHarnessToBrief([
      { sectionIndex: 0, title: "DataForSEO SERP", status: "done" },
      { sectionIndex: 1, title: "GSC CSV", status: "done" },
      { sectionIndex: 2, title: "LLM audit", status: "generating" },
    ]);
    expect(collapsed).toEqual([
      {
        sectionIndex: 0,
        title: RESEARCH_BRIEF_PIPELINE_TITLE,
        status: "generating",
      },
    ]);
  });

  it("marks the brief done when every step is done", () => {
    const collapsed = collapseResearchHarnessToBrief([
      { sectionIndex: 0, title: "DataForSEO SERP", status: "done" },
      { sectionIndex: 1, title: "GSC CSV", status: "done" },
    ]);
    expect(collapsed[0]?.status).toBe("done");
    expect(collapsed[0]?.markdown).toBeUndefined();
  });
});
