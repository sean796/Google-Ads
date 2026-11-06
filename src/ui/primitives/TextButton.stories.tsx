import type { Meta, StoryObj } from "@storybook/react";
import { TextButton } from "@/ui/primitives/TextButton";
import { FilterRow } from "@/ui/patterns/FilterRow";

const meta: Meta<typeof TextButton> = { title: "Primitives/TextButton", component: TextButton };
export default meta;

type Story = StoryObj<typeof TextButton>;

export const AllStates: Story = {
  render: () => (
    <FilterRow>
      <TextButton tone="link" onClick={() => {}}>
        Link tone
      </TextButton>
      <TextButton tone="muted" onClick={() => {}}>
        Muted tone
      </TextButton>
      <TextButton tone="plain" onClick={() => {}}>
        Plain tone
      </TextButton>
      <TextButton tone="link" disabled onClick={() => {}}>
        Disabled
      </TextButton>
    </FilterRow>
  ),
};
