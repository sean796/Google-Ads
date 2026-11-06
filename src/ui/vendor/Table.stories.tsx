import type { Meta, StoryObj } from "@storybook/react";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui";
import { Table } from "@/ui";

const meta: Meta = { title: "Vendor/Table" };
export default meta;

type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <Table className="w-80">
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>First</TableCell>
          <TableCell>1</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};
