import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Pill } from "@/ui/primitives/Pill";
import { FilterRow } from "@/ui/patterns/FilterRow";

const meta: Meta<typeof Pill> = { title: "Primitives/Pill", component: Pill };
export default meta;

type Story = StoryObj<typeof Pill>;

const MODES = ["Pages", "Posts", "SAP"] as const;

function Row() {
  const [active, setActive] = useState<(typeof MODES)[number]>("Pages");
  return (
    <FilterRow>
      {MODES.map((label) => (
        <Pill key={label} label={label} active={active === label} onClick={() => setActive(label)} />
      ))}
      <Pill label="Disabled" active={false} disabled onClick={() => {}} />
    </FilterRow>
  );
}

export const AllStates: Story = { render: () => <Row /> };
