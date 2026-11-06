import type { Meta, StoryObj } from "@storybook/react";
import { Separator } from "@/ui";

const meta: Meta = { title: "Vendor/Separator" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <div className="w-80">
      <div>Above</div>
      <Separator />
      <div>Below</div>
    </div>
  ),
};
