import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { enrichCsvRowsFromSheet } from "@/lib/bulk/bulk-csv-enrich";

vi.mock("@/lib/bulk/fill-prompt-bulk-idea-titles", () => ({
  fillPromptBulkIdeaTitlesFromAgent: vi.fn(async ({ rows }: { rows: CSVRow[] }) => {
    for (const row of rows) {
      row.title = "Agent Blog Title";
    }
  }),
}));

vi.mock("@/lib/local-analysis/blog-slug-agent", () => ({
  fillBlogRowSlugFromOpenRouter: vi.fn(async (rows: CSVRow[]) =>
    rows.map((r) => ({ ...r, target_slug: "agent-blog-slug" })),
  ),
}));

vi.mock("@/lib/local-analysis/entity-sap-meta-agent", () => ({
  fillBlogRowMetaFromOpenRouter: vi.fn(async (rows: CSVRow[]) =>
    rows.map((r) => ({ ...r, meta_description: "meta" })),
  ),
  fillSapRowMetaFromOpenRouter: vi.fn(async (rows: CSVRow[]) => rows),
}));

vi.mock("@/lib/local-analysis/entity-sap-title-agent", () => ({
  fillSapRowTitlesFromOpenRouter: vi.fn(async (rows: CSVRow[]) => rows),
}));

describe("enrichCsvRowsFromSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs URL slug agent on SAP rows and clears CSV keyword slugs", async () => {
    const rows: CSVRow[] = [
      {
        keyword: "custom blinds 2026 alberta electoral redistribution sherwood park ab",
        title: "Custom Blinds Near Sherwood Park, AB",
        entity: "Sherwood Park, AB",
        sitemap_type: "entity",
        target_slug: "custom-blinds-2026-alberta-electoral-redistribution-sherwood-park-ab",
        destination_url: "https://example.com/service-area/custom-blinds-2026-alberta-electoral-redistribution-sherwood/",
      },
    ];
    const out = await enrichCsvRowsFromSheet(rows, {
      apiKey: "key",
      model: "test-model",
      siteName: "Blind Magic",
      gridLocations: ["Sherwood Park, AB"],
    });
    expect(out[0]?.target_slug).toBe("agent-blog-slug");
    expect(out[0]?.destination_url).toBeUndefined();
    expect(out[0]?.target_slug).not.toContain("electoral");
  });

  it("runs blog title and slug agents when entity column is set but row is not SAP", async () => {
    const rows: CSVRow[] = [
      {
        keyword: "custom blinds 2026 alberta electoral redistribution sherwood park ab",
        title: "custom blinds 2026 alberta electoral redistribution sherwood park ab",
        entity: "Sherwood Park, AB",
        destination_url: "https://example.com/blog/custom-blinds-2026-alberta-electoral-redistribution-sherwood/",
      },
    ];
    const out = await enrichCsvRowsFromSheet(rows, {
      apiKey: "key",
      model: "test-model",
      siteName: "Blind Magic",
      gridLocations: ["Sherwood Park, AB"],
    });
    expect(out[0]?.title).toBe("Agent Blog Title");
    expect(out[0]?.target_slug).toBe("agent-blog-slug");
    expect(out[0]?.destination_url).toBeUndefined();
  });

  it("runs blog title and slug agents for post rows", async () => {
    const rows: CSVRow[] = [
      {
        keyword: "custom blinds sherwood park",
        title: "custom blinds sherwood park",
      },
    ];
    const out = await enrichCsvRowsFromSheet(rows, {
      apiKey: "key",
      model: "test-model",
      siteName: "Blinds West",
      gridLocations: [],
    });
    expect(out[0]?.title).toBe("Agent Blog Title");
    expect(out[0]?.target_slug).toBe("agent-blog-slug");
    expect(out[0]?.meta_description).toBe("meta");
  });
});
