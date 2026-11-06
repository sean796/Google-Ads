import type { Meta, StoryObj } from "@storybook/react";
import { TooltipContent, TooltipProvider, TooltipTrigger } from "@/ui";
import { Tooltip } from "@/ui";

const meta: Meta = { title: "Vendor/Tooltip" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip open>
        <TooltipTrigger>Hover target</TooltipTrigger>
        <TooltipContent>Tooltip text</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};
