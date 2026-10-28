import { describe, expect, it } from "vitest";
import { mergeAutomationRecipeCatalog } from "@/lib/automation-recipes-catalog";
import type { AutomationRecipeCatalogItem } from "@/lib/automation-recipes-types";

describe("automation-recipes-catalog", () => {
  it("includes bundled entity page creator recipes under local-seo", () => {
    const fromApi: AutomationRecipeCatalogItem[] = [
      {
        keyword: "entity-sap-guardian",
        name: "Entity SAP Guardian",
        description: "Legacy API entry",
        isAutomation: true,
        category: "local-seo",
        verticals: ["local-seo"],
        tags: [],
        prerequisites: ["gsc"],
        filters: { executionKinds: ["content_optimizer"], targetBuckets: ["sap"] },
      },
    ];

    const merged = mergeAutomationRecipeCatalog(fromApi);
    const keywords = merged.map((recipe) => recipe.keyword);

    expect(keywords).toContain("ads-monthly-mom-report");
    expect(keywords).toContain("ads-monthly-yoy-report");
    expect(keywords).toContain("entity-page-creator-monthly");
    expect(keywords).toContain("grid-to-entity-to-sap-monthly");
    expect(keywords).toContain("missing-template-aiseo");
    const missingTemplate = merged.find((recipe) => recipe.keyword === "missing-template-aiseo");
    expect(missingTemplate?.filters.targetBuckets).toEqual(["posts"]);
    expect(missingTemplate?.filters.executionKinds).toEqual(["csv_rows", "content_optimizer"]);
    expect(missingTemplate?.filters.actionCount).toBe(2);
    expect((missingTemplate?.actionBlocks ?? []).map((block) => block.keyword)).toEqual(
      expect.arrayContaining(["csv-rows", "content-optimizer-full"]),
    );
    expect((missingTemplate?.actionBlocks ?? []).map((block) => block.title)).toEqual(
      expect.arrayContaining(["Page audit", "Full AISEO"]),
    );
    const csvBlock = (missingTemplate?.actionBlocks ?? []).find((block) => block.executionKind === "csv_rows");
    expect(csvBlock?.executionPayload?.csvInputSource).toBe("site");
    expect(csvBlock?.executionPayload?.targetBucket).toBe("posts");
    expect(csvBlock?.executionPayload?.csvHeaders).toEqual(["url", "H2"]);
    expect(csvBlock?.executionPayload?.csvColumnMap).toEqual({ url: "url", research: "H2" });
    expect(csvBlock?.executionPayload?.optionalPrompt).toBeUndefined();
    expect(csvBlock?.executionPayload?.auditOnly).toBeUndefined();
    const optimizeBlock = (missingTemplate?.actionBlocks ?? []).find((block) => block.title === "Full AISEO");
    expect(optimizeBlock?.executionPayload?.optionalPrompt).toContain("do not fit");
    expect(optimizeBlock?.executionPayload?.auditOnly).toBeUndefined();
    expect(optimizeBlock?.executionPayload?.targetBucket).toBe("posts");
    expect(optimizeBlock?.executionPayload?.optimizationOptions?.forceNewResearch).toBe(true);
    expect(missingTemplate?.notes?.join(" ")).not.toMatch(/Manual/i);
    expect(missingTemplate?.notes?.[0]).toContain("automatically");

    const localSeo = merged.filter((recipe) => recipe.category === "local-seo");
    expect(localSeo.some((recipe) => recipe.keyword === "entity-page-creator-monthly")).toBe(true);
    expect(localSeo.some((recipe) => recipe.keyword === "grid-to-entity-to-sap-monthly")).toBe(true);
  });
});
