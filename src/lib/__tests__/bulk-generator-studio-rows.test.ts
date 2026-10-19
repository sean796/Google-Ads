import { describe, expect, it } from "vitest";
import { BULK_GENERATOR_EMPTY_ROW_COUNT } from "@/components/keyword-research/blog-generator-tab-classes";
import {
  buildBulkGeneratorStudioList,
  bulkGeneratorRowPathPreview,
  normalizeBulkGeneratorSiteBaseUrl,
  resolveBulkGeneratorStudioTargetCount,
} from "@/lib/bulk/bulk-generator-studio-rows";

describe("bulk-generator-studio-rows", () => {
  it("normalizeBulkGeneratorSiteBaseUrl strips trailing slash", () => {
    expect(normalizeBulkGeneratorSiteBaseUrl("https://example.com/")).toBe("https://example.com");
  });

  it("bulkGeneratorRowPathPreview uses destination_url when set", () => {
    const preview = bulkGeneratorRowPathPreview(
      {
        keyword: "kw",
        title: "T",
        destination_url: "https://example.com/blog/my-post/",
      },
      "https://example.com",
    );
    expect(preview.pathLabel).toBe("/blog/my-post/");
    expect(preview.fullUrlPreview).toBe("https://example.com/blog/my-post/");
  });

  it("resolveBulkGeneratorStudioTargetCount matches idea picker before checklist", () => {
    expect(
      resolveBulkGeneratorStudioTargetCount({
        variant: "prompt",
        sourceRowCount: 0,
        numberOfBlogs: 5,
        minEmptySlotCount: BULK_GENERATOR_EMPTY_ROW_COUNT,
        hasGeneratedChecklist: false,
      }),
    ).toBe(5);
  });

  it("buildBulkGeneratorStudioList shows prompt placeholder slots from numberOfBlogs", () => {
    const list = buildBulkGeneratorStudioList({
      variant: "prompt",
      sourceRows: [],
      numberOfBlogs: 4,
      minEmptySlotCount: 18,
      hasGeneratedChecklist: false,
      filesByRow: new Map(),
      currentRow: 0,
      isProcessing: false,
      failedRowIndices: new Set(),
      siteBaseUrl: "https://example.com",
    });
    expect(list).toHaveLength(4);
    expect(list[0]?.title).toBe("Blog slot 1");
    expect(list[3]?.pathLabel).toContain("__prompt-slot-3");
    expect(list[0]?.placeholder).toBe(true);
  });

  it("buildBulkGeneratorStudioList returns no rows for empty csv", () => {
    const list = buildBulkGeneratorStudioList({
      variant: "csv",
      sourceRows: [],
      numberOfBlogs: 3,
      minEmptySlotCount: 18,
      hasGeneratedChecklist: false,
      filesByRow: new Map(),
      currentRow: 0,
      isProcessing: false,
      failedRowIndices: new Set(),
      siteBaseUrl: "https://example.com",
    });
    expect(list).toHaveLength(0);
  });

  it("buildBulkGeneratorStudioList maps real csv rows", () => {
    const list = buildBulkGeneratorStudioList({
      variant: "csv",
      sourceRows: [{ keyword: "motorized blinds", title: "Motorized Blinds Guide", target_slug: "motorized-blinds" }],
      numberOfBlogs: 3,
      minEmptySlotCount: 18,
      hasGeneratedChecklist: false,
      filesByRow: new Map(),
      currentRow: 0,
      isProcessing: false,
      failedRowIndices: new Set(),
      siteBaseUrl: "https://example.com",
    });
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe("Motorized Blinds Guide");
    expect(list[0]?.pathLabel).toContain("motorized-blinds");
  });
});
