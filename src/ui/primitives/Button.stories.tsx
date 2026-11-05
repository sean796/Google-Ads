import type { Meta, StoryObj } from "@storybook/react";
import { Play, Trash2 } from "lucide-react";
import { Button } from "@/ui/primitives/Button";
import { FilterRow } from "@/ui/patterns/FilterRow";

const meta: Meta<typeof Button> = { title: "Primitives/Button", component: Button };
export default meta;

type Story = StoryObj<typeof Button>;

/** Every variant and size, including a reserved slot that keeps its box. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <FilterRow>
        <Button variant="tool">Update</Button>
        <Button variant="run">Save New</Button>
        <Button variant="danger">Clear Content</Button>
        <Button variant="danger" disabled>
          Disabled
        </Button>
        <Button variant="danger" reserved>
          Reserved
        </Button>
        <Button variant="tool">After reserved</Button>
        <Button variant="ready">Grid CSV: shutterspot-grid.csv</Button>
      </FilterRow>
      <FilterRow>
        <Button variant="tool" size="icon" icon={Trash2} aria-label="Clear" />
        <Button variant="run" size="icon" icon={Play} aria-label="Run" />
        <Button variant="danger" size="icon" icon={Trash2} aria-label="Remove" />
        <Button variant="danger" icon={Trash2}>
          Clear temp (3)
        </Button>
      </FilterRow>
    </div>
  ),
};
