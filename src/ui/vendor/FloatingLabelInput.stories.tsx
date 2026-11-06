import type { Meta, StoryObj } from "@storybook/react";
import { FloatingLabelInput } from "@/ui";

const meta: Meta = { title: "Vendor/FloatingLabelInput" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <FloatingLabelInput label="Email" className="w-80" />
  ),
};
