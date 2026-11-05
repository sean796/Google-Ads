import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { SwitchField } from "@/ui/primitives/SwitchField";
import { FilterRow } from "@/ui/patterns/FilterRow";

const meta: Meta<typeof SwitchField> = { title: "Primitives/SwitchField", component: SwitchField };
export default meta;

type Story = StoryObj<typeof SwitchField>;

function Row() {
  const [on, setOn] = useState(false);
  return (
    <FilterRow>
      <SwitchField label="Publish live" checked={on} onCheckedChange={setOn} />
      <SwitchField label="On" checked onCheckedChange={() => {}} />
      <SwitchField label="Disabled" checked={false} disabled onCheckedChange={() => {}} />
    </FilterRow>
  );
}

export const AllStates: Story = { render: () => <Row /> };
