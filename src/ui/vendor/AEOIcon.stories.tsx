import type { Meta, StoryObj } from "@storybook/react";
import { AEOIcon } from "@/ui";

const meta: Meta = { title: "Vendor/AEOIcon" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <AEOIcon />
  ),
};
