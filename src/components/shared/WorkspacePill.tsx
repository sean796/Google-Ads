import type { LucideIcon } from "lucide-react";
import {
  WORKSPACE_PILL_ACTIVE,
  WORKSPACE_PILL_ACTIVE_FORGE,
  WORKSPACE_PILL_BASE,
  WORKSPACE_PILL_INACTIVE,
  WORKSPACE_PILL_INACTIVE_FORGE,
  WORKSPACE_PILL_SQUARE_BASE,
} from "@/components/shared/workspace-pill-styles";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

export type WorkspacePillProps = {
  label: string;
  active: boolean;
  disabled?: boolean;
  /** Square corners (Content Optimizer chrome). */
  square?: boolean;
  /** Forge recipe tile styling instead of primary green or white active. */
  tone?: "default" | "forge" | "monochrome";
  icon?: LucideIcon;
  /** Icon-only pill (label used for aria-label / title). */
  iconOnly?: boolean;
  onClick: () => void;
  className?: string;
};

export function WorkspacePill({
  label,
  active,
  disabled = false,
  square = false,
  tone = "default",
  icon: Icon,
  iconOnly = false,
  onClick,
  className,
}: WorkspacePillProps) {
  const blockInteraction = disabled;
  const nativeDisabled = disabled && !active;

  return (
    <Button
      pressed={Boolean(active)}
      variant="quiet"
      disabled={nativeDisabled}
      aria-disabled={blockInteraction || undefined}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      onClick={() => {
        if (blockInteraction) return;
        onClick();
      }}
    >
      {iconOnly && Icon ? (
        <Icon className="relative z-[1] h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <>
          {Icon ? <Icon className="relative z-[1] mr-1.5 h-4 w-4 shrink-0" aria-hidden /> : null}
          <span className="relative z-[1] block min-w-0 break-words">{label}</span>
        </>
      )}
    </Button>
  );
}
