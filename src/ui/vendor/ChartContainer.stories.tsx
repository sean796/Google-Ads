import type { Meta, StoryObj } from "@storybook/react";
import { ChartContainer } from "@/ui";

const meta: Meta = { title: "Vendor/ChartContainer" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <ChartContainer config={{ views: { label: "Views" } }} className="h-40 w-80">
      <div />
    </ChartContainer>
  ),
};
