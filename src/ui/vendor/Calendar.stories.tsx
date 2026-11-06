import type { Meta, StoryObj } from "@storybook/react";
import { Calendar } from "@/ui";

const meta: Meta = { title: "Vendor/Calendar" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <Calendar mode="single" />
  ),
};
