import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { Play } from "lucide-react";
import { ActionButton } from "@/ui/primitives/ActionButton";
import { Button } from "@/ui/primitives/Button";
import { Field } from "@/ui/primitives/Field";
import { FilterRow } from "@/ui/patterns/FilterRow";

const meta: Meta<typeof ActionButton> = { title: "Primitives/ActionButton", component: ActionButton };
export default meta;

type Story = StoryObj<typeof ActionButton>;

const STATES = ["Generate", "Approve", "Publish"] as const;

function CycleRow() {
  const [index, setIndex] = useState(0);
  return (
    <FilterRow>
      <Field placeholder="Keyword" data-testid="left" />
      <ActionButton
        states={STATES}
        state={STATES[index]}
        icon={Play}
        onClick={() => setIndex((index + 1) % STATES.length)}
      />
      <Button data-testid="right">Neighbor</Button>
    </FilterRow>
  );
}

const box = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
};

/** Cycles every label; the control and both neighbors must not move or resize. */
export const StateCycle: Story = {
  render: () => <CycleRow />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const action = () => canvas.getByRole("button", { name: /Generate|Approve|Publish/ });
    const left = canvas.getByTestId("left");
    const right = canvas.getByTestId("right");
    const before = { action: box(action()), left: box(left), right: box(right) };
    for (let i = 0; i < STATES.length; i += 1) {
      await userEvent.click(action());
      expect({ action: box(action()), left: box(left), right: box(right) }).toEqual(before);
    }
  },
};
