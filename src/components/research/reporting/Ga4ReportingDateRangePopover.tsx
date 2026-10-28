import { useCallback, useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Ga4ScrollableMonthsCalendar } from "@/components/research/reporting/Ga4ScrollableMonthsCalendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BULK_HEADER_SELECT } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import {
  GA4_COMPARE_BASELINE_OPTIONS,
  GA4_PRIMARY_PRESET_OPTIONS,
  buildGa4ReportingRanges,
  formatGa4DatePickerTriggerCompact,
  type Ga4CompareBaselineId,
  type Ga4PrimaryPresetId,
} from "@/lib/reporting/ga4-analytics-date-ranges";
import {
  validateReportingCompareFetchRanges,
  validateReportingPrimaryFetchRange,
} from "@/lib/reporting/reporting-date-presets";
import type { ReportingCompareRanges } from "@/lib/reporting/reporting-date-presets";
import { cn } from "@/lib/utils";

export type Ga4ReportingDateHarness = {
  primaryPreset: Ga4PrimaryPresetId;
  compareBaseline: Ga4CompareBaselineId;
  compareEnabled: boolean;
  compareRangeDraft: ReportingCompareRanges;
};

export type Ga4ReportingDateRangePopoverProps = {
  busy?: boolean;
  value: Ga4ReportingDateHarness;
  onApply: (next: Ga4ReportingDateHarness) => void;
  todayYmdMax: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function ymdToDate(ymd: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function dateToYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function Ga4OutlinedDateInput({
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
      <span className="pointer-events-none absolute left-2 top-0 z-[1] -translate-y-1/2 bg-zinc-900 px-1 text-base text-muted-foreground">
        {label}
      </span>
      <Input
        type="date"
        aria-label={label}
        className={cn(BULK_HEADER_SELECT, "h-10 w-full px-2 pt-1 font-sans")}
        max={max}
        disabled={disabled}
        value={value}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

type WeekSubmenuId = "this_week" | "last_week" | null;

type CalendarTarget = "primary" | "compare";

function presetMatchesSidebarRow(
  preset: Ga4PrimaryPresetId,
  rowId: Ga4PrimaryPresetId,
): boolean {
  if (preset === rowId) return true;
  if (rowId === "this_week_sun") {
    return preset === "this_week_sun" || preset === "this_week_mon";
  }
  if (rowId === "last_week_sun_sat") {
    return preset === "last_week_sun_sat" || preset === "last_week_mon_sat";
  }
  return false;
}

function SidebarRow({
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
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-1 rounded-none px-3 py-2.5 text-left text-base transition-colors",
        active ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:bg-zinc-800 hover:text-foreground",
      )}
      onClick={onSelect}
    >
      <span className="min-w-0 flex-1">{label}</span>
      {submenu ? <ChevronRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden /> : null}
    </button>
  );
}

function CompareToggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-zinc-600",
      )}
      onClick={() => onChange(!checked)}
    >
      <span
        className={cn(
          "absolute top-0.5 block h-4 w-4 rounded-full bg-white transition-transform",
          checked ? "translate-x-[1.125rem]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function Ga4ReportingDateRangePopover({
  busy = false,
  value,
  onApply,
  todayYmdMax,
  open,
  onOpenChange,
}: Ga4ReportingDateRangePopoverProps) {
  const [draft, setDraft] = useState(value);
  const [calendarTarget, setCalendarTarget] = useState<CalendarTarget>("primary");
  const [scrollKey, setScrollKey] = useState(0);
  const [weekSubmenu, setWeekSubmenu] = useState<WeekSubmenuId>(null);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setCalendarTarget("primary");
      setWeekSubmenu(null);
      setScrollKey((k) => k + 1);
    }
  }, [open, value]);

  const syncFromPreset = useCallback((patch: Partial<Ga4ReportingDateHarness>) => {
    setDraft((prev) => {
      const merged = { ...prev, ...patch };
      const ranges = buildGa4ReportingRanges({
        primaryPreset: merged.primaryPreset,
        primaryCustom: merged.compareRangeDraft.primary,
        compareEnabled: merged.compareEnabled,
        compareBaseline: merged.compareBaseline,
        compareCustom: merged.compareRangeDraft.compare,
      });
      return { ...merged, compareRangeDraft: ranges };
    });
  }, []);

  const primaryRange = draft.compareRangeDraft.primary;
  const compareRange = draft.compareRangeDraft.compare;

  const validation = useMemo(() => {
    if (!draft.compareEnabled) {
      return validateReportingPrimaryFetchRange(primaryRange);
    }
    return validateReportingCompareFetchRanges(primaryRange, compareRange);
  }, [draft.compareEnabled, primaryRange, compareRange]);

  const appliedPrimary = value.compareRangeDraft.primary;
  const appliedCompare = value.compareRangeDraft.compare;
  const triggerLabel = formatGa4DatePickerTriggerCompact(
    value.primaryPreset,
    appliedPrimary,
    value.compareEnabled,
    appliedCompare,
  );

  const calendarRange: DateRange | undefined = useMemo(() => {
    const active =
      calendarTarget === "compare" && draft.compareEnabled
        ? compareRange
        : primaryRange;
    const from = ymdToDate(active.startDate);
    const to = ymdToDate(active.endDate);
    if (!from || !to) return undefined;
    return { from, to: to >= from ? to : from };
  }, [
    calendarTarget,
    draft.compareEnabled,
    compareRange.startDate,
    compareRange.endDate,
    primaryRange.startDate,
    primaryRange.endDate,
  ]);

  const maxDate = ymdToDate(todayYmdMax) ?? new Date();

  const scrollToDate = useMemo(() => {
    if (calendarTarget === "compare" && draft.compareEnabled) {
      const d =
        ymdToDate(compareRange.startDate) ??
        ymdToDate(compareRange.endDate) ??
        maxDate;
      return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    const today = ymdToDate(todayYmdMax) ?? maxDate;
    return new Date(today.getFullYear(), today.getMonth(), 1);
  }, [
    calendarTarget,
    draft.compareEnabled,
    compareRange.startDate,
    compareRange.endDate,
    todayYmdMax,
    maxDate,
    scrollKey,
  ]);

  const handleCalendarSelect = (range: DateRange | undefined) => {
    if (!range?.from) return;
    const startDate = dateToYmd(range.from);
    const endDate = dateToYmd(range.to ?? range.from);

    if (calendarTarget === "compare" && draft.compareEnabled) {
      setDraft((prev) => ({
        ...prev,
        compareBaseline: "custom",
        compareRangeDraft: {
          ...prev.compareRangeDraft,
          compare: { startDate, endDate },
        },
      }));
      return;
    }

    setDraft((prev) => {
      const nextPrimary = { startDate, endDate };
      const ranges = buildGa4ReportingRanges({
        primaryPreset: "custom",
        primaryCustom: nextPrimary,
        compareEnabled: prev.compareEnabled,
        compareBaseline:
          prev.compareBaseline === "custom" ? "previous_period" : prev.compareBaseline,
        compareCustom: prev.compareRangeDraft.compare,
      });
      return {
        ...prev,
        primaryPreset: "custom",
        compareRangeDraft: prev.compareEnabled
          ? ranges
          : { primary: nextPrimary, compare: nextPrimary },
      };
    });
  };

  const handleApply = () => {
    if (!validation.ok) return;
    onApply(draft);
    onOpenChange?.(false);
  };

  const handleCancel = () => {
    setDraft(value);
    onOpenChange?.(false);
  };

  const setPrimaryYmd = (patch: Partial<{ startDate: string; endDate: string }>) => {
    setDraft((prev) => {
      const primary = { ...prev.compareRangeDraft.primary, ...patch };
      const merged = { ...prev, primaryPreset: "custom" as const };
      const ranges = buildGa4ReportingRanges({
        primaryPreset: "custom",
        primaryCustom: primary,
        compareEnabled: merged.compareEnabled,
        compareBaseline: merged.compareBaseline === "custom" ? "previous_period" : merged.compareBaseline,
        compareCustom: merged.compareRangeDraft.compare,
      });
      if (!merged.compareEnabled) {
        return { ...merged, compareRangeDraft: { primary, compare: primary } };
      }
      if (merged.compareBaseline === "custom") {
        return { ...merged, compareRangeDraft: { primary, compare: merged.compareRangeDraft.compare } };
      }
      return { ...merged, compareRangeDraft: ranges };
    });
  };

  const setCompareYmd = (patch: Partial<{ startDate: string; endDate: string }>) => {
    setDraft((prev) => ({
      ...prev,
      compareBaseline: "custom",
      compareRangeDraft: {
        ...prev.compareRangeDraft,
        compare: { ...prev.compareRangeDraft.compare, ...patch },
      },
    }));
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          aria-label="Date range"
          className={cn(
            BULK_HEADER_SELECT,
            "h-8 max-w-[min(52vw,22rem)] shrink-0 justify-between gap-1.5 px-2 font-normal tabular-nums hover:bg-zinc-700",
          )}
        >
          <span className="min-w-0 truncate text-left">{triggerLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[min(calc(100vw-1rem),46rem)] border border-white/10 bg-zinc-900 p-0 shadow-lg"
      >
        <div className="flex h-[min(36rem,calc(100vh-6rem))] min-h-[22rem]">
          <div className="relative flex w-[15.5rem] shrink-0 flex-col border-r border-white/10">
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {GA4_PRIMARY_PRESET_OPTIONS.map((opt) => (
                <SidebarRow
                  key={opt.id}
                  active={presetMatchesSidebarRow(draft.primaryPreset, opt.id)}
                  label={opt.label}
                  submenu={opt.submenu}
                  disabled={busy}
                  onSelect={() => {
                    if (opt.id === "this_week_sun") {
                      setWeekSubmenu((s) => (s === "this_week" ? null : "this_week"));
                      return;
                    }
                    if (opt.id === "last_week_sun_sat") {
                      setWeekSubmenu((s) => (s === "last_week" ? null : "last_week"));
                      return;
                    }
                    setWeekSubmenu(null);
                    if (opt.id === "custom") {
                      setDraft((prev) => ({ ...prev, primaryPreset: "custom" }));
                      setCalendarTarget("primary");
                      return;
                    }
                    setCalendarTarget("primary");
                    syncFromPreset({ primaryPreset: opt.id });
                  }}
                />
              ))}
            </div>
            {weekSubmenu ? (
              <div className="absolute left-full top-12 z-50 w-[14rem] border border-white/10 bg-zinc-900 shadow-lg">
                {weekSubmenu === "this_week" ? (
                  <>
                    <SidebarRow
                      active={draft.primaryPreset === "this_week_sun"}
                      label="Sun – Today"
                      disabled={busy}
                      onSelect={() => {
                        setWeekSubmenu(null);
                        setCalendarTarget("primary");
                        syncFromPreset({ primaryPreset: "this_week_sun" });
                      }}
                    />
                    <SidebarRow
                      active={draft.primaryPreset === "this_week_mon"}
                      label="Mon – Today"
                      disabled={busy}
                      onSelect={() => {
                        setWeekSubmenu(null);
                        setCalendarTarget("primary");
                        syncFromPreset({ primaryPreset: "this_week_mon" });
                      }}
                    />
                  </>
                ) : (
                  <>
                    <SidebarRow
                      active={draft.primaryPreset === "last_week_sun_sat"}
                      label="Sun – Sat"
                      disabled={busy}
                      onSelect={() => {
                        setWeekSubmenu(null);
                        setCalendarTarget("primary");
                        syncFromPreset({ primaryPreset: "last_week_sun_sat" });
                      }}
                    />
                    <SidebarRow
                      active={draft.primaryPreset === "last_week_mon_sat"}
                      label="Mon – Sun"
                      disabled={busy}
                      onSelect={() => {
                        setWeekSubmenu(null);
                        setCalendarTarget("primary");
                        syncFromPreset({ primaryPreset: "last_week_mon_sat" });
                      }}
                    />
                  </>
                )}
              </div>
            ) : null}
            <div className="shrink-0 border-t border-white/10">
              <div className="flex items-center justify-between gap-2 px-3 py-3">
                <span className="text-base text-foreground">Compare</span>
                <CompareToggle
                  checked={draft.compareEnabled}
                  disabled={busy}
                  onChange={(compareEnabled) => syncFromPreset({ compareEnabled })}
                />
              </div>
              {draft.compareEnabled ? (
                <div className="max-h-[11rem] overflow-y-auto border-t border-white/10 pb-1">
                  {GA4_COMPARE_BASELINE_OPTIONS.map((opt) => (
                    <SidebarRow
                      key={opt.id}
                      active={draft.compareBaseline === opt.id}
                      label={opt.label}
                      disabled={busy}
                      onSelect={() => {
                        if (opt.id === "custom") {
                          setDraft((prev) => ({ ...prev, compareBaseline: "custom" }));
                          setCalendarTarget("compare");
                          return;
                        }
                        setCalendarTarget("primary");
                        syncFromPreset({ compareBaseline: opt.id });
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="shrink-0 space-y-4 border-b border-white/10 p-4">
              <div className="flex items-center gap-2">
                <Ga4OutlinedDateInput
                  label="Start date"
                  value={primaryRange.startDate}
                  max={todayYmdMax}
                  disabled={busy}
                  onFocus={() => {
                    setCalendarTarget("primary");
                    setScrollKey((k) => k + 1);
                  }}
                  onChange={(startDate) => setPrimaryYmd({ startDate })}
                />
                <span className="shrink-0 text-muted-foreground" aria-hidden>
                  –
                </span>
                <Ga4OutlinedDateInput
                  label="End date"
                  value={primaryRange.endDate}
                  max={todayYmdMax}
                  disabled={busy}
                  onFocus={() => {
                    setCalendarTarget("primary");
                    setScrollKey((k) => k + 1);
                  }}
                  onChange={(endDate) => setPrimaryYmd({ endDate })}
                />
              </div>
              {draft.compareEnabled ? (
                <div className="space-y-3">
                  <p className="text-base text-muted-foreground">Compare</p>
                  <div className="flex items-center gap-2">
                    <Ga4OutlinedDateInput
                      label="Start date"
                      value={compareRange.startDate}
                      max={todayYmdMax}
                      disabled={busy}
                      onFocus={() => {
                        setCalendarTarget("compare");
                        setScrollKey((k) => k + 1);
                      }}
                      onChange={(startDate) => setCompareYmd({ startDate })}
                    />
                    <span className="shrink-0 text-muted-foreground" aria-hidden>
                      –
                    </span>
                    <Ga4OutlinedDateInput
                      label="End date"
                      value={compareRange.endDate}
                      max={todayYmdMax}
                      disabled={busy}
                      onFocus={() => {
                        setCalendarTarget("compare");
                        setScrollKey((k) => k + 1);
                      }}
                      onChange={(endDate) => setCompareYmd({ endDate })}
                    />
                  </div>
                </div>
              ) : null}
              {!validation.ok ? (
                <p className="text-base text-destructive" role="alert">
                  {validation.error}
                </p>
              ) : null}
            </div>

            <Ga4ScrollableMonthsCalendar
              selected={calendarRange}
              onSelect={handleCalendarSelect}
              maxDate={maxDate}
              scrollToDate={scrollToDate}
              scrollKey={scrollKey}
              disabled={busy}
            />

            <div className="flex shrink-0 justify-end gap-4 border-t border-white/10 px-4 py-3">
              <Button type="button" variant="ghost" className="h-8 px-2 text-base text-primary" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-8 px-2 text-base text-primary hover:text-primary"
                disabled={busy || !validation.ok}
                onClick={handleApply}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
