import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@/ui/primitives/Button";
import { DialogShell } from "@/ui/primitives/DialogShell";
import { Field } from "@/ui/primitives/Field";
import { TextareaField } from "@/ui/primitives/TextareaField";
import { SwitchField } from "@/ui/primitives/SwitchField";

const meta: Meta<typeof DialogShell> = { title: "Patterns/DialogShell", component: DialogShell };
export default meta;

type Story = StoryObj<typeof DialogShell>;

function Demo() {
  const [open, setOpen] = useState(true);
  const [on, setOn] = useState(false);
  return (
    <>
      <Button variant="tool" onClick={() => setOpen(true)}>
        Open dialog
      </Button>
      <DialogShell
        open={open}
        onOpenChange={setOpen}
        title="New task"
        description="Name it and add notes."
        actions={
          <>
            <Button variant="tool" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="run" onClick={() => setOpen(false)}>
              Save
            </Button>
          </>
        }
      >
        <Field placeholder="Title" />
        <TextareaField placeholder="Notes" />
        <SwitchField label="Notify me" checked={on} onCheckedChange={setOn} />
      </DialogShell>
    </>
  );
}

export const Default: Story = { render: () => <Demo /> };
