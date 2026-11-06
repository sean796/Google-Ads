import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BlogIdeaRowCompact, type BlogIdeaRowCompactProps } from "@/components/keyword-research/bulk/BlogIdeaRowCompact";

function baseProps(overrides: Partial<BlogIdeaRowCompactProps> = {}): BlogIdeaRowCompactProps {
  return {
    row: { keyword: "blinds", title: "Best Blinds" },
    index: 0,
    stripeIndex: 0,
    isSelected: false,
    isExpanded: false,
    isProcessing: false,
    onToggleSelect: vi.fn(),
    onToggleExpand: vi.fn(),
    onRowChange: vi.fn(),
    ...overrides,
  };
}

function StatefulRow({
  initial,
  startExpanded = false,
  onRowChangeSpy,
}: {
  initial: BlogIdeaRowCompactProps["row"];
  startExpanded?: boolean;
  onRowChangeSpy: (patch: Partial<BlogIdeaRowCompactProps["row"]>) => void;
}) {
  const [row, setRow] = useState(initial);
  const [expanded, setExpanded] = useState(startExpanded);
  return (
    <BlogIdeaRowCompact
      row={row}
      index={0}
      stripeIndex={0}
      isSelected={false}
      isExpanded={expanded}
      isProcessing={false}
      onToggleSelect={() => {}}
      onToggleExpand={() => setExpanded((v) => !v)}
      onRowChange={(patch) => {
        onRowChangeSpy(patch);
        setRow((r) => ({ ...r, ...patch }));
      }}
    />
  );
}

describe("BlogIdeaRowCompact", () => {
  it("renders the title and keyword and reports selection", async () => {
    const props = baseProps();
    render(<BlogIdeaRowCompact {...props} />);

    expect(screen.getByText("Best Blinds")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Select idea 1"));
    expect(props.onToggleSelect).toHaveBeenCalledTimes(1);
  });

  it("reports expansion and edits through onRowChange", async () => {
    const spy = vi.fn();
    render(<StatefulRow initial={{ keyword: "blinds", title: "Best Blinds" }} onRowChangeSpy={spy} />);

    await userEvent.click(screen.getByRole("button", { name: "Expand row" }));
    expect(screen.getByRole("group", { name: "Blog idea details" })).toBeInTheDocument();

    const titleField = screen.getByLabelText("Title");
    await userEvent.clear(titleField);
    await userEvent.type(titleField, "New Title");
    expect(titleField).toHaveValue("New Title");
    expect(spy).toHaveBeenLastCalledWith({ title: "New Title" });
  });

  it("converts an emptied entity to undefined", async () => {
    const spy = vi.fn();
    render(
      <StatefulRow
        initial={{ keyword: "blinds", title: "Best Blinds", entity: "Acme" }}
        startExpanded
        onRowChangeSpy={spy}
      />,
    );

    await userEvent.clear(screen.getByLabelText("Entity"));
    expect(spy).toHaveBeenCalledWith({ entity: undefined });
  });

  it("edits keyword and modifications inline in slot mode", async () => {
    const props = baseProps({ slotMode: true });
    render(<BlogIdeaRowCompact {...props} />);

    await userEvent.type(screen.getByLabelText("Keyword"), "x");
    expect(props.onRowChange).toHaveBeenCalledWith({ keyword: "blindsx" });

    await userEvent.type(screen.getByLabelText("Modifications"), "y");
    expect(props.onRowChange).toHaveBeenCalledWith(expect.objectContaining({ modifier: expect.any(String) }));
  });

  it("renders no selection checkbox for placeholder rows", () => {
    render(<BlogIdeaRowCompact {...baseProps({ placeholder: true })} />);
    expect(screen.queryByLabelText("Select idea 1")).toBeNull();
  });
});
