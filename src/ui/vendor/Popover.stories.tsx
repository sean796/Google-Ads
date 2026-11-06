import type { Meta, StoryObj } from "@storybook/react";
import { PopoverContent, PopoverTrigger } from "@/ui";
import { Popover } from "@/ui";

const meta: Meta = { title: "Vendor/Popover" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <Popover open>
      <PopoverTrigger>Open</PopoverTrigger>
      <PopoverContent>Popover body.</PopoverContent>
    </Popover>
  ),
};
