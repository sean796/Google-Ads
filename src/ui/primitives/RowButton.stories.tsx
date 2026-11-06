import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { RowButton } from "@/ui/primitives/RowButton";

const meta: Meta<typeof RowButton> = { title: "Primitives/RowButton", component: RowButton };
export default meta;

type Story = StoryObj<typeof RowButton>;

function Rows() {
  const [selected, setSelected] = useState("First row");
  return (
    <div className="w-80">
      {["First row", "Second row", "Third row"].map((label) => (
        <RowButton key={label} selected={selected === label} onClick={() => setSelected(label)}>
          {label}
        </RowButton>
      ))}
      <RowButton disabled>Disabled row</RowButton>
    </div>
  );
}

export const AllStates: Story = { render: () => <Rows /> };
