import { useState, type ReactNode, type SyntheticEvent } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { GoogleAdsRowEndRail } from "@/components/ppc/google/GoogleAdsRowEndRail";
import {
  PPC_CAMPAIGN_ROW_GRID_COLS,
  PPC_ROW_CONTENT_SPAN_CLASS,
} from "@/components/ppc/google/google-ads-row-constants";
import { cn } from "@/lib/utils";
import { Button, Field } from "@/ui";

export const PPC_DETAILS_ACCORDION_STACK = "flex flex-col gap-2.5 rounded-none pt-1";

export const PPC_DETAILS_TRIGGER = cn(
  "grid w-full min-w-0 min-h-[3rem] items-center gap-x-2 rounded-none border-0 bg-black py-1.5 text-left text-base font-medium text-white sm:min-h-[3.25rem] sm:gap-x-3",
  PPC_CAMPAIGN_ROW_GRID_COLS,
);

export const PPC_DETAILS_SUBTRIGGER = cn(PPC_DETAILS_TRIGGER, "bg-ui-field/80");

export type GoogleAdsDetailsSectionProps = {
  title: string;
  titlePrefix?: string;
  titleField?: {
    value: string;
    readOnly?: boolean;
    placeholder?: string;
    ariaLabel?: string;
    onChange?: (value: string) => void;
  };
  badge?: string | number;
  icon?: ReactNode;
  defaultOpen?: boolean;
  nested?: boolean;
  headerAction?: ReactNode;
  onDelete?: () => void;
  deleteDisabled?: boolean;
  deleteLabel?: string;
  children: ReactNode;
  contentClassName?: string;
  onOpenChange?: (open: boolean) => void;
};

function stopFieldActivation(e: SyntheticEvent) {
  e.stopPropagation();
}

function EndRailGenerateWrap({ children }: { children: ReactNode }) {
  return (
    <span onClick={stopFieldActivation} onMouseDown={stopFieldActivation}>
      {children}
    </span>
  );
}

function SectionTitle({
  title,
  badge,
}: {
  title: string;
  badge?: string | number;
}) {
  return (
    <span className="min-w-0 flex-1 break-words text-left">
      {title}
      {badge !== undefined ? (
        <span className="ml-2 tabular-nums text-semantic-analysis-foreground">{badge}</span>
      ) : null}
    </span>
  );
}

export function GoogleAdsDetailsSection({
  title,
  titlePrefix,
  titleField,
  badge,
  icon,
  defaultOpen = false,
  nested = false,
  headerAction,
  onDelete,
  deleteDisabled = false,
  deleteLabel,
  children,
  contentClassName,
  onOpenChange,
}: GoogleAdsDetailsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  const triggerClass = nested ? PPC_DETAILS_SUBTRIGGER : PPC_DETAILS_TRIGGER;

  const endRail = (chevronAsCollapsibleTrigger: boolean) => (
    <GoogleAdsRowEndRail
      generate={headerAction ? <EndRailGenerateWrap>{headerAction}</EndRailGenerateWrap> : undefined}
      onDelete={onDelete}
      deleteDisabled={deleteDisabled}
      deleteLabel={deleteLabel}
      chevron={
        chevronAsCollapsibleTrigger ? (
          <CollapsibleTrigger asChild>
            <Button
              size="icon" icon={ChevronDown}
              variant="quiet"
              aria-label={open ? "Collapse section" : "Expand section"}
            ></Button>
          </CollapsibleTrigger>
        ) : (
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        )
      }
    />
  );

  const header = titleField ? (
    <div className={triggerClass}>
      <div className={PPC_ROW_CONTENT_SPAN_CLASS}>
        {icon ? <span className="inline-flex shrink-0 [&_svg]:h-4 [&_svg]:w-4">{icon}</span> : null}
        {titlePrefix ? (
          <span className="shrink-0 text-base font-medium text-white">{titlePrefix}</span>
        ) : null}
        <Field
          type="text"
          value={titleField.value}
          readOnly={titleField.readOnly}
          placeholder={titleField.placeholder}
          aria-label={titleField.ariaLabel ?? title}
          onClick={stopFieldActivation}
          onKeyDown={stopFieldActivation}
          onChange={titleField.onChange ? (e) => titleField.onChange?.(e.target.value) : undefined}
        />
      </div>
      {endRail(true)}
    </div>
  ) : (
    <CollapsibleTrigger asChild>
      <Button variant="quiet">
        <div className={PPC_ROW_CONTENT_SPAN_CLASS}>
          {icon ? <span className="inline-flex shrink-0 [&_svg]:h-4 [&_svg]:w-4">{icon}</span> : null}
          <SectionTitle title={title} badge={badge} />
        </div>
        {endRail(false)}
      </Button>
    </CollapsibleTrigger>
  );

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      {header}
      <CollapsibleContent className={cn("space-y-2 pt-2", contentClassName)}>{children}</CollapsibleContent>
    </Collapsible>
  );
}
