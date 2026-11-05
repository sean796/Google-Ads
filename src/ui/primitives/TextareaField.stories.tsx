import type { Meta, StoryObj } from "@storybook/react";
import { TextareaField } from "@/ui/primitives/TextareaField";
import { FilterRow } from "@/ui/patterns/FilterRow";

const meta: Meta<typeof TextareaField> = { title: "Primitives/TextareaField", component: TextareaField };
export default meta;

type Story = StoryObj<typeof TextareaField>;

export const AllStates: Story = {
  render: () => (
    <FilterRow>
      <TextareaField placeholder="Notes" />
      <TextareaField placeholder="Filled" defaultValue="Some text" rows={2} />
      <TextareaField placeholder="Disabled" disabled />
    </FilterRow>
  ),
};
