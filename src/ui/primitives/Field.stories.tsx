import type { Meta, StoryObj } from "@storybook/react";
import { Field } from "@/ui/primitives/Field";
import { FilterRow } from "@/ui/patterns/FilterRow";

const meta: Meta<typeof Field> = { title: "Primitives/Field", component: Field };
export default meta;

type Story = StoryObj<typeof Field>;

export const AllStates: Story = {
  render: () => (
    <FilterRow>
      <Field placeholder="Keyword" />
      <Field placeholder="Filled" defaultValue="shutterspot.com" />
      <Field placeholder="Disabled" disabled />
      <Field type="number" size="count" placeholder="Max pages" defaultValue={25} />
      <Field size="short" placeholder="" defaultValue="9" aria-label="Entity count" />
      <Field size="keyword" placeholder="Keyword" />
      <Field size="url" type="url" placeholder="https://example.com" />
    </FilterRow>
  ),
};
