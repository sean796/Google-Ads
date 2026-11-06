import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GeneratedBlogIdeasList } from "@/components/keyword-research/bulk/GeneratedBlogIdeasList";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";

const rows: CSVRow[] = [
  { keyword: "blinds", title: "Best Blinds" },
  { keyword: "shutters", title: "Top Shutters" },
];

function Harness() {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  return (
    <>
      <output data-testid="selected">{[...selected].sort().join(",")}</output>
      <GeneratedBlogIdeasList
        hasGeneratedChecklist
        generatedRows={rows}
        selectedBlogIndices={selected}
        setSelectedBlogIndices={setSelected}
        isGeneratingChecklist={false}
        isProcessing={false}
        onRowChange={vi.fn()}
        embedded
      />
    </>
  );
}

describe("GeneratedBlogIdeasList", () => {
  it("selects and deselects all rows from the header checkbox", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByLabelText("Select all rows"));
    expect(screen.getByTestId("selected")).toHaveTextContent("0,1");
    expect(screen.getByLabelText("Deselect all rows")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Deselect all rows"));
    expect(screen.getByTestId("selected")).toHaveTextContent("");
  });

  it("selects a single row without selecting the rest", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByLabelText("Select idea 2"));
    expect(screen.getByTestId("selected")).toHaveTextContent("1");
    expect(screen.getByLabelText("Select all rows")).toBeInTheDocument();
  });

  it("expands a row to reveal its detail fields", async () => {
    render(<Harness />);

    expect(screen.queryByRole("group", { name: "Blog idea details" })).toBeNull();
    const expandButtons = screen.getAllByRole("button", { name: "Expand row" });
    await userEvent.click(expandButtons[0]!);
    expect(screen.getByRole("group", { name: "Blog idea details" })).toBeInTheDocument();
  });
});
