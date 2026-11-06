import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Field } from "@/ui/primitives/Field";
import { TextareaField } from "@/ui/primitives/TextareaField";
import { CheckField } from "@/ui/primitives/CheckField";
import { SwitchField } from "@/ui/primitives/SwitchField";
import { SelectField } from "@/ui/primitives/SelectField";

describe("Field (flat inline form)", () => {
  it("uses the placeholder as its label and reports typing", async () => {
    const onChange = vi.fn();
    render(<Field placeholder="Keyword" defaultValue="" onChange={onChange} />);

    const input = screen.getByLabelText("Keyword");
    expect(input).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Keyword")).toBe(input);

    await userEvent.type(input, "blinds");
    expect(input).toHaveValue("blinds");
    expect(onChange).toHaveBeenCalled();
  });

  it("supports controlled value updates", async () => {
    function Harness() {
      const [value, setValue] = useState("");
      return <Field placeholder="Site URL" value={value} onChange={(e) => setValue(e.target.value)} />;
    }
    render(<Harness />);

    const input = screen.getByLabelText("Site URL");
    await userEvent.type(input, "https://example.com");
    expect(input).toHaveValue("https://example.com");
  });
});

describe("TextareaField", () => {
  it("types multi-line text with the placeholder as label", async () => {
    render(<TextareaField placeholder="Notes" defaultValue="" />);
    const area = screen.getByLabelText("Notes");
    await userEvent.type(area, "line one\nline two");
    expect(area).toHaveValue("line one\nline two");
  });
});

describe("CheckField", () => {
  it("toggles when its label is clicked", async () => {
    const onCheckedChange = vi.fn();
    render(<CheckField label="Select all" checked={false} onCheckedChange={onCheckedChange} />);

    await userEvent.click(screen.getByText("Select all"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("reflects checked and indeterminate states", () => {
    const { rerender } = render(
      <CheckField label="Select all" checked onCheckedChange={() => {}} />,
    );
    expect(screen.getByRole("checkbox", { name: "Select all" })).toHaveAttribute("aria-checked", "true");

    rerender(<CheckField label="Select all" checked="indeterminate" onCheckedChange={() => {}} />);
    expect(screen.getByRole("checkbox", { name: "Select all" })).toHaveAttribute("aria-checked", "mixed");
  });
});

describe("SwitchField", () => {
  it("toggles when clicked and reflects state", async () => {
    const onCheckedChange = vi.fn();
    render(<SwitchField label="Auto publish" checked={false} onCheckedChange={onCheckedChange} />);

    const toggle = screen.getByRole("switch", { name: "Auto publish" });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await userEvent.click(toggle);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});

describe("SelectField", () => {
  const options = [
    { value: "blinds", label: "Blinds" },
    { value: "shutters", label: "Shutters" },
  ];

  it("shows the placeholder as its label when nothing is selected", () => {
    render(<SelectField placeholder="Window covering" value="" onValueChange={() => {}} options={options} />);
    expect(screen.getByLabelText("Window covering")).toBeInTheDocument();
    expect(screen.getByText("Window covering")).toBeInTheDocument();
  });

  it("shows the selected option label when a value is set", () => {
    render(<SelectField placeholder="Window covering" value="blinds" onValueChange={() => {}} options={options} />);
    expect(screen.getByText("Blinds")).toBeInTheDocument();
  });

  it("opens and reports the picked option", async () => {
    const onValueChange = vi.fn();
    render(<SelectField placeholder="Window covering" value="" onValueChange={onValueChange} options={options} />);

    await userEvent.click(screen.getByLabelText("Window covering"));
    await userEvent.click(await screen.findByRole("option", { name: "Shutters" }));
    expect(onValueChange).toHaveBeenCalledWith("shutters");
  });

  it("does not open when disabled", async () => {
    render(
      <SelectField placeholder="Window covering" value="" onValueChange={() => {}} options={options} disabled />,
    );
    const trigger = screen.getByLabelText("Window covering");
    expect(trigger).toBeDisabled();
    await userEvent.click(trigger);
    expect(screen.queryByRole("option", { name: "Blinds" })).toBeNull();
  });
});
