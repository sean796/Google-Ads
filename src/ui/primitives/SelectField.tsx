import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/vendor/select";
import { UI_SELECT_TRIGGER, UI_SELECT_TRIGGER_DATA } from "@/ui/tokens";

const SELECT_WIDTH = {
  xs: "w-[6.5rem]",
  sm: "w-[9rem]",
  md: "w-[10rem]",
  full: "w-full",
} as const;

export type SelectFieldOption = { value: string; label: string; disabled?: boolean; icon?: LucideIcon };

export type SelectFieldProps = {
  /** The label. Names the field when nothing is selected. */
  placeholder: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectFieldOption[];
  width?: keyof typeof SELECT_WIDTH;
  disabled?: boolean;
  /** "data" = green on black. */
  tone?: "default" | "data";
};

/** Dropdown styled as a flat well. Shows the full selected label. */
export function SelectField({
  placeholder,
  value,
  onValueChange,
  options,
  width = "md",
  disabled,
  tone = "default",
}: SelectFieldProps) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger aria-label={placeholder} className={cn(tone === "data" ? UI_SELECT_TRIGGER_DATA : UI_SELECT_TRIGGER, SELECT_WIDTH[width])}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.icon ? <option.icon className="mr-2 inline h-4 w-4 shrink-0" /> : null}{option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
