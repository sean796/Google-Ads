import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  computeBulkScheduleStartPreset,
  type BulkScheduleStartPreset,
} from "@/lib/bulk/bulk-schedule-summary";
import {
  applyBulkScheduleStartPreset,
  bulkPresetValuesToScheduleFields,
  formatPresetLabelFromValues,
  listBulkSchedulePresets,
  loadUserBulkSchedulePresets,
  saveUserBulkSchedulePresets,
  type BulkNamedSchedulePreset,
  type BulkNamedSchedulePresetValues,
  type BulkSchedulePresetFields,
} from "@/lib/bulk/bulk-schedule-presets";
import {
  clampEveryNDays,
  clampTimesPerMonth,
  dateForPickDatePreset,
  getFirstOfThisMonthDate,
  getNextFirstOfMonthDate,
  isSameLocalCalendarDay,
  type ScheduleFrequency,
} from "@/lib/wordpress-scheduler";
import { cn } from "@/lib/utils";

const BULK_FIELD_TRIGGER =
  "h-9 w-full min-w-0 border-0 bg-muted/55 text-foreground text-base font-medium shadow-none ring-0 outline-none focus:ring-2 focus:ring-primary/45 focus:ring-offset-0 [&>span]:text-foreground";
const BULK_FIELD_INPUT =
  "h-9 w-full min-w-0 border-0 bg-muted/55 text-foreground text-base font-medium shadow-none ring-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-0";

const FORGE_FIELD_TRIGGER =
  "h-9 w-full min-w-0 border-0 bg-black text-white text-base font-medium shadow-none ring-0 outline-none focus:ring-2 focus:ring-primary/45 focus:ring-offset-0 [&>span]:text-white";
const FORGE_FIELD_INPUT =
  "h-9 w-full min-w-0 border-0 bg-black text-white text-base font-medium shadow-none ring-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-0";
const FORGE_PRESET_BTN =
  "h-auto min-h-9 whitespace-normal border-0 bg-primary/20 px-2 py-2 text-base font-medium text-white shadow-none hover:bg-primary/30";
const FORGE_SECONDARY_BTN =
  "h-9 shrink-0 border-0 bg-zinc-900 px-3 text-base font-medium text-white shadow-none hover:bg-zinc-800";

function useIntervalDraft(
  value: number,
  onCommit: (value: number) => void,
  clamp: (value: number) => number,
): {
  draft: string;
  onChange: (raw: string) => void;
  onBlur: () => void;
} {
  const [draft, setDraft] = useState(() => String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  return {
    draft,
    onChange: (raw: string) => {
      setDraft(raw);
      if (raw.trim() === "") return;
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed)) onCommit(clamp(parsed));
    },
    onBlur: () => {
      const parsed = parseInt(draft, 10);
      const next = clamp(Number.isNaN(parsed) ? 1 : parsed);
      setDraft(String(next));
      if (next !== value) onCommit(next);
    },
  };
}

export type WordPressScheduleFieldsProps = {
  scheduleFrequency: ScheduleFrequency;
  setScheduleFrequency: (value: ScheduleFrequency) => void;
  customInterval: number;
  setCustomInterval: (value: number) => void;
  dayOfWeek: number;
  setDayOfWeek: (value: number) => void;
  startDateOption: "immediate" | "custom";
  setStartDateOption: (value: "immediate" | "custom") => void;
  customStartDate: Date;
  setCustomStartDate: Dispatch<SetStateAction<Date>>;
  startTime: string;
  setStartTime: (value: string) => void;
  useCsvPublishDates: boolean;
  setUseCsvPublishDates: (value: boolean) => void;
  wordpressDraftOnly: boolean;
  setWordpressDraftOnly: (value: boolean) => void;
  localArchive?: boolean;
  setLocalArchive?: (value: boolean) => void;
  isDisabled?: boolean;
  gbpMode?: boolean;
  useGapScheduling?: boolean;
  scheduleOccupancyLoading?: boolean;
  layout?: "grid" | "stack";
  variant?: "bulk" | "forge";
  destinationModes?: ("scheduled" | "draft" | "local" | "email" | "google_drive")[];
  /** @deprecated Use emailDeliveryEnabled */
  emailPlaceholder?: boolean;
  emailDeliveryEnabled?: boolean;
  automationEmailDelivery?: boolean;
  setAutomationEmailDelivery?: (value: boolean) => void;
  googleDriveDelivery?: boolean;
  scheduledDestinationLabel?: string;
  /** When set, destination changes apply in one update (avoids flicker between modes). */
  setOutputDestinationMode?: (mode: "scheduled" | "draft" | "local" | "email" | "google_drive") => void;
  /** When set, overrides inferred destination for the select value. */
  outputDestinationMode?: "scheduled" | "draft" | "local" | "email" | "google_drive";
  /** When set, preset buttons apply all schedule fields in one update. */
  onApplySchedulePreset?: (next: BulkSchedulePresetFields) => void;
  /** Replaces legacy 3×/15× quick buttons (e.g. Standard / Lite editorial packages). */
  packageQuickPresets?: BulkNamedSchedulePreset[];
  /** Highlights the preset that matches the connected property tier. */
  activePackagePresetId?: string | null;
};

