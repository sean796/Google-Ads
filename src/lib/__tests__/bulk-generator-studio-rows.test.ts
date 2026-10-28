import { describe, expect, it } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import { BULK_GENERATOR_EMPTY_ROW_COUNT } from "@/components/keyword-research/blog-generator-tab-classes";
import {
  buildBulkGeneratorStudioList,
  bulkGeneratorRowPathPreview,
  normalizeBulkGeneratorSiteBaseUrl,
  resolveBulkGeneratorStudioTargetCount,
  resolveBulkSapPublicPath,
} from "@/lib/bulk/bulk-generator-studio-rows";

const blindmagicLikeSite = {
  siteUrl: "https://blindmagic.com",
  entitySitemapUrl: "https://blindmagic.com/service-area-sitemap.xml",
} as Pick<WordPressSite, "siteUrl" | "entitySitemapUrl">;

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

  it("bulkGeneratorRowPathPreview prefers target_slug over stale destination_url", () => {
    const preview = bulkGeneratorRowPathPreview(
      {
        keyword: "custom blinds 2026 alberta electoral redistribution",
        title: "Custom Blinds Near Sherwood Park, AB",
        target_slug: "custom-blinds-sherwood-park-ab",
        destination_url: "https://example.com/blog/custom-blinds-2026-alberta-electoral-redistribution-sherwood/",
      },
      "https://example.com",
    );
    expect(preview.pathLabel).toBe("/blog/custom-blinds-sherwood-park-ab/");
    expect(preview.fullUrlPreview).toContain("custom-blinds-sherwood-park-ab");
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

  it("bulkGeneratorRowPathPreview uses root SAP slug when row has entity", () => {
    const preview = bulkGeneratorRowPathPreview(
      {
        keyword: "custom blinds",
        title: "Custom Blinds Near Beltline, Calgary",
        entity: "Beltline, Calgary, AB",
      },
      "https://blindmagic.com",
    );
    expect(preview.pathLabel).not.toContain("/blog/");
    expect(preview.pathLabel).toMatch(/beltline|calgary|custom-blinds/i);
    expect(preview.fullUrlPreview).toBe(`https://blindmagic.com${preview.pathLabel}`);
  });

  it("bulkGeneratorRowPathPreview prepends service-area collection when dock is SAP", () => {
    const preview = bulkGeneratorRowPathPreview(
      {
        keyword: "custom blinds",
        title: "Custom Blinds",
        entity: "Beltline, Calgary, AB",
        target_slug: "custom-blinds-beltline-calgary",
      },
      "https://blindmagic.com",
      { sitemapSource: "sap", site: blindmagicLikeSite },
    );
    expect(preview.pathLabel).toBe("/service-area/custom-blinds-beltline-calgary/");
    expect(preview.fullUrlPreview).toBe(
      "https://blindmagic.com/service-area/custom-blinds-beltline-calgary/",
    );
  });

  it("bulkGeneratorRowPathPreview strips /blog/ then adds service-area when dock is SAP", () => {
    const preview = bulkGeneratorRowPathPreview(
      {
        keyword: "kw",
        title: "T",
        destination_url: "https://blindmagic.com/blog/my-post/",
      },
      "https://blindmagic.com",
      { sitemapSource: "sap", site: blindmagicLikeSite },
    );
    expect(preview.pathLabel).toBe("/service-area/my-post/");
    expect(preview.fullUrlPreview).toBe("https://blindmagic.com/service-area/my-post/");
  });

  it("resolveBulkSapPublicPath prefers warm inventory URL", () => {
    const resolved = resolveBulkSapPublicPath({
      site: blindmagicLikeSite,
      slugSegment: "blinds-hunter-douglas-blinds-mill",
      siteBaseUrl: "https://blindmagic.com",
      sapInventoryRows: [
        {
          slug: "blinds-hunter-douglas-blinds-mill",
          url: "https://blindmagic.com/service-area/blinds-hunter-douglas-blinds-mill/",
        },
      ],
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.pathLabel).toBe("/service-area/blinds-hunter-douglas-blinds-mill/");
      expect(resolved.fullUrlPreview).toBe(
        "https://blindmagic.com/service-area/blinds-hunter-douglas-blinds-mill/",
      );
    }
  });

  it("bulkGeneratorRowPathPreview prefixes /blog/ when dock is Posts", () => {
    const preview = bulkGeneratorRowPathPreview(
      {
        keyword: "custom blinds",
        title: "Custom Blinds Near Beltline, Calgary",
        entity: "Beltline, Calgary, AB",
        target_slug: "custom-blinds-beltline-calgary",
      },
      "https://blindmagic.com",
      { sitemapSource: "posts" },
    );
    expect(preview.pathLabel).toBe("/blog/custom-blinds-beltline-calgary/");
    expect(preview.fullUrlPreview).toBe(
      "https://blindmagic.com/blog/custom-blinds-beltline-calgary/",
    );
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
