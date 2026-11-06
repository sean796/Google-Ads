import type { Meta, StoryObj } from "@storybook/react";
import { VendorButton } from "@/ui";

const meta: Meta = { title: "Vendor/VendorButton" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <VendorButton>Default</VendorButton>
      <VendorButton variant="outline">Outline</VendorButton>
      <VendorButton variant="ghost">Ghost</VendorButton>
      <VendorButton variant="destructive">Delete</VendorButton>
    </div>
  ),
};
