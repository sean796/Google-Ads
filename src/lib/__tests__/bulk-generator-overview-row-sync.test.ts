import { describe, expect, it } from "vitest";
import {
  buildBulkGeneratorOverviewRows,
  bulkCsvRowPatchForSitemapSource,
} from "@/lib/bulk/bulk-generator-overview-row-bridge";
import type { BulkHarnessSectionUi } from "@/hooks/use-bulk-auto-generate";

describe("buildBulkGeneratorOverviewRows", () => {
  it("maps prompt idea count to placeholder sidebar rows before checklist", () => {
    const rows = buildBulkGeneratorOverviewRows({
      variant: "prompt",
      displayRows: [],
      numberOfBlogs: 3,
      hasGeneratedChecklist: false,
      filesByRow: new Map(),
      harnessByRow: new Map(),
      currentRow: 0,
      isProcessing: false,
      failedRowIndices: new Set(),
      siteBaseUrl: "https://example.com",
    });
    expect(rows).toHaveLength(3);
    expect(rows[0]?.title).toBe("Blog slot 1");
    expect(rows[1]?.url).not.toBe(rows[2]?.url);
  });

  it("maps prompt ideas after checklist into overview rows", () => {
    const rows = buildBulkGeneratorOverviewRows({
      variant: "prompt",
      displayRows: [
        { keyword: "skylight blinds", title: "Skylight Blinds Guide" },
        { keyword: "motorized shades", title: "Motorized Shades" },
      ],
      numberOfBlogs: 3,
      hasGeneratedChecklist: true,
      filesByRow: new Map(),
      harnessByRow: new Map(),
      currentRow: 0,
      isProcessing: false,
      failedRowIndices: new Set(),
      siteBaseUrl: "https://example.com",
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.title).toBe("Skylight Blinds Guide");
  });

  it("returns zero rows for empty CSV variant", () => {
    const rows = buildBulkGeneratorOverviewRows({
      variant: "csv",
      displayRows: [],
      numberOfBlogs: 1,
      hasGeneratedChecklist: false,
      filesByRow: new Map(),
      harnessByRow: new Map(),
      currentRow: 0,
      isProcessing: false,
      failedRowIndices: new Set(),
      siteBaseUrl: null,
    });
    expect(rows).toHaveLength(0);
  });

  it("prefers content html artifact over markdown for studio body", () => {
    const rows = buildBulkGeneratorOverviewRows({
      variant: "prompt",
      displayRows: [{ keyword: "solarium blinds", title: "Solarium Blinds Guide" }],
      numberOfBlogs: 1,
      hasGeneratedChecklist: true,
      filesByRow: new Map([
        [
          0,
          [
            {
              id: "1",
              rowIndex: 0,
              fileName: "content-solarium.md",
              content: "• Raw markdown [[LINK:kw|anchor]]",
              mimeType: "text/markdown",
              status: "completed",
              timestamp: 1,
            },
            {
              id: "2",
              rowIndex: 0,
              fileName: "content-solarium.html",
              content: "<h2 id=\"intro\">Intro</h2><p>Rendered copy.</p>",
              mimeType: "text/html",
              status: "completed",
              timestamp: 2,
            },
          ],
        ],
      ]),
      harnessByRow: new Map(),
      currentRow: 0,
      isProcessing: false,
      failedRowIndices: new Set(),
      siteBaseUrl: "https://example.com",
    });
    expect(rows[0]?.postContent).toContain("<h2");
    expect(rows[0]?.postContent).toContain("Rendered copy.");
    expect(rows[0]?.postContent).not.toContain("[[LINK:");
  });

  it("stitches HTML harness sections without markdown conversion", () => {
    const harness: BulkHarnessSectionUi[] = [
      {
        sectionIndex: 0,
        title: "Answer",
        status: "done",
        markdown: '<h2 id="answer">Answer</h2><p>First.</p>',
      },
      {
        sectionIndex: 1,
        title: "Overview",
        status: "done",
        markdown: '<h2 id="overview">Overview</h2><p>Second.</p>',
      },
    ];
    const rows = buildBulkGeneratorOverviewRows({
      variant: "prompt",
      displayRows: [{ keyword: "kw", title: "Title" }],
      numberOfBlogs: 1,
      hasGeneratedChecklist: true,
      filesByRow: new Map(),
      harnessByRow: new Map([[0, harness]]),
      currentRow: 0,
      isProcessing: false,
      failedRowIndices: new Set(),
      siteBaseUrl: "https://example.com",
    });
    expect(rows[0]?.postContent).toContain('<h2 id="answer">');
    expect(rows[0]?.postContent).not.toContain("## ");
  });

  it("maps harness markdown to postContent HTML", () => {
    const harness: BulkHarnessSectionUi[] = [
      {
        sectionIndex: 0,
        title: "Intro",
        status: "done",
        markdown: "## Intro\n\nHello world.",
      },
    ];
    const rows = buildBulkGeneratorOverviewRows({
      variant: "csv",
      displayRows: [{ keyword: "test kw", title: "Test Title" }],
      numberOfBlogs: 1,
      hasGeneratedChecklist: true,
      filesByRow: new Map(),
      harnessByRow: new Map([[0, harness]]),
      currentRow: 0,
      isProcessing: false,
      failedRowIndices: new Set(),
      siteBaseUrl: "https://example.com",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.postContent).toContain("Hello world");
    expect(rows[0]?.title).toBe("Test Title");
    expect(rows[0]?.focusKeyword).toBe("test kw");
  });

  it("bulkCsvRowPatchForSitemapSource rewrites blog destination to entity SAP path", () => {
    const patch = bulkCsvRowPatchForSitemapSource(
      {
        keyword: "custom blinds",
        title: "Custom Blinds",
        destination_url: "https://blindmagic.com/blog/custom-blinds-beltline-calgary/",
        entity: "Beltline, Calgary, AB",
        target_slug: "custom-blinds-beltline-calgary",
      },
      "https://blindmagic.com",
      "sap",
      {
        site: {
          siteUrl: "https://blindmagic.com",
          entitySitemapUrl: "https://blindmagic.com/service-area-sitemap.xml",
        },
      },
    );
    expect(patch.sitemap_type).toBe("entity");
    expect(patch.destination_url).toBe(
      "https://blindmagic.com/service-area/custom-blinds-beltline-calgary/",
    );
  });
});
