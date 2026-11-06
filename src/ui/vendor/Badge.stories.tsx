import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "@/ui";

const meta: Meta = { title: "Vendor/Badge" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
};
