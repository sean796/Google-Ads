import { describe, expect, it } from "vitest";
import {
  buildContentOptimizePipelineTitles,
  buildPredeterminedBlogBodyHarnessTitles,
  CONTENT_OPTIMIZE_PIPELINE_TITLES,
  extractBodyHarnessTitlesFromSections,
  isContentOptimizePipelineTitles,
  resolveContentOptimizePipelineTitlesForRow,
  resolveContentOptimizePipelineTitlesFromHarness,
} from "@/lib/overview/overview-content-optimize-pipeline";

describe("overview-content-optimize-pipeline", () => {
  it("uses seven fixed blog-optimization slots including Implementation report without research steps", () => {
    expect(buildContentOptimizePipelineTitles()).toEqual([...CONTENT_OPTIMIZE_PIPELINE_TITLES]);
    expect(CONTENT_OPTIMIZE_PIPELINE_TITLES).toHaveLength(7);
    expect(isContentOptimizePipelineTitles([...CONTENT_OPTIMIZE_PIPELINE_TITLES])).toBe(true);
    expect(CONTENT_OPTIMIZE_PIPELINE_TITLES).not.toContain("Keyword research");
    expect(CONTENT_OPTIMIZE_PIPELINE_TITLES).not.toContain("Selected keyword");
    expect(CONTENT_OPTIMIZE_PIPELINE_TITLES).not.toContain("SERP research brief");
    expect(CONTENT_OPTIMIZE_PIPELINE_TITLES).toContain("Checklist");
    expect(CONTENT_OPTIMIZE_PIPELINE_TITLES).toContain("Blueprint");
    expect(CONTENT_OPTIMIZE_PIPELINE_TITLES).toContain("Link targets");
    expect(CONTENT_OPTIMIZE_PIPELINE_TITLES).toContain("Implementation report");
    expect(CONTENT_OPTIMIZE_PIPELINE_TITLES[CONTENT_OPTIMIZE_PIPELINE_TITLES.length - 1]).toBe(
      "WordPress upload",
    );
  });

  it("inserts dynamic body harness titles between link targets and content files", () => {
    const titles = buildContentOptimizePipelineTitles(["Overview", "Answer", "Motorization Compared"]);
    expect(titles[0]).toBe("Checklist");
    expect(titles[1]).toBe("Blueprint");
    expect(titles[2]).toBe("Link targets");
    expect(titles.slice(3, 6)).toEqual(["Overview", "Answer", "Motorization Compared"]);
    expect(titles[titles.length - 4]).toBe("Post content");
    expect(titles[titles.length - 3]).toBe("Content Markdown");
    expect(titles[titles.length - 2]).toBe("Implementation report");
    expect(titles[titles.length - 1]).toBe("WordPress upload");
    expect(isContentOptimizePipelineTitles(titles)).toBe(true);
  });

  it("extracts body titles between Link targets and Post content", () => {
    const sections = [
      { title: "Checklist" },
      { title: "Blueprint" },
      { title: "Link targets" },
      { title: "Answer" },
      { title: "Overview" },
      { title: "Motorization Compared" },
      { title: "Post content" },
      { title: "Content Markdown" },
      { title: "Implementation report" },
      { title: "WordPress upload" },
    ];
    expect(extractBodyHarnessTitlesFromSections(sections)).toEqual([
      "Answer",
      "Overview",
      "Motorization Compared",
    ]);
    expect(resolveContentOptimizePipelineTitlesFromHarness(sections)).toEqual([
      "Checklist",
      "Blueprint",
      "Link targets",
      "Answer",
      "Overview",
      "Motorization Compared",
      "Post content",
      "Content Markdown",
      "Implementation report",
      "WordPress upload",
    ]);
  });

  it("expands pipeline titles from blueprint row files", () => {
    const harness = [
      { title: "Checklist" },
      { title: "Blueprint" },
      { title: "Post content" },
      { title: "Content Markdown" },
    ];
    const rowFiles = [
      {
        name: "blueprint-smart-blinds.json",
        content: JSON.stringify({
          agents: [{ title: "Answer" }, { title: "Overview" }, { title: "Motorization Compared" }],
        }),
      },
    ];
    expect(resolveContentOptimizePipelineTitlesForRow(harness, rowFiles, "Smart Blinds")).toEqual([
      "Checklist",
      "Blueprint",
      "Link targets",
      "Answer",
      "Overview",
      "Motorization Compared",
      "Post content",
      "Content Markdown",
      "Implementation report",
      "WordPress upload",
    ]);
  });

  it("does not invent generic body titles when harness only has fixed optimize slots", () => {
    const harness = [...CONTENT_OPTIMIZE_PIPELINE_TITLES].map((title) => ({ title }));
    const titles = resolveContentOptimizePipelineTitlesForRow(harness, [], "Smart Blinds Automation");
    expect(titles).toEqual([...CONTENT_OPTIMIZE_PIPELINE_TITLES]);
    expect(titles).not.toContain("Section 1");
    expect(titles).not.toContain("How Smart Blinds Automation works");
  });

  it("does not pin SAP titles when entity is set", () => {
    const titles = buildPredeterminedBlogBodyHarnessTitles("", undefined, { entity: "112 Avenue, Edmonton" });
    expect(titles).toEqual([]);
    expect(titles).not.toContain("What We Offer");
    expect(titles).not.toContain("Next Steps");
    expect(titles).not.toContain("Sunlight And Privacy Challenges");
    expect(titles).not.toContain("Our Recommendation for Homeowners in 112 Avenue, Edmonton");
  });
});
