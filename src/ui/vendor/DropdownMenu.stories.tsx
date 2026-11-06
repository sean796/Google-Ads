import type { Meta, StoryObj } from "@storybook/react";
import { DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/ui";
import { DropdownMenu } from "@/ui";

const meta: Meta = { title: "Vendor/DropdownMenu" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <DropdownMenu open>
      <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem>First action</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked>Toggle option</DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};
