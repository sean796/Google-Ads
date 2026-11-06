import type { Meta, StoryObj } from "@storybook/react";
import { useBoxReady } from "@/ui";

const meta: Meta = { title: "Vendor/useBoxReady" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <div className="text-base text-white">Hook: reports when a chart box has size. Used by ChartContainer.</div>
  ),
};
