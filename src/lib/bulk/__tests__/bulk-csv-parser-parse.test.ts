import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: vi.fn(),
}));

vi.mock("@/lib/optimization-settings-storage", () => ({
  getResearchModel: () => "test-model",
}));

import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { parseCSV } from "@/lib/bulk/bulk-csv-parser";

const mockCall = vi.mocked(callOpenRouterChatCompletion);

function csvFile(): File {
  return new File(["keyword,title\ntest keyword,Test Title\n"], "rows.csv", {
    type: "text/csv",
  });
}

describe("parseCSV model JSON parsing", () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it("returns rows for valid model JSON", async () => {
    mockCall.mockResolvedValue({
      raw: null,
      content: JSON.stringify({
        rows: [
          {
            keyword: "test keyword",
            title: "Test Title",
            entity: "Edmonton",
            sitemap_type: "post",
          },
        ],
      }),
    });

    await expect(parseCSV(csvFile(), "test-key", "test-model")).resolves.toEqual([
      {
        keyword: "test keyword",
        title: "Test Title",
        entity: "Edmonton",
        sitemap_type: "post",
      },
    ]);
  });

  it("throws a labeled error when the model does not return valid JSON", async () => {
    mockCall.mockResolvedValue({ raw: null, content: "not json at all" });

    await expect(parseCSV(csvFile(), "test-key", "test-model")).rejects.toThrow(
      "Invalid bulk CSV rows JSON: model did not return valid JSON.",
    );
  });

  it("throws a labeled error when rows is not an array", async () => {
    mockCall.mockResolvedValue({
      raw: null,
      content: JSON.stringify({ rows: "nope" }),
    });

    await expect(parseCSV(csvFile(), "test-key", "test-model")).rejects.toThrow(
      /Invalid bulk CSV rows JSON:/,
    );
  });

  it("throws a labeled error when a row is missing its title", async () => {
    mockCall.mockResolvedValue({
      raw: null,
      content: JSON.stringify({ rows: [{ keyword: "test keyword" }] }),
    });

    await expect(parseCSV(csvFile(), "test-key", "test-model")).rejects.toThrow(
      /Invalid bulk CSV rows JSON:/,
    );
  });

  it("throws a labeled error when a row field has the wrong type", async () => {
    mockCall.mockResolvedValue({
      raw: null,
      content: JSON.stringify({ rows: [{ keyword: 123, title: "Test Title" }] }),
    });

    await expect(parseCSV(csvFile(), "test-key", "test-model")).rejects.toThrow(
      /Invalid bulk CSV rows JSON:/,
    );
  });

  it("throws a labeled error when sitemap_type is not post or entity", async () => {
    mockCall.mockResolvedValue({
      raw: null,
      content: JSON.stringify({
        rows: [{ keyword: "test keyword", title: "Test Title", sitemap_type: "page" }],
      }),
    });

    await expect(parseCSV(csvFile(), "test-key", "test-model")).rejects.toThrow(
      /Invalid bulk CSV rows JSON:/,
    );
  });

  it("keeps the no-rows throw for a valid empty rows array", async () => {
    mockCall.mockResolvedValue({
      raw: null,
      content: JSON.stringify({ rows: [] }),
    });

    await expect(parseCSV(csvFile(), "test-key", "test-model")).rejects.toThrow(
      "OpenRouter returned no bulk rows",
    );
  });

  it("keeps the no-rows throw when every row has a blank keyword or title", async () => {
    mockCall.mockResolvedValue({
      raw: null,
      content: JSON.stringify({ rows: [{ keyword: "  ", title: "Test Title" }] }),
    });

    await expect(parseCSV(csvFile(), "test-key", "test-model")).rejects.toThrow(
      "OpenRouter returned no bulk rows",
    );
  });
});
