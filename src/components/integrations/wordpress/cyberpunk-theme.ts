/**
 * Shared theme constants for WordPress / integration panels.
 * Uses global CSS variables (--primary, --background) so chrome matches Content Optimizer.
 */

import { cn } from "@/lib/utils";

// Color strings for inline styles / keyframes (reference CSS variables)
export const CYBERPUNK_COLORS = {
  background: "hsl(var(--background))",
  border: "hsl(var(--primary) / 0.5)",
  borderIntense: "hsl(var(--primary) / 0.8)",
  textPrimary: "hsl(var(--primary))",
  textSecondary: "hsl(var(--primary) / 0.8)",
  glow: "hsl(var(--primary) / 0.5)",
  glowIntense: "hsl(var(--primary) / 0.8)",
  glowSubtle: "hsl(var(--primary) / 0.2)",
} as const;

export const BREATHE_NEON_ANIMATION = `
  @keyframes breatheNeon {
    0%, 100% { 
      box-shadow: 0 0 7px ${CYBERPUNK_COLORS.glow},
                  0 0 14px ${CYBERPUNK_COLORS.glowSubtle},
                  0 0 20px ${CYBERPUNK_COLORS.glowSubtle},
                  inset 0 0 7px ${CYBERPUNK_COLORS.glowSubtle};
    }
    50% { 
      box-shadow: 0 0 14px ${CYBERPUNK_COLORS.glowIntense},
                  0 0 26px ${CYBERPUNK_COLORS.glow},
                  0 0 38px ${CYBERPUNK_COLORS.glowSubtle},
                  inset 0 0 12px ${CYBERPUNK_COLORS.glow};
    }
  }
`;

export const CYBERPUNK_CLASSES = {
  card: "bg-surface-elevated border-0 shadow-tile",
  cardBreathe:
    "bg-surface-elevated border-0 shadow-tile animate-[breatheNeon_3s_ease-in-out_infinite]",
  cardHover: "hover:bg-tile-hover",

  textPrimary: "text-foreground font-semibold",
  textSecondary: "text-muted-foreground font-medium",
  textMuted: "text-muted-foreground font-medium",

  borderNeon: "border-primary/20",
  borderNeonIntense: "border-primary/35",
  borderDivider: "border-primary/10",

  bgNeon: "bg-primary/10",
  bgNeonHover: "bg-primary/15",
  bgNeonIntense: "bg-primary/18",

  buttonNeon:
    "border border-border/90 bg-black text-foreground shadow-none hover:border-border/90 hover:bg-black hover:text-white",
  buttonNeonActive:
    "border border-border/80 bg-black text-white ring-1 ring-primary/30 hover:bg-ui-field",

  glow: "shadow-tile",
  glowIntense: "shadow-[0_0_20px_hsl(var(--primary)/0.35)]",

  statusSuccess: "text-foreground",
  statusError: "text-ui-danger-hover",
  statusWarning: "text-semantic-warning-foreground",
  statusPending: "text-foreground",
} as const;

export function getCyberpunkCardClasses(animate: boolean = false, hover: boolean = true): string {
  const base = animate ? CYBERPUNK_CLASSES.cardBreathe : CYBERPUNK_CLASSES.card;
  return hover ? `${base} ${CYBERPUNK_CLASSES.cardHover}` : base;
}

export function getCyberpunkTextClasses(variant: "primary" | "secondary" | "muted" = "primary"): string {
  switch (variant) {
    case "primary":
      return CYBERPUNK_CLASSES.textPrimary;
    case "secondary":
      return CYBERPUNK_CLASSES.textSecondary;
    case "muted":
      return CYBERPUNK_CLASSES.textMuted;
  }
}

export function getCyberpunkButtonClasses(active: boolean = false): string {
  const base = CYBERPUNK_CLASSES.buttonNeon;
  return active ? `${base} ${CYBERPUNK_CLASSES.buttonNeonActive}` : base;
}

