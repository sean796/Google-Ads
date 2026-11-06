import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "@/ui";

const meta: Meta = { title: "Vendor/Input" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <Input placeholder="Type here" className="w-80" />
  ),
};
