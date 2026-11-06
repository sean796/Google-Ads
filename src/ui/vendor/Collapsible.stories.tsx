import type { Meta, StoryObj } from "@storybook/react";
import { CollapsibleContent, CollapsibleTrigger } from "@/ui";
import { Collapsible } from "@/ui";

const meta: Meta = { title: "Vendor/Collapsible" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <Collapsible className="w-80">
      <CollapsibleTrigger>Toggle</CollapsibleTrigger>
      <CollapsibleContent>Hidden body.</CollapsibleContent>
    </Collapsible>
  ),
};
