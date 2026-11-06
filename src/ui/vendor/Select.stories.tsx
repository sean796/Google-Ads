import type { Meta, StoryObj } from "@storybook/react";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui";
import { Select } from "@/ui";

const meta: Meta = { title: "Vendor/Select" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-80">
        <SelectValue placeholder="Pick one" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="a">Option A</SelectItem>
        <SelectItem value="b">Option B</SelectItem>
      </SelectContent>
    </Select>
  ),
};
