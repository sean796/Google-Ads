import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Switch } from "@/ui";

const meta: Meta = { title: "Vendor/Switch" };
export default meta;

type Story = StoryObj;

function SwitchDemo() {
  const [checked, setChecked] = useState(false);
  return <Switch checked={checked} onCheckedChange={setChecked} aria-label="Example switch" />;
}

export const Basic: Story = {
  render: () => <SwitchDemo />,
};
