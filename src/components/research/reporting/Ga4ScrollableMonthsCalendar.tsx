import { useLayoutEffect, useMemo, useRef } from "react";
import type { DateRange } from "react-day-picker";
import { DayPicker } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  ga4CalendarMonthIndex,
  ga4CalendarMonthKey,
  ga4CalendarSpan,
} from "@/lib/reporting/ga4-calendar-month-span";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"] as const;

export type Ga4ScrollableMonthsCalendarProps = {
  selected: DateRange | undefined;
  onSelect: (range: DateRange | undefined) => void;
  maxDate: Date;
  scrollToDate?: Date;
  scrollKey?: number;
  disabled?: boolean;
};

export function Ga4ScrollableMonthsCalendar({
  selected,
  onSelect,
  maxDate,
  scrollToDate,
  scrollKey = 0,
  disabled = false,
}: Ga4ScrollableMonthsCalendarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { startMonth, monthCount } = useMemo(() => ga4CalendarSpan(maxDate), [maxDate]);

  useLayoutEffect(() => {
    if (!scrollToDate || !scrollRef.current) return;
    const monthStart = new Date(scrollToDate.getFullYear(), scrollToDate.getMonth(), 1);
    const key = ga4CalendarMonthKey(monthStart);
    const monthIndex = ga4CalendarMonthIndex(startMonth, monthStart);

    let cancelled = false;
    let attempts = 0;

    const scrollToMonth = () => {
      if (cancelled || !scrollRef.current) return;
      const root = scrollRef.current;

      const marked = root.querySelector(`[data-ga4-month="${key}"]`);
      if (marked) {
        marked.scrollIntoView({ block: "start" });
        return;
      }

      const monthBlocks = root.querySelectorAll("[data-ga4-month-block]");
      const byIndex = monthBlocks[monthIndex];
      if (byIndex) {
        byIndex.scrollIntoView({ block: "start" });
        return;
      }

      if (attempts < 24) {
        attempts += 1;
        requestAnimationFrame(scrollToMonth);
      }
    };

    scrollToMonth();

    return () => {
      cancelled = true;
    };
  }, [scrollToDate, scrollKey, monthCount, startMonth]);

  return (
    <div className="flex min-h-[14rem] min-w-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-color:hsl(var(--primary))_hsl(0_0%_12%)] [scrollbar-width:thin]"
      >
        <div className="sticky top-0 z-10 grid grid-cols-7 bg-zinc-900 px-3 pb-2 pt-1">
          {WEEKDAY_LABELS.map((label, i) => (
            <span
              key={`${label}-${i}`}
              className="text-center text-base font-normal text-muted-foreground"
            >
              {label}
            </span>
          ))}
        </div>
        <DayPicker
          mode="range"
          disableNavigation
          month={startMonth}
          numberOfMonths={monthCount}
          showOutsideDays
          selected={selected}
          disabled={disabled ? true : { after: maxDate }}
          onSelect={onSelect}
          className="mx-auto w-full max-w-none p-0 px-2 pb-4"
          classNames={{
            months: "flex flex-col gap-8",
            month: "w-full space-y-2",
            caption: "relative flex items-center justify-center pb-1",
            caption_label: "text-base font-medium uppercase tracking-wide text-muted-foreground",
            nav: "hidden",
            table: "w-full border-collapse",
            head_row: "hidden",
            head_cell: "hidden",
            row: "mt-1 flex w-full",
            cell: "relative flex-1 p-0 text-center [&:has([aria-selected])]:bg-primary/15 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
            day: cn(
              buttonVariants({ variant: "ghost" }),
              "mx-auto h-9 w-9 rounded-full p-0 text-base font-normal hover:bg-zinc-800 aria-selected:opacity-100",
            ),
            day_selected:
              "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary",
            day_range_middle: "rounded-none bg-primary/15 text-foreground aria-selected:bg-primary/15",
            day_outside: "text-muted-foreground opacity-40 aria-selected:bg-primary/10",
            day_today: "font-semibold text-foreground",
            day_disabled: "text-muted-foreground opacity-30",
          }}
          components={{
            IconLeft: () => <ChevronLeft className="h-4 w-4" />,
            IconRight: () => <ChevronRight className="h-4 w-4" />,
            Caption: ({ id, displayMonth }) => {
              const monthKey = ga4CalendarMonthKey(displayMonth);
              const label = displayMonth.toLocaleString("en-US", {
                month: "long",
                year: "numeric",
              });
              return (
                <div
                  className="relative flex items-center justify-center pb-1"
                  data-ga4-month={monthKey}
                  data-ga4-month-block=""
                >
                  <div
                    id={id}
                    role="presentation"
                    aria-live="polite"
                    className="text-base font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {label}
                  </div>
                </div>
              );
            },
          }}
        />
      </div>
    </div>
  );
}
