import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { SelectField } from "@/ui/primitives/SelectField";
import { FilterRow } from "@/ui/patterns/FilterRow";

const meta: Meta<typeof SelectField> = { title: "Primitives/SelectField", component: SelectField };
export default meta;

type Story = StoryObj<typeof SelectField>;

const OPTIONS = [
  { value: "a", label: "Shutter Spot" },
  { value: "b", label: "Superior Blinds and Window Coverings" },
];

function Row() {
  const [value, setValue] = useState("");
  return (
    <FilterRow>
      <SelectField placeholder="Client" value={value} onValueChange={setValue} options={OPTIONS} />
      <SelectField placeholder="Client" value="b" onValueChange={() => {}} options={OPTIONS} width="sm" />
      <SelectField placeholder="Disabled" value="" onValueChange={() => {}} options={OPTIONS} disabled />
    </FilterRow>
  );
}

export const AllStates: Story = { render: () => <Row /> };
