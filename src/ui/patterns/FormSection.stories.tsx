import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@/ui/primitives/Button";
import { Field } from "@/ui/primitives/Field";
import { SelectField } from "@/ui/primitives/SelectField";
import { FormSection } from "@/ui/patterns/FormSection";

const meta: Meta<typeof FormSection> = { title: "Patterns/FormSection", component: FormSection };
export default meta;

type Story = StoryObj<typeof FormSection>;

export const Default: Story = {
  render: () => (
    <FormSection
      actions={
        <>
          <Button>Cancel</Button>
          <Button variant="run">Save</Button>
        </>
      }
    >
      <Field placeholder="Business name" />
      <Field placeholder="Website" />
      <SelectField
        placeholder="Category"
        value=""
        onValueChange={() => {}}
        options={[{ value: "blinds", label: "Blinds" }]}
      />
    </FormSection>
  ),
};
