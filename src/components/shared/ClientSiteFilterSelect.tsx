import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { RowButton, Popover, PopoverContent, PopoverTrigger } from "@/ui";

export type ClientSiteFilterOption = {
  id: string;
  label: string;
  activeCount?: number;
};

type ClientSiteFilterSelectProps = {
  value: string;
  options: ClientSiteFilterOption[];
  onChange: (siteId: string) => void;
  className?: string;
  contentClassName?: string;
  contentLayout?: "compact" | "drawerRow";
  hideChevron?: boolean;
  fixTriggerWidthToLongestLabel?: boolean;
  fullWidth?: boolean;
  ariaLabel?: string;
};

export function ClientSiteFilterSelect({
  value,
  options,
  onChange,
  className,
  contentClassName,
  contentLayout = "compact",
  hideChevron = false,
  fixTriggerWidthToLongestLabel = false,
  fullWidth = false,
  ariaLabel = "Client site filter",
}: ClientSiteFilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [menuWidth, setMenuWidth] = useState<number | null>(null);
  const [fixedTriggerWidth, setFixedTriggerWidth] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === value) ?? options[0];
  const drawerRow = contentLayout === "drawerRow";

  const longestLabel = useMemo(() => {
    if (options.length === 0) return "Site";
    return options.reduce(
      (longest, option) => (option.label.length > longest.length ? option.label : longest),
      options[0]?.label ?? "Site",
    );
  }, [options]);

  useLayoutEffect(() => {
    if (!drawerRow || !fixTriggerWidthToLongestLabel || !sizerRef.current) return;
    setFixedTriggerWidth(Math.ceil(sizerRef.current.getBoundingClientRect().width));
  }, [drawerRow, fixTriggerWidthToLongestLabel, hideChevron, longestLabel, options, className]);

  useLayoutEffect(() => {
    if (!open || !drawerRow) return;
    const row =
      triggerRef.current?.closest(".agent-runs-site-filter-row") ??
      triggerRef.current?.closest(".agent-runs-site-picker-row");
    if (row) setMenuWidth(Math.floor(row.getBoundingClientRect().width));
  }, [drawerRow, open, options.length]);

  const triggerWidthStyle =
    drawerRow && fixTriggerWidthToLongestLabel && fixedTriggerWidth
      ? { width: fixedTriggerWidth, minWidth: fixedTriggerWidth }
      : undefined;

  return (
    <div className={cn("relative", fullWidth ? "w-full min-w-0" : "shrink-0")}>
      {drawerRow && fixTriggerWidthToLongestLabel ? (
        <div
          ref={sizerRef}
          aria-hidden
          className={cn(
            "pointer-events-none invisible absolute left-0 top-0 flex h-9 shrink-0 items-center px-3 text-base text-white",
            !hideChevron && "gap-2",
            className,
          )}
        >
          <span className="whitespace-nowrap">{longestLabel}</span>
          {!hideChevron ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden /> : null}
        </div>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            style={triggerWidthStyle}
            className={cn(
              "flex h-9 items-center px-3 text-base text-white",
              fullWidth ? "w-full min-w-0 justify-between" : "shrink-0",
              !hideChevron && "gap-2",
              className,
            )}
            aria-label={ariaLabel}
          >
            <span
              className={cn(
                fixTriggerWidthToLongestLabel ? "whitespace-nowrap" : "min-w-0 break-words",
              )}
            >
              {selected?.label ?? "Site"}
            </span>
            {!hideChevron ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={0}
          style={drawerRow && menuWidth ? { width: menuWidth } : undefined}
          className={cn(
            "client-site-filter-panel z-[70] border-0 text-base shadow-lg",
            drawerRow
              ? "agent-runs-site-filter-panel rounded-none p-0"
              : "w-[min(100vw-2rem,18rem)] rounded-md bg-ui-field p-1",
            contentClassName,
          )}
        >
          <div className="client-site-filter-panel__list flex max-h-64 flex-col overflow-y-auto">
            {options.map((option, index) => {
              const active = option.id === value;
              return (
                <RowButton
                  selected={Boolean(drawerRow)}
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 break-words">{option.label}</span>
                  {option.activeCount != null && option.activeCount > 0 ? (
                    <span className="agent-runs-site-filter__active-dot shrink-0" aria-hidden />
                  ) : null}
                </RowButton>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
