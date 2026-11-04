import { type ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ReportTooltipIconProps = {
  tooltip?: string;
  className?: string;
};

/**
 * Single tooltip icon placed on the LEFT of a section heading.
 * Uses Radix Tooltip only (no native title attribute, preventing duplicate tooltips).
 */
export function ReportTooltipIcon({ tooltip, className }: ReportTooltipIconProps) {
  const cleanTooltip = tooltip?.trim();
  if (!cleanTooltip) return null;

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={cleanTooltip}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "organic-client-report-export__tooltip-trigger inline-flex shrink-0 items-center justify-center cursor-help outline-none focus:outline-none",
            className,
          )}
        >
          <CircleHelp
            className="organic-client-report-export__tooltip-icon h-4 w-4 shrink-0 text-[#71717a]"
            aria-hidden="true"
          />
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        className="max-w-xs rounded-none border border-[#27272a] bg-[#09090b] px-3 py-2 font-sans text-base font-normal leading-snug text-white shadow-md"
      >
        {cleanTooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export type ReportLabelWithTooltipProps = {
  label: string;
  tooltip?: string;
  className?: string;
  iconClassName?: string;
};

/**
 * Renders an h2 section heading with the tooltip icon on the LEFT of the heading text.
 */
export function ReportLabelWithTooltip({
  label,
  tooltip,
  className,
  iconClassName,
}: ReportLabelWithTooltipProps) {
  const cleanTooltip = tooltip?.trim();
  if (!cleanTooltip) {
    return (
      <span className={cn("organic-client-report-export__h2-text", className)}>
        {label}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <ReportTooltipIcon tooltip={cleanTooltip} className={iconClassName} />
      <span className="organic-client-report-export__h2-text whitespace-normal break-words">
        {label}
      </span>
    </span>
  );
}

export type OrganicClientReportAccordionProps = {
  id: string;
  headingId?: string;
  title: string;
  tooltip?: string;
  variant?: "section" | "card";
  defaultOpen?: boolean;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  children: ReactNode;
};

/**
 * Closed-by-default accordion dropdown for client report main section headings and cards.
 * Places a single tooltip icon on the LEFT of the heading text and the chevron on the right.
 */
export function OrganicClientReportAccordion({
  id,
  headingId,
  title,
  tooltip,
  variant = "card",
  defaultOpen = false,
  className,
  triggerClassName,
  contentClassName,
  children,
}: OrganicClientReportAccordionProps) {
  const itemValue = `${id}-item`;
  const cleanTooltip = tooltip?.trim();
  const isSection = variant === "section";

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={defaultOpen ? itemValue : undefined}
      className={cn(
        "organic-client-report-export__accordion w-full",
        isSection && "organic-client-report-export__section-accordion",
        className,
      )}
    >
      <AccordionItem
        value={itemValue}
        className="organic-client-report-export__accordion-item border-0"
      >
        <AccordionTrigger
          id={headingId}
          className={cn(
            "organic-client-report-export__accordion-trigger !py-1 font-bold text-[#09090b] hover:no-underline outline-none focus:outline-none focus-visible:outline-none",
            isSection &&
              "organic-client-report-export__section-head organic-client-report-export__accordion-trigger--section !py-1.5",
            triggerClassName,
          )}
        >
          <span className="inline-flex min-w-0 flex-1 items-center gap-2 pr-3 text-left">
            {cleanTooltip ? <ReportTooltipIcon tooltip={cleanTooltip} /> : null}
            <span
              className={cn(
                isSection
                  ? "organic-client-report-export__h2-text"
                  : "text-base font-semibold leading-snug text-[#09090b]",
                "whitespace-normal break-words",
              )}
            >
              {title}
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent
          className={cn(
            "organic-client-report-export__accordion-content text-base",
            contentClassName,
          )}
        >
          {children}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
