import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { SwatchButton } from "@/ui/primitives/SwatchButton";
import { FilterRow } from "@/ui/patterns/FilterRow";

const meta: Meta<typeof SwatchButton> = { title: "Primitives/SwatchButton", component: SwatchButton };
export default meta;

type Story = StoryObj<typeof SwatchButton>;

const SWATCHES = ["#16a34a", "#2563eb", "#dc2626", "#eab308"] as const;

function Tiles() {
  const [selected, setSelected] = useState<string>(SWATCHES[0]);
  return (
    <FilterRow>
      {SWATCHES.map((color) => (
        <SwatchButton
          key={color}
          swatch={{ backgroundColor: color }}
          selected={selected === color}
          onClick={() => setSelected(color)}
        />
      ))}
      <SwatchButton swatch={{ backgroundColor: "#52525b" }} disabled />
    </FilterRow>
  );
}

export const AllStates: Story = { render: () => <Tiles /> };
