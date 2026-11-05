import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { CheckField } from "@/ui/primitives/CheckField";
import { FilterRow } from "@/ui/patterns/FilterRow";

const meta: Meta<typeof CheckField> = { title: "Primitives/CheckField", component: CheckField };
export default meta;

type Story = StoryObj<typeof CheckField>;

function Row() {
  const [checked, setChecked] = useState(false);
  return (
    <FilterRow>
      <CheckField label="Select all" checked={checked} onCheckedChange={setChecked} />
      <CheckField label="Some selected" checked="indeterminate" onCheckedChange={() => {}} />
      <CheckField aria-label="Box only" checked onCheckedChange={() => {}} />
      <CheckField label="Disabled" checked={false} disabled onCheckedChange={() => {}} />
    </FilterRow>
  );
}

export const AllStates: Story = { render: () => <Row /> };
