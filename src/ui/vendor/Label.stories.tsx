import type { Meta, StoryObj } from "@storybook/react";
import { Label } from "@/ui";

const meta: Meta = { title: "Vendor/Label" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <Label>Label text</Label>
  ),
};
