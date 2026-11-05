import type { LucideIcon } from "lucide-react";
import { Button } from "@/ui/primitives/Button";

export type ActionButtonProps<S extends string> = {
  /** Every label this control can show. The box is sized to the longest one. */
  states: readonly S[];
  /** Current label. Must be one of `states`. */
  state: S;
  variant?: "tool" | "run";
  /** Same icon in every state (constant slot). Busy is shown by the label, never a spinner. */
  icon?: LucideIcon;
  disabled?: boolean;
  onClick: () => void;
};

/**
 * One control that cycles labels (Generate, Approve, Publish; Start, Scraping).
 * All labels are stacked invisibly in one grid cell, so the box equals the longest label
 * in every state and no neighbor moves when the label changes.
 */
export function ActionButton<S extends string>({
  states,
  state,
  variant = "run",
  icon,
  disabled,
  onClick,
}: ActionButtonProps<S>) {
  return (
    <Button variant={variant} icon={icon} disabled={disabled} onClick={onClick}>
      <span className="inline-grid text-center">
        {states.map((label) => (
          <span key={label} className="invisible col-start-1 row-start-1" aria-hidden>
            {label}
          </span>
        ))}
        <span className="col-start-1 row-start-1">{state}</span>
      </span>
    </Button>
  );
}
