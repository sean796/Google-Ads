import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { BULK_AUTO_GENERATE_TEMPLATE_COLUMNS } from "@/lib/bulk/bulk-auto-generate-template-columns";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { buildBulkAutoGenerateTemplateCsvFromRows } from "@/lib/local-analysis-csv-export";

describe("buildBulkAutoGenerateTemplateCsvFromRows", () => {
  it("exports meta_description, target_slug, and wikipedia columns", () => {
    const rows: CSVRow[] = [
      {
        keyword: "dumpster near me Sherwood Park, AB",
        entity: "Sherwood Park, AB",
        title: "Dumpster Rental Near Me In Sherwood Park",
        modifier: "",
        featuredImage: "google-maps",
        publish_date_gmt: "2026-07-09T15:00:00.000Z",
        meta_description: "Book dumpster rental near Sherwood Park with clear pricing.",
        wikipedia_url: "https://en.wikipedia.org/wiki/Sherwood_Park",
        wikipedia_title: "Sherwood Park, Alberta",
        target_slug: "dumpster-near-me-sherwood-park-ab",
      },
    ];

    const csv = buildBulkAutoGenerateTemplateCsvFromRows(rows, {
      requireLinkedWikipedia: true,
      defaultSitemapType: "entity",
    });
    const header = csv.split(/\r?\n/)[0];
    expect(header).toBe([...BULK_AUTO_GENERATE_TEMPLATE_COLUMNS].join(","));

    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    const row = parsed.data[0]!;
    expect(row.meta_description).toBe("Book dumpster rental near Sherwood Park with clear pricing.");
    // Export blanks a target_slug equal to the slug derived from keyword+entity;
    // downstream (bulkCsvRowPathLabel) re-derives it when the cell is empty.
    expect(row.target_slug).toBe("");
    expect(row.wikipedia_url).toBe("https://en.wikipedia.org/wiki/Sherwood_Park");
    expect(row.wikipedia_title).toBe("Sherwood Park, Alberta");
    expect(row.sitemap_type).toBe("entity");
  });

  it("leaves target_slug blank when missing for downstream derivation", () => {
    const rows: CSVRow[] = [
      {
        keyword: "dumpster near me",
        entity: "Sherwood Park, AB",
        title: "Dumpster Near Me In Sherwood Park",
        featuredImage: "google-maps",
      },
    ];
    const csv = buildBulkAutoGenerateTemplateCsvFromRows(rows, { defaultSitemapType: "entity" });
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    // Export does not derive a slug; blank is re-derived downstream from keyword+entity.
    expect(parsed.data[0]?.target_slug).toBe("");
  });
});
