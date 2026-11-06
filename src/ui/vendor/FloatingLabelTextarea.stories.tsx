import type { Meta, StoryObj } from "@storybook/react";
import { FloatingLabelTextarea } from "@/ui";

const meta: Meta = { title: "Vendor/FloatingLabelTextarea" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <FloatingLabelTextarea label="Notes" className="w-80" />
  ),
};
