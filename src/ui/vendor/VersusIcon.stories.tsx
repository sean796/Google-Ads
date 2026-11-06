import type { Meta, StoryObj } from "@storybook/react";
import { VersusIcon } from "@/ui";

const meta: Meta = { title: "Vendor/VersusIcon" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <VersusIcon />
  ),
};
