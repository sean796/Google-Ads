import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@/ui/primitives/Button";
import { Field } from "@/ui/primitives/Field";
import { FilterRow, FilterRowDivider } from "@/ui/patterns/FilterRow";

const meta: Meta<typeof FilterRow> = { title: "Patterns/FilterRow", component: FilterRow };
export default meta;

type Story = StoryObj<typeof FilterRow>;

/** Filters on the left, divider, then the right-aligned action cluster. */
export const Toolbar: Story = {
  render: () => (
    <div className="flex h-11 w-full items-center gap-1.5">
      <FilterRow aria-label="Filters">
        <Field placeholder="Search URLs" />
        <FilterRowDivider />
        <Button>Filter</Button>
      </FilterRow>
      <FilterRow align="end" aria-label="Actions">
        <Button variant="run">Run</Button>
        <Button variant="danger">Clear</Button>
      </FilterRow>
    </div>
  ),
};
