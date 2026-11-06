import type { Meta, StoryObj } from "@storybook/react";
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, VendorButton } from "@/ui";
import { Dialog } from "@/ui";

const meta: Meta = { title: "Vendor/Dialog" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dialog title</DialogTitle>
          <DialogDescription>Dialog description.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <VendorButton>Done</VendorButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
