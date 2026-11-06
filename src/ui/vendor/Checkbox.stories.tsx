import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Checkbox } from "@/ui";

const meta: Meta = { title: "Vendor/Checkbox" };
export default meta;

type Story = StoryObj;

function CheckboxDemo() {
  const [checked, setChecked] = useState(true);
  return <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} aria-label="Example checkbox" />;
}

export const Basic: Story = {
  render: () => <CheckboxDemo />,
};
