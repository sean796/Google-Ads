import type { Meta, StoryObj } from "@storybook/react";
import { useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/ui/primitives/Button";
import { FileInput } from "@/ui/primitives/FileInput";

const meta: Meta<typeof FileInput> = { title: "Primitives/FileInput", component: FileInput };
export default meta;

type Story = StoryObj<typeof FileInput>;

function PickerDemo() {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <FileInput ref={ref} accept=".csv" />
      <Button icon={Upload} onClick={() => ref.current?.click()}>
        Upload CSV
      </Button>
    </>
  );
}

/** The picker is hidden; a Button opens it. */
export const WithButton: Story = { render: () => <PickerDemo /> };
