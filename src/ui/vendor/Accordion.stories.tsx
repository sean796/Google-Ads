import type { Meta, StoryObj } from "@storybook/react";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/ui";
import { Accordion } from "@/ui";

const meta: Meta = { title: "Vendor/Accordion" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <Accordion type="single" collapsible className="w-80">
      <AccordionItem value="a">
        <AccordionTrigger>Section one</AccordionTrigger>
        <AccordionContent>First section body.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="b">
        <AccordionTrigger>Section two</AccordionTrigger>
        <AccordionContent>Second section body.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};
