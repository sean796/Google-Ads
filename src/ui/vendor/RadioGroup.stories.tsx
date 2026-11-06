import type { Meta, StoryObj } from "@storybook/react";
import { RadioGroupItem } from "@/ui";
import { RadioGroup } from "@/ui";

const meta: Meta = { title: "Vendor/RadioGroup" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <RadioGroup defaultValue="a">
      <RadioGroupItem value="a" aria-label="Option A" />
      <RadioGroupItem value="b" aria-label="Option B" />
    </RadioGroup>
  ),
};
