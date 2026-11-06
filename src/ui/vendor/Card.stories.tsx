import type { Meta, StoryObj } from "@storybook/react";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/ui";
import { Card } from "@/ui";

const meta: Meta = { title: "Vendor/Card" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Card title</CardTitle>
        <CardDescription>Card description.</CardDescription>
      </CardHeader>
      <CardContent>Card body.</CardContent>
    </Card>
  ),
};
