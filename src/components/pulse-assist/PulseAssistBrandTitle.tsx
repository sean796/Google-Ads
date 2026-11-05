import { NeoPulseBrandMark } from "@/components/manager/NeoPulseBrandMark";
import { cn } from "@/lib/utils";

export const NEO_PULSE_ASSIST_LABEL = "NEO Pulse Assist";

type PulseAssistBrandTitleProps = {
  className?: string;
  /** Mark height in px. */
  markSize?: number;
  /** Hide the Assist word (mark-only, e.g. launcher). */
  markOnly?: boolean;
  /** Stack mark above Assist (panel header). */
  stacked?: boolean;
};

export function PulseAssistBrandTitle({
  className,
  markSize = 26,
  markOnly = false,
  stacked = false,
}: PulseAssistBrandTitleProps) {
  return (
    <span
      className={cn(
        "min-w-0",
        stacked
          ? "inline-flex flex-col items-start justify-center gap-0.5 leading-none"
          : "inline-flex items-center gap-2",
        className,
      )}
    >
      <NeoPulseBrandMark size={markSize} />
      {!markOnly ? (
        <span className={cn("font-semibold text-base leading-none", stacked ? "whitespace-nowrap" : "break-words")}>
          Assist
        </span>
      ) : null}
    </span>
  );
}
