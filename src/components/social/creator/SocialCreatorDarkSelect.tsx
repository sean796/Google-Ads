import { SelectField } from "@/ui";

export type SocialCreatorDarkSelectOption = {
  value: string;
  label: string;
};

export type SocialCreatorDarkSelectProps = {
  value: string;
  options: SocialCreatorDarkSelectOption[];
  disabled?: boolean;
  ariaLabel: string;
  onChange: (value: string) => void;
};

export function SocialCreatorDarkSelect({ value, options, disabled, ariaLabel, onChange }: SocialCreatorDarkSelectProps) {
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