import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { UI_CHECKBOX } from "@/ui/tokens";

export type CheckFieldProps = {
  checked: boolean | "indeterminate";
  onCheckedChange: (checked: boolean) => void;
  /** Visible text next to the box. Omit for a box-only control and pass `aria-label`. */
  label?: string;
  "aria-label"?: string;
  title?: string;
  disabled?: boolean;
};

/** Square checkbox with an optional inline label (select all, toggles). */
export function CheckField({
  checked,
  onCheckedChange,
  label,
  "aria-label": ariaLabel,
  title,
  disabled,
}: CheckFieldProps) {
  return (
    <label
      title={title}
      className={cn(
        "flex shrink-0 items-center gap-2 text-base text-foreground",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <Checkbox
        className={UI_CHECKBOX}
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      />
      {label}
    </label>
  );
}