/**
 * Property list row + multi-site: square icon control (copy URL, GBP wand, quarter-gap download, power)
 * — flat black, no glow border, same family as per-row Optimize.
 */
export function getPropertyListRowBlackIconButtonClass(compact: boolean): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center !rounded-none border-0 shadow-none transition-colors",
    "!bg-[#000] text-white hover:!bg-[#000] hover:!text-white [&_svg]:!text-white",
    "focus-visible:outline-none focus:!ring-0 focus-visible:!ring-0 focus-visible:ring-offset-0",
    "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:!bg-[#000]",
    compact
      ? "h-8 min-h-8 w-8 min-w-8 !p-0 sm:h-9 sm:min-h-9 sm:w-9 sm:min-w-9"
      : "h-9 min-h-9 w-9 min-w-9 !p-0",
  );
}

/** Complementary hover glow for property row icon buttons (bg unchanged). */
export function getPropertyListRowIconButtonHoverGlowClass(
  kind: "destructive" | "powerOff" | "powerOn",
): string {
  const transition = "transition-[box-shadow]";
  switch (kind) {
    case "destructive":
      return cn(transition, "hover:shadow-[0_0_12px_rgba(252,165,165,0.55)]");
    case "powerOff":
      return cn(transition, "hover:shadow-[0_0_12px_rgba(255,255,255,0.35)]");
    case "powerOn":
      return cn(transition, "hover:shadow-[0_0_12px_rgba(132,189,0,0.6)]");
  }
}

/** Property list row: black metric cell frame (same #000 square look as icon buttons, variable width). */
export function getPropertyListRowBlackMetricFrameClass(compact: boolean): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center !rounded-none border-0 shadow-none",
    "!bg-[#000]",
    compact ? "h-8 min-h-8 px-2 sm:h-9 sm:min-h-9" : "h-9 min-h-9 px-2.5",
  );
}

/** Toolbar / row: labeled black pill (e.g. Properties bulk GBP). */
export function getPropertyListRowBlackLabelButtonClass(): string {
  return cn(
    "h-10 min-h-10 w-auto shrink-0 gap-1.5 border-0 px-3 text-base font-semibold text-white shadow-none",
    "!bg-black hover:!bg-black hover:!text-white [&_svg]:!text-white",
    "focus-visible:outline-none focus:!ring-0 focus-visible:!ring-0 focus-visible:ring-offset-0",
    "disabled:pointer-events-none disabled:opacity-40 disabled:hover:!bg-black",
  );
}

/** Quarter-gap Posts/Entities trigger on property rows. */
export function getPropertyListRowBlackSelectTriggerClass(compact: boolean): string {
  return cn(
    "w-fit min-w-0 shrink-0 justify-start gap-2 border-0 text-white shadow-none",
    "!bg-black hover:!bg-black data-[placeholder]:text-white/70 [&>svg]:ml-0 [&>svg]:shrink-0 [&>svg]:!text-white/80",
    "focus:!ring-0 focus-visible:!ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-40",
    compact ? "h-7 gap-1.5 px-2 py-0 text-sm [&>svg]:size-3.5" : "h-8 gap-2 px-2.5 py-0 text-base [&>svg]:size-4",
  );
}

/** Full-width property overview rows: solid card-grey fill, high-contrast foreground (matches design tokens). */
export function getPropertyActionTileClasses(): string {
  return [
    "h-10 min-h-10 w-full shrink-0 rounded-md border-0 shadow-none",
    "!bg-card !text-foreground hover:!bg-tile-hover",
    "[&_svg]:shrink-0 [&_svg]:!text-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:!bg-card/55 disabled:!text-foreground/80 disabled:!opacity-100 disabled:hover:!bg-card/55 disabled:saturate-100",
  ].join(" ");
}

export function getCyberpunkSiteUrlLinkClasses(): string {
  return [
    "self-start inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-border/70 bg-ui-field px-2 py-0.5 text-foreground shadow-sm",
    "no-underline transition-colors hover:border-border hover:bg-ui-field-hover hover:text-white",
  ].join(" ");
}