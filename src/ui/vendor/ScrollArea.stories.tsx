import type { Meta, StoryObj } from "@storybook/react";
import { ScrollArea } from "@/ui";

const meta: Meta = { title: "Vendor/ScrollArea" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <ScrollArea className="h-32 w-80">
      <div className="p-2">Scrollable body with enough text to overflow the box on several lines of content.</div>
    </ScrollArea>
  ),
};
