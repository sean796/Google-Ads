import { describe, expect, it } from "vitest";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import {
  bulkCsvRowRunStatus,
  countBulkCsvRowsDone,
} from "../bulk-csv-row-run-status";

function completedFile(rowIndex: number): BulkGeneratedFile {
  return {
    id: `f-${rowIndex}`,
    rowIndex,
    fileName: `row-${rowIndex}.md`,
    content: "body",
    mimeType: "text/markdown",
    status: "completed",
    timestamp: 1,
    rowData: { keyword: "k", title: `Row ${rowIndex}` },
  };
}

describe("bulkCsvRowRunStatus", () => {
  it("returns waiting before run starts", () => {
    expect(
      bulkCsvRowRunStatus({
        rowIndex: 0,
        currentRow: 0,
        isProcessing: false,
        filesByRow: new Map(),
      }),
    ).toBe("waiting");
  });

  it("returns generating for the active row", () => {
    expect(
      bulkCsvRowRunStatus({
        rowIndex: 2,
        currentRow: 2,
        isProcessing: true,
        filesByRow: new Map(),
      }),
    ).toBe("generating");
  });

  it("returns generating for the active row even when partial files exist", () => {
    const filesByRow = new Map([[1, [completedFile(1)]]]);
    expect(
      bulkCsvRowRunStatus({
        rowIndex: 1,
        currentRow: 1,
        isProcessing: true,
        filesByRow,
      }),
    ).toBe("generating");
  });

  it("returns done for finished rows before the active index", () => {
    const filesByRow = new Map([[1, [completedFile(1)]]]);
    expect(
      bulkCsvRowRunStatus({
        rowIndex: 1,
        currentRow: 3,
        isProcessing: true,
        filesByRow,
      }),
    ).toBe("done");
  });

  it("returns done for rows before current when no files yet", () => {
    expect(
      bulkCsvRowRunStatus({
        rowIndex: 1,
        currentRow: 3,
        isProcessing: true,
        filesByRow: new Map(),
      }),
    ).toBe("done");
  });

  it("returns error when row is in failed set", () => {
    expect(
      bulkCsvRowRunStatus({
        rowIndex: 0,
        currentRow: 0,
        isProcessing: true,
        filesByRow: new Map(),
        failedRowIndices: new Set([0]),
      }),
    ).toBe("error");
  });
});

describe("countBulkCsvRowsDone", () => {
  it("counts done and skipped rows", () => {
    const filesByRow = new Map([[0, [completedFile(0)]]]);
    expect(
      countBulkCsvRowsDone({
        totalRows: 4,
        currentRow: 2,
        isProcessing: true,
        filesByRow,
        failedRowIndices: new Set([3]),
      }),
    ).toBe(2);
  });
});
