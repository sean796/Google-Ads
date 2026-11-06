import type { Meta, StoryObj } from "@storybook/react";
import { CheckSquare, FolderOpen, Sparkles } from "lucide-react";
import { RailButton } from "@/ui/primitives/RailButton";

const meta: Meta<typeof RailButton> = { title: "Primitives/RailButton", component: RailButton };
export default meta;

type Story = StoryObj<typeof RailButton>;

/** Left studio rail: green column, icon above label, selected state is darker. */
export const Rail: Story = {
  render: () => (
    <div className="flex w-20 flex-col items-center justify-center gap-3 bg-primary py-4">
      <RailButton icon={FolderOpen} label="Assets" />
      <RailButton icon={Sparkles} label="Brief" selected />
      <RailButton icon={CheckSquare} label="Checklist" />
    </div>
  ),
};