export function WordPressScheduleFields({
  scheduleFrequency,
  setScheduleFrequency,
  customInterval,
  setCustomInterval,
  dayOfWeek,
  setDayOfWeek,
  startDateOption,
  setStartDateOption,
  customStartDate,
  setCustomStartDate,
  startTime,
  setStartTime,
  useCsvPublishDates,
  setUseCsvPublishDates,
  wordpressDraftOnly,
  setWordpressDraftOnly,
  localArchive = false,
  setLocalArchive,
  isDisabled = false,
  gbpMode = false,
  useGapScheduling = false,
  scheduleOccupancyLoading = false,
  layout = "grid",
  variant = "bulk",
  destinationModes,
  emailPlaceholder = false,
  emailDeliveryEnabled = false,
  automationEmailDelivery = false,
  setAutomationEmailDelivery,
  googleDriveDelivery = false,
  scheduledDestinationLabel = "Scheduled publish",
  setOutputDestinationMode,
  outputDestinationMode,
  onApplySchedulePreset,
  packageQuickPresets,
  activePackagePresetId,
}: WordPressScheduleFieldsProps) {
  const fieldTrigger = variant === "forge" ? FORGE_FIELD_TRIGGER : BULK_FIELD_TRIGGER;
  const fieldInput = variant === "forge" ? FORGE_FIELD_INPUT : BULK_FIELD_INPUT;
  const presetBtnClass =
    variant === "forge"
      ? FORGE_PRESET_BTN
      : "h-auto min-h-9 whitespace-normal border-0 bg-primary/15 px-2 py-2 text-base font-medium text-foreground shadow-none hover:bg-primary/25";
  const secondaryBtnClass =
    variant === "forge"
      ? FORGE_SECONDARY_BTN
      : "h-9 shrink-0 border-0 bg-muted/55 px-3 text-base font-medium shadow-none hover:bg-muted/70";
  const popoverContentClass =
    variant === "forge" ? "w-auto border-0 bg-black p-0 text-white" : "w-auto p-0";
  const selectContentClass =
    variant === "forge"
      ? "z-[200] border-0 bg-zinc-900 text-white shadow-xl"
      : undefined;
  const selectItemClass =
    variant === "forge"
      ? "text-base focus:bg-zinc-800 focus:text-white data-[highlighted]:bg-zinc-800 data-[highlighted]:text-white"
      : undefined;
  const [namedPresets, setNamedPresets] = useState<BulkNamedSchedulePreset[]>(() =>
    listBulkSchedulePresets(),
  );
  const startPreset = useMemo(
    () => computeBulkScheduleStartPreset(startDateOption, customStartDate, startTime),
    [startDateOption, customStartDate, startTime],
  );
  const everyNDaysDraft = useIntervalDraft(customInterval, setCustomInterval, clampEveryNDays);
  const timesPerMonthDraft = useIntervalDraft(customInterval, setCustomInterval, clampTimesPerMonth);

  useEffect(() => {
    if (startDateOption !== "custom") return;
    setCustomStartDate((prev) => {
      const thisMonth = getFirstOfThisMonthDate(startTime);
      const nextFirst = getNextFirstOfMonthDate(startTime);
      if (isSameLocalCalendarDay(prev, thisMonth)) return thisMonth;
      if (isSameLocalCalendarDay(prev, nextFirst)) return nextFirst;
      return prev;
    });
  }, [startTime, startDateOption, setCustomStartDate]);

  const handleStartPresetChange = (value: BulkScheduleStartPreset) => {
    if (value === "immediate") {
      setStartDateOption("immediate");
      return;
    }
    setStartDateOption("custom");
    if (value === "firstOfThisMonth") {
      setCustomStartDate(getFirstOfThisMonthDate(startTime));
      return;
    }
    if (value === "firstOfNextMonth") {
      setCustomStartDate(getNextFirstOfMonthDate(startTime));
      return;
    }
    if (value === "pickDate") {
      setCustomStartDate(dateForPickDatePreset(startTime));
    }
  };

  const isImmediateFrequency = scheduleFrequency === "immediately";

  const handleFrequencyChange = (value: ScheduleFrequency) => {
    setScheduleFrequency(value);
    if (value === "immediately") {
      setUseCsvPublishDates(false);
    } else if (value === "everyNDays") {
      setCustomInterval((prev) => clampEveryNDays(prev));
    } else if (value === "custom") {
      setCustomInterval((prev) => clampTimesPerMonth(prev));
    }
  };

  const applyNamedPreset = (preset: BulkNamedSchedulePreset) => {
    const values = preset.values;
    if (onApplySchedulePreset) {
      onApplySchedulePreset(bulkPresetValuesToScheduleFields(values, customStartDate));
      if (values.scheduleFrequency === "immediately") {
        setUseCsvPublishDates(false);
      }
      return;
    }
    setScheduleFrequency(values.scheduleFrequency);
    setCustomInterval(
      values.scheduleFrequency === "custom"
        ? clampTimesPerMonth(values.customInterval)
        : values.scheduleFrequency === "everyNDays"
          ? clampEveryNDays(values.customInterval)
          : values.customInterval,
    );
    setDayOfWeek(values.dayOfWeek);
    setStartTime(values.startTime);
    if (values.scheduleFrequency === "immediately") {
      setUseCsvPublishDates(false);
    }
    const start = applyBulkScheduleStartPreset(values.startPreset, values.startTime);
    setStartDateOption(start.startDateOption);
    if (start.customStartDate) setCustomStartDate(start.customStartDate);
  };

  const saveCurrentPreset = () => {
    const values: BulkNamedSchedulePresetValues = {
      scheduleFrequency,
      customInterval,
      dayOfWeek,
      startPreset,
      startTime,
    };
    const userPresets = loadUserBulkSchedulePresets();
    saveUserBulkSchedulePresets([
      ...userPresets,
      {
        id: `user-${Date.now()}`,
        label: formatPresetLabelFromValues(values),
        values,
      },
    ]);
    setNamedPresets(listBulkSchedulePresets());
  };

  const gridClass =
    layout === "stack"
      ? "flex flex-col gap-2"
      : "grid grid-cols-1 gap-1 sm:col-span-2 sm:grid-cols-2";

  const showLocalArchive = typeof setLocalArchive === "function";
  const modes =
    destinationModes ??
    (showLocalArchive ? (["scheduled", "draft", "local", "email"] as const) : (["scheduled", "draft"] as const));
  const emailEnabled = emailDeliveryEnabled || emailPlaceholder;
  const outputMode =
    outputDestinationMode ??
    (automationEmailDelivery
      ? "email"
      : googleDriveDelivery
        ? "google_drive"
        : localArchive
          ? "local"
          : wordpressDraftOnly
            ? "draft"
            : "scheduled");
  const showPlatformSchedule =
    outputDestinationMode === "scheduled"
      ? true
      : !automationEmailDelivery && !googleDriveDelivery && !localArchive && !wordpressDraftOnly;

  const quickPresets =
    packageQuickPresets && packageQuickPresets.length > 0
      ? packageQuickPresets
      : namedPresets.slice(0, 2);

  return (
    <div className={gridClass}>
      <div className={cn("min-w-0", layout === "grid" && "sm:col-span-2")}>
        <Select
          value={outputMode}
          onValueChange={(value) => {
            const mode = value as "scheduled" | "draft" | "local" | "email" | "google_drive";
            if (setOutputDestinationMode) {
              setOutputDestinationMode(mode);
              return;
            }
            if (mode === "email") {
              setAutomationEmailDelivery?.(true);
              setLocalArchive?.(true);
              setWordpressDraftOnly(false);
              return;
            }
            setAutomationEmailDelivery?.(false);
            if (mode === "google_drive") {
              setLocalArchive?.(true);
              setWordpressDraftOnly(false);
              return;
            }
            if (mode === "local") {
              setLocalArchive?.(true);
              setWordpressDraftOnly(false);
              return;
            }
            setLocalArchive?.(false);
            setWordpressDraftOnly(mode === "draft");
          }}
          disabled={isDisabled}
        >
          <SelectTrigger className={fieldTrigger} aria-label="Run output destination">
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            side={variant === "forge" && layout === "stack" ? "top" : undefined}
            className={selectContentClass}
          >
            {modes.includes("scheduled") ? (
              <SelectItem value="scheduled" className={selectItemClass}>
                {scheduledDestinationLabel}
              </SelectItem>
            ) : null}
            {modes.includes("draft") ? (
              <SelectItem value="draft" className={selectItemClass}>
                Draft only
              </SelectItem>
            ) : null}
            {modes.includes("local") && showLocalArchive ? (
              <SelectItem value="local" className={selectItemClass}>
                Local archive
              </SelectItem>
            ) : null}
            {emailEnabled && modes.includes("email") ? (
              <SelectItem value="email" className={selectItemClass}>
                Email
              </SelectItem>
            ) : null}
            {modes.includes("google_drive") ? (
              <SelectItem value="google_drive" className={selectItemClass}>
                Google Drive
              </SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      </div>
      {!showPlatformSchedule ? null : (
        <>
      {quickPresets.length > 0 ? (
        <div className={cn("grid min-w-0 grid-cols-2 gap-2", layout === "grid" && "sm:col-span-2")}>
          {quickPresets.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              variant="secondary"
              className={cn(
                presetBtnClass,
                activePackagePresetId === preset.id &&
                  "ring-2 ring-primary ring-offset-2 ring-offset-background",
              )}
              disabled={isDisabled}
              onClick={() => applyNamedPreset(preset)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      ) : null}
      <div className={cn("flex min-w-0 gap-2", layout === "grid" && "sm:col-span-2")}>
        <Select
          onValueChange={(id) => {
            const preset = namedPresets.find((item) => item.id === id);
            if (preset) applyNamedPreset(preset);
          }}
          disabled={isDisabled}
        >
          <SelectTrigger className={fieldTrigger} aria-label="Saved schedule presets">
            <SelectValue placeholder="Saved presets" />
          </SelectTrigger>
          <SelectContent className={selectContentClass}>
            {namedPresets.map((preset) => (
              <SelectItem key={preset.id} value={preset.id} className={selectItemClass}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="secondary"
          className={secondaryBtnClass}
          disabled={isDisabled}
          onClick={saveCurrentPreset}
        >
          Save preset
        </Button>
      </div>
      <div className="min-w-0">
        <Select
          value={scheduleFrequency}
          onValueChange={(value: ScheduleFrequency) => handleFrequencyChange(value)}
          disabled={isDisabled}
        >
          <SelectTrigger className={fieldTrigger} aria-label="Post frequency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={selectContentClass}>
            <SelectItem value="immediately" className={selectItemClass}>
              Immediately
            </SelectItem>
            <SelectItem value="daily" className={selectItemClass}>
              Daily
            </SelectItem>
            <SelectItem value="weekly" className={selectItemClass}>
              Weekly
            </SelectItem>
            <SelectItem value="monthly" className={selectItemClass}>
              Monthly
            </SelectItem>
            <SelectItem value="everyNDays" className={selectItemClass}>
              Every N days
            </SelectItem>
            <SelectItem value="custom" className={selectItemClass}>
              Times per month
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {scheduleFrequency === "everyNDays" ? (
        <div className="min-w-0">
          <Input
            type="number"
            min={1}
            max={365}
            value={everyNDaysDraft.draft}
            onChange={(e) => everyNDaysDraft.onChange(e.target.value)}
            onBlur={everyNDaysDraft.onBlur}
            disabled={isDisabled}
            className={fieldInput}
            aria-label="Every N days"
          />
        </div>
      ) : null}

      {scheduleFrequency === "weekly" ? (
        <div className={cn("min-w-0", layout === "grid" && "sm:col-span-2")}>
          <Select
            value={dayOfWeek.toString()}
            onValueChange={(value) => setDayOfWeek(parseInt(value, 10))}
            disabled={isDisabled}
          >
            <SelectTrigger className={fieldTrigger} aria-label="Day of week">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={selectContentClass}>
              <SelectItem value="0" className={selectItemClass}>Sunday</SelectItem>
              <SelectItem value="1" className={selectItemClass}>Monday</SelectItem>
              <SelectItem value="2" className={selectItemClass}>Tuesday</SelectItem>
              <SelectItem value="3" className={selectItemClass}>Wednesday</SelectItem>
              <SelectItem value="4" className={selectItemClass}>Thursday</SelectItem>
              <SelectItem value="5" className={selectItemClass}>Friday</SelectItem>
              <SelectItem value="6" className={selectItemClass}>Saturday</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {scheduleFrequency === "custom" ? (
        <div className="min-w-0">
          <Input
            type="number"
            min="1"
            max="31"
            value={timesPerMonthDraft.draft}
            onChange={(e) => timesPerMonthDraft.onChange(e.target.value)}
            onBlur={timesPerMonthDraft.onBlur}
            disabled={isDisabled}
            className={fieldInput}
            aria-label="Times per month"
          />
        </div>
      ) : null}

      {!isImmediateFrequency ? (
        <>
          <div className="min-w-0">
            <Select
              value={startPreset}
              onValueChange={(v) => handleStartPresetChange(v as BulkScheduleStartPreset)}
              disabled={isDisabled}
            >
              <SelectTrigger className={fieldTrigger} aria-label="Start date preset">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={selectContentClass}>
                <SelectItem value="immediate" className={selectItemClass}>
                  Next available slot
                </SelectItem>
                <SelectItem value="firstOfThisMonth" className={selectItemClass}>
                  First of this month
                </SelectItem>
                <SelectItem value="firstOfNextMonth" className={selectItemClass}>
                  First of next month
                </SelectItem>
                <SelectItem value="pickDate" className={selectItemClass}>
                  Pick a date
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={isDisabled}
              className={cn(fieldInput, "tabular-nums")}
              aria-label="Post time"
            />
          </div>
        </>
      ) : null}

      {!isImmediateFrequency && startDateOption === "custom" && startPreset === "pickDate" ? (
        <div className={cn("min-w-0", layout === "grid" && "sm:col-span-2")}>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="secondary"
                className={cn(
                  fieldTrigger,
                  "justify-start border-0 text-left font-medium shadow-none",
                  variant === "forge" ? "hover:bg-zinc-900" : "hover:bg-muted/65",
                )}
                disabled={isDisabled}
                aria-label="Pick start date"
              >
                <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-90" />
                {customStartDate ? format(customStartDate, "PPP") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className={popoverContentClass} align="start">
              <Calendar
                mode="single"
                selected={customStartDate}
                onSelect={(date) => date && setCustomStartDate(date)}
                initialFocus
                className={cn("rounded-none text-base", variant === "forge" && "bg-black text-white")}
              />
            </PopoverContent>
          </Popover>
        </div>
      ) : null}

      {useGapScheduling && scheduleOccupancyLoading ? (
        <p className={cn("text-base text-muted-foreground", layout === "grid" && "sm:col-span-2")}>
          Loading WordPress post inventory for gap scheduling…
        </p>
      ) : null}
        </>
      )}
    </div>
  );
}
