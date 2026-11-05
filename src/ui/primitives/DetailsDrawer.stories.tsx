import type { Meta, StoryObj } from "@storybook/react";
import { DetailsDrawer } from "@/ui/primitives/DetailsDrawer";

const meta: Meta<typeof DetailsDrawer> = { title: "Primitives/DetailsDrawer", component: DetailsDrawer };
export default meta;

type Story = StoryObj<typeof DetailsDrawer>;

/** Lives in the right sidebar Details tab, so the story supplies a sidebar-width column. */
export const Open: Story = {
  render: () => (
    <div className="flex h-64 w-[28rem] flex-col bg-black">
      <DetailsDrawer id="story-details">
        <p className="p-3 text-base">Batch status and micro-progress logs.</p>
      </DetailsDrawer>
    </div>
  ),
};