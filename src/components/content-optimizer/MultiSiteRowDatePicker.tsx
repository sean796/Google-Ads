import { useMemo } from "react";


import { CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_RIGHT_CELL } from "@/components/overview/overview-tab/overview-tab-content-constants";
import {
  formatMultiSiteCompletedAtLabel,
  isoToLocalCalendarDate,
  localCalendarDateToIso,
} from "@/lib/content-optimization/multi-site-last-completed-at";
import type { MultiSiteUrlSource } from "@/lib/content-optimization/multi-site-source-urls";
import { cn } from "@/lib/utils";
import { Button, Calendar, Popover, PopoverContent, PopoverTrigger } from "@/ui";

export type MultiSiteRowDatePickerProps = {
  siteId: string;
  source: MultiSiteUrlSource;
  activityIso: string | undefined;
  fallbackLabel: string;
  title?: string;
  disabled?: boolean;
  onPick: (siteId: string, source: MultiSiteUrlSource, iso: string) => void;
};

export function MultiSiteRowDatePicker({
  siteId,
  source,
  activityIso,
  fallbackLabel,
  title,
  disabled = false,
  onPick,
}: MultiSiteRowDatePickerProps) {
  const label = formatMultiSiteCompletedAtLabel(activityIso) ?? fallbackLabel;
  const selected = useMemo(() => isoToLocalCalendarDate(activityIso), [activityIso]);

  if (disabled) {
    return (
      <div className="flex min-w-0 flex-1 items-center self-stretch">
        <div className={CONTENT_OPTIMIZER_MULTI_SITE_CLUSTER_RIGHT_CELL} title={title}>
          <span className="break-words !text-white">{label}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center self-stretch">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="quiet"
            type="button"
            title={title ?? "Pick row date"}
            aria-label={`Set date for this row. Current: ${label}`}
          >
            <span className="min-w-0 break-words text-left !text-white">{label}</span>
          </Button>
        </PopoverTrigger>
      <PopoverContent className="w-auto border-0 bg-popover p-0" align="end">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (!date) return;
            onPick(siteId, source, localCalendarDateToIso(date));
          }}
          initialFocus
        />
      </PopoverContent>
      </Popover>
    </div>
  );
}
