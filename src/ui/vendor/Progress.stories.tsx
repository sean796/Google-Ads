import type { Meta, StoryObj } from "@storybook/react";
import { Progress } from "@/ui";

const meta: Meta = { title: "Vendor/Progress" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <Progress value={60} className="w-80" />
  ),
};
