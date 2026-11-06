import type { Meta, StoryObj } from "@storybook/react";
import { LocalIcon } from "@/ui";

const meta: Meta = { title: "Vendor/LocalIcon" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <LocalIcon />
  ),
};
