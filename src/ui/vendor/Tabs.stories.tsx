import type { Meta, StoryObj } from "@storybook/react";
import { TabsContent, TabsList, TabsTrigger } from "@/ui";
import { Tabs } from "@/ui";

const meta: Meta = { title: "Vendor/Tabs" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <Tabs defaultValue="a" className="w-80">
      <TabsList>
        <TabsTrigger value="a">Tab A</TabsTrigger>
        <TabsTrigger value="b">Tab B</TabsTrigger>
      </TabsList>
      <TabsContent value="a">Panel A</TabsContent>
      <TabsContent value="b">Panel B</TabsContent>
    </Tabs>
  ),
};
