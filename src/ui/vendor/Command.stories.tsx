import type { Meta, StoryObj } from "@storybook/react";
import { CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/ui";
import { Command } from "@/ui";

const meta: Meta = { title: "Vendor/Command" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <Command className="w-80">
      <CommandInput placeholder="Search" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup>
          <CommandItem>First result</CommandItem>
          <CommandItem>Second result</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};
