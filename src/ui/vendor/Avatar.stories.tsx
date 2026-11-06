import type { Meta, StoryObj } from "@storybook/react";
import { AvatarFallback, AvatarImage } from "@/ui";
import { Avatar } from "@/ui";

const meta: Meta = { title: "Vendor/Avatar" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <Avatar>
      <AvatarImage src="https://example.com/avatar.png" alt="User" />
      <AvatarFallback>ND</AvatarFallback>
    </Avatar>
  ),
};
