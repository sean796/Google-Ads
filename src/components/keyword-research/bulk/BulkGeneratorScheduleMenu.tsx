import { CalendarClock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  WordPressScheduleFields,
  type WordPressScheduleFieldsProps,
} from "@/components/keyword-research/bulk/WordPressScheduleFields";
import { BULK_HEADER_ICON_TOOL_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import { formatBulkScheduleSummary } from "@/lib/bulk/bulk-schedule-summary";
import type { WordPressPostDestination } from "@/lib/bulk-auto-generate";
import { Button } from "@/ui";

export type BulkGeneratorScheduleMenuProps = WordPressScheduleFieldsProps & {
  postDestination: WordPressPostDestination;
  /** Keep schedule picker visible when export destination is local (blog import). */
  showWhenLocal?: boolean;
};

export function BulkGeneratorScheduleMenu({
  postDestination,
  isDisabled = false,
  showWhenLocal = false,
  ...scheduleProps
}: BulkGeneratorScheduleMenuProps) {
  const hidden = postDestination === "local" && !showWhenLocal;

  const summary = formatBulkScheduleSummary({
    scheduleFrequency: scheduleProps.scheduleFrequency,
    customInterval: scheduleProps.customInterval,
    dayOfWeek: scheduleProps.dayOfWeek,
    startDateOption: scheduleProps.startDateOption,
    customStartDate: scheduleProps.customStartDate,
    startTime: scheduleProps.startTime,
    draftOnly: scheduleProps.wordpressDraftOnly,
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="quiet"
          type="button"
          disabled={isDisabled || hidden}
          aria-label={hidden ? "Post schedule (WordPress only)" : `Post schedule: ${summary}`}
          title={hidden ? "Post schedule (WordPress only)" : summary}
        >
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-3" align="start">
        <p className="mb-2 text-base font-medium text-foreground">Post schedule</p>
        <WordPressScheduleFields {...scheduleProps} isDisabled={isDisabled} layout="stack" />
      </PopoverContent>
    </Popover>
  );
}
