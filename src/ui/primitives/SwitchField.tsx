import { Switch } from "@/ui/vendor/switch";
import { cn } from "@/lib/utils";
import { UI_SWITCH } from "@/ui/tokens";

export type SwitchFieldProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Visible text next to the switch. */
  label: string;
  title?: string;
  disabled?: boolean;
};

/** Switch with an inline label. The box is the same in on and off. */
export function SwitchField({ checked, onCheckedChange, label, title, disabled }: SwitchFieldProps) {
  return (
    <label
      title={title}
      className={cn(
        "flex shrink-0 items-center gap-2 text-base text-foreground",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <Switch
        className={UI_SWITCH}
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onCheckedChange={onCheckedChange}
      />
      {label}
    </label>
  );
}
