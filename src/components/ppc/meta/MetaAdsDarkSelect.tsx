import { SelectField } from "@/ui";

export type MetaAdsDarkSelectOption = {
  value: string;
  label: string;
};

export type MetaAdsDarkSelectProps = {
  value: string;
  options: MetaAdsDarkSelectOption[];
  disabled?: boolean;
  ariaLabel: string;
  onChange: (value: string) => void;
};

export function MetaAdsDarkSelect({ value, options, disabled, ariaLabel, onChange }: MetaAdsDarkSelectProps) {
  return (
    <SelectField
      placeholder={ariaLabel}
      value={value}
      options={options}
      disabled={disabled}
      width="full"
      onValueChange={onChange}
    />
  );
}