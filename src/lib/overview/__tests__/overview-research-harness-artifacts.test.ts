import { describe, expect, it } from "vitest";
import { RESEARCH_NO_GSC_DATA } from "@/lib/overview/overview-research-row";
import {
  appendResearchGeneratedFile,
  researchStepArtifactFile,
  RESEARCH_HARNESS_PIPELINE_TITLES,
  RESEARCH_HARNESS_SECTION_TITLES,
} from "@/lib/overview/overview-research-harness-sections";

describe("RESEARCH_HARNESS_PIPELINE_TITLES", () => {
  it("matches the 7 harness section titles", () => {
    expect(RESEARCH_HARNESS_PIPELINE_TITLES).toEqual(RESEARCH_HARNESS_SECTION_TITLES);
    expect(RESEARCH_HARNESS_PIPELINE_TITLES).toHaveLength(7);
  });
});

describe("researchStepArtifactFile", () => {
  it("returns null for steps that emit JSON via onResearchArtifact", () => {
    expect(researchStepArtifactFile("GSC CSV", RESEARCH_NO_GSC_DATA, "solar panels")).toBeNull();
    expect(researchStepArtifactFile("LLM audit", "LLM audit: 1/1 ok", "kw")).toBeNull();
  });

  it("returns null for brief merge (combined brief is added separately)", () => {
    expect(researchStepArtifactFile("Brief merge", "Brief merged", "kw")).toBeNull();
  });

  it("returns null for brief upload (server brief JSON is added via onResearchArtifact)", () => {
    expect(researchStepArtifactFile("Brief upload", "Brief saved: brief-abc.json", "kw")).toBeNull();
  });
});

describe("appendResearchGeneratedFile", () => {
  it("replaces files with the same name", () => {
    const first = { name: "a.json", content: "1", mimeType: "application/json" };
    const second = { name: "a.json", content: "2", mimeType: "application/json" };
    const merged = appendResearchGeneratedFile([first], second);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.content).toBe("2");
  });
});
