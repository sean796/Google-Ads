import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";


import { Button, Field, Pill, SelectField, Calendar, Popover, PopoverContent, PopoverTrigger } from "@/ui";
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

const DESTINATION_LABELS = {
  draft: "Draft only",
  local: "Local archive",
  email: "Email",
  google_drive: "Google Drive",
} as const;

const FREQUENCY_OPTIONS = [
  { value: "immediately", label: "Immediately" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "everyNDays", label: "Every N days" },
  { value: "custom", label: "Times per month" },
];

const DAY_OPTIONS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
  (label, i) => ({ value: String(i), label }),
);

const START_PRESET_OPTIONS = [
  { value: "immediate", label: "Next available slot" },
  { value: "firstOfThisMonth", label: "First of this month" },
  { value: "firstOfNextMonth", label: "First of next month" },
  { value: "pickDate", label: "Pick a date" },
];
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
      setCustomInterval(clampEveryNDays(customInterval));
    } else if (value === "custom") {
      setCustomInterval(clampTimesPerMonth(customInterval));
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

  const destinationOptions = [
    ...(modes.includes("scheduled") ? [{ value: "scheduled", label: scheduledDestinationLabel }] : []),
    ...(modes.includes("draft") ? [{ value: "draft", label: DESTINATION_LABELS.draft }] : []),
    ...(modes.includes("local") && showLocalArchive ? [{ value: "local", label: DESTINATION_LABELS.local }] : []),
    ...(emailEnabled && modes.includes("email") ? [{ value: "email", label: DESTINATION_LABELS.email }] : []),
    ...(modes.includes("google_drive")
      ? [{ value: "google_drive", label: DESTINATION_LABELS.google_drive }]
      : []),
  ];

  const handleDestinationChange = (value: string) => {
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
  };

  return (
    <div className={gridClass}>
      <div className={cn("min-w-0", layout === "grid" && "sm:col-span-2")}>
        <SelectField
          placeholder="Run output destination"
          width="full"
          value={outputMode}
          disabled={isDisabled}
          options={destinationOptions}
          onValueChange={handleDestinationChange}
        />
      </div>
      {!showPlatformSchedule ? null : (
        <>
          {quickPresets.length > 0 ? (
            <div className={cn("flex min-w-0 flex-wrap gap-1", layout === "grid" && "sm:col-span-2")}>
              {quickPresets.map((preset) => (
                <Pill
                  key={preset.id}
                  square
                  label={preset.label}
                  active={activePackagePresetId === preset.id}
                  disabled={isDisabled}
                  onClick={() => applyNamedPreset(preset)}
                />
              ))}
            </div>
          ) : null}
          <div className={cn("flex min-w-0 gap-2", layout === "grid" && "sm:col-span-2")}>
            <SelectField
              placeholder="Saved presets"
              width="full"
              value=""
              disabled={isDisabled}
              options={namedPresets.map((preset) => ({ value: preset.id, label: preset.label }))}
              onValueChange={(id) => {
                const preset = namedPresets.find((item) => item.id === id);
                if (preset) applyNamedPreset(preset);
              }}
            />
            <Button disabled={isDisabled} onClick={saveCurrentPreset}>
              Save preset
            </Button>
          </div>
          <div className="min-w-0">
            <SelectField
              placeholder="Post frequency"
              width="full"
              value={scheduleFrequency}
              disabled={isDisabled}
              options={FREQUENCY_OPTIONS}
              onValueChange={(value) => handleFrequencyChange(value as ScheduleFrequency)}
            />
          </div>

          {scheduleFrequency === "everyNDays" ? (
            <div className="min-w-0">
              <Field
                type="number"
                min={1}
                max={365}
                placeholder="Every N days"
                value={everyNDaysDraft.draft}
                onChange={(e) => everyNDaysDraft.onChange(e.target.value)}
                onBlur={everyNDaysDraft.onBlur}
                disabled={isDisabled}
              />
            </div>
          ) : null}

          {scheduleFrequency === "weekly" ? (
            <div className={cn("min-w-0", layout === "grid" && "sm:col-span-2")}>
              <SelectField
                placeholder="Day of week"
                width="full"
                value={dayOfWeek.toString()}
                disabled={isDisabled}
                options={DAY_OPTIONS}
                onValueChange={(value) => setDayOfWeek(parseInt(value, 10))}
              />
            </div>
          ) : null}

          {scheduleFrequency === "custom" ? (
            <div className="min-w-0">
              <Field
                type="number"
                min="1"
                max="31"
                placeholder="Times per month"
                value={timesPerMonthDraft.draft}
                onChange={(e) => timesPerMonthDraft.onChange(e.target.value)}
                onBlur={timesPerMonthDraft.onBlur}
                disabled={isDisabled}
              />
            </div>
          ) : null}

          {!isImmediateFrequency ? (
            <>
              <div className="min-w-0">
                <SelectField
                  placeholder="Start date preset"
                  width="full"
                  value={startPreset}
                  disabled={isDisabled}
                  options={START_PRESET_OPTIONS}
                  onValueChange={(v) => handleStartPresetChange(v as BulkScheduleStartPreset)}
                />
              </div>
              <div className="min-w-0">
                <Field
                  type="time"
                  placeholder="Post time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={isDisabled}
                />
              </div>
            </>
          ) : null}

          {!isImmediateFrequency && startDateOption === "custom" && startPreset === "pickDate" ? (
            <div className={cn("min-w-0", layout === "grid" && "sm:col-span-2")}>
              <Popover>
                <PopoverTrigger asChild>
                  <Button icon={CalendarIcon} disabled={isDisabled} aria-label="Pick start date">
                    {customStartDate ? format(customStartDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customStartDate}
                    onSelect={(date) => date && setCustomStartDate(date)}
                    initialFocus
                    className="rounded-none text-base"
                  />
                </PopoverContent>
              </Popover>
            </div>
          ) : null}

          {useGapScheduling && scheduleOccupancyLoading ? (
            <p className={cn("text-base text-muted-foreground", layout === "grid" && "sm:col-span-2")}>
              Loading WordPress post inventory for gap scheduling
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}