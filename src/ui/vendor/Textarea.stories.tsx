import type { Meta, StoryObj } from "@storybook/react";
import { Textarea } from "@/ui";

const meta: Meta = { title: "Vendor/Textarea" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <Textarea placeholder="Write here" className="w-80" />
  ),
};
