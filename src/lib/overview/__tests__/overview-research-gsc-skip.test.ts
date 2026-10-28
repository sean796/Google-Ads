import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasValidGscDumpFilename,
  isOverviewGscDumpFilename,
  RESEARCH_NO_GSC_DATA,
} from "@/lib/overview/overview-research-row";

const rowPath = join(dirname(fileURLToPath(import.meta.url)), "../overview-research-row.ts");

describe("isOverviewGscDumpFilename", () => {
  it("accepts GSC dump CSVs and rejects inventory keyword text files", () => {
    expect(isOverviewGscDumpFilename("gsc_page_keywords__2026-08-27.csv")).toBe(true);
    expect(isOverviewGscDumpFilename("gsc_quick_wins__site.csv")).toBe(true);
    expect(isOverviewGscDumpFilename("gsc_site_queries__batch.csv")).toBe(true);
    expect(
      isOverviewGscDumpFilename("gsc-keywords-ridgelinesolar.ca-1787844199745.txt"),
    ).toBe(false);
  });
});

describe("hasValidGscDumpFilename", () => {
  it("returns false for inventory txt and null", () => {
    expect(hasValidGscDumpFilename(null)).toBe(false);
    expect(hasValidGscDumpFilename("gsc-keywords-site.txt")).toBe(false);
    expect(hasValidGscDumpFilename("gsc_quick_wins__site.csv")).toBe(true);
  });
});

describe("overview research GSC data gate", () => {
  it("does not use AbortSignal.timeout in the research row module", () => {
    const src = readFileSync(rowPath, "utf8");
    expect(src).not.toMatch(/AbortSignal\.timeout/);
    expect(src).not.toMatch(/GSC_BRIEF_CONTEXT_TIMEOUT_MS/);
    expect(src).not.toMatch(/GSC_OVERVIEW_EXPORT_TIMEOUT_MS/);
    expect(src).not.toMatch(/GSC context skipped/);
  });

  it("exports no-data label for GSC steps without a valid dump", () => {
    expect(RESEARCH_NO_GSC_DATA).toBe("No GSC data");
  });
});

describe("overview research OpenRouter LLM audit model", () => {
  it("uses a valid OpenRouter model slug with web search options", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../llm-audit/llm-audit-openrouter.ts"),
      "utf8",
    );
    expect(src).toContain('"openai/gpt-4o-mini:online"');
    expect(src).not.toContain("gpt-4o-mini-search-preview");
    expect(src).not.toContain("webSearchOptions");
  });
});

describe("overview research DataForSEO SERP soft fail", () => {
  it("does not abort the row when DataForSEO SERP returns no stored file", () => {
    const src = readFileSync(rowPath, "utf8");
    expect(src).not.toContain('throw new Error("DataForSEO SERP returned no stored file")');
    expect(src).toContain("fetchOptionalDataForSeoSerp");
    expect(src).toContain("runOpenRouterLlmAuditStep");
    expect(src).not.toContain("runSerpAndLlmAuditParallel");
  });
});
