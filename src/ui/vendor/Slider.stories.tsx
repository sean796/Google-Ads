import type { Meta, StoryObj } from "@storybook/react";
import { Slider } from "@/ui";

const meta: Meta = { title: "Vendor/Slider" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <Slider defaultValue={[40]} max={100} step={1} className="w-80" />
  ),
};
