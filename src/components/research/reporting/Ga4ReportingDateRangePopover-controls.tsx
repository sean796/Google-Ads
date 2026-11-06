import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, RowButton, Field } from "@/ui";

export function Ga4OutlinedDateInput({
  label,
  value,
  max,
  disabled,
  onChange,
  onFocus,
}: {
  label: string;
  value: string;
  max: string;
  disabled: boolean;
  onChange: (ymd: string) => void;
  onFocus?: () => void;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <span className="pointer-events-none absolute left-2 top-0 z-[1] -translate-y-1/2 bg-ui-field px-1 text-base text-muted-foreground">
        {label}
      </span>
      <Field
        placeholder={label}
        type="date"
        aria-label={label}
        max={max}
        disabled={disabled}
        value={value}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function SidebarRow({
  active,
  label,
  submenu,
  disabled,
  onSelect,
}: {
  active: boolean;
  label: string;
  submenu?: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <RowButton
      selected={Boolean(active)}
      type="button"
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="min-w-0 flex-1">{label}</span>
      {submenu ? <ChevronRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden /> : null}
    </RowButton>
  );
}

export function CompareToggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Button
      pressed={Boolean(checked)}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span
        className={cn(
          "absolute top-0.5 block h-4 w-4 rounded-full bg-white transition-transform",
          checked ? "translate-x-[1.125rem]" : "translate-x-0.5",
        )}
      />
    </Button>
  );
}
