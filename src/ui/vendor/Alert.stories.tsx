import type { Meta, StoryObj } from "@storybook/react";
import { AlertDescription } from "@/ui";
import { Alert } from "@/ui";

const meta: Meta = { title: "Vendor/Alert" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <Alert className="w-80">
      <AlertDescription>Something needs attention.</AlertDescription>
    </Alert>
  ),
};
