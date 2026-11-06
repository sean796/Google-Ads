import type { Meta, StoryObj } from "@storybook/react";
import { ResizableHandle, ResizablePanel } from "@/ui";
import { ResizablePanelGroup } from "@/ui";

const meta: Meta = { title: "Vendor/ResizablePanelGroup" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <ResizablePanelGroup direction="horizontal" className="h-32 w-80">
      <ResizablePanel defaultSize={50}>Left</ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={50}>Right</ResizablePanel>
    </ResizablePanelGroup>
  ),
};
