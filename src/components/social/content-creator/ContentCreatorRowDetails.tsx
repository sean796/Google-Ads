
import {
  META_VISUAL_CELL_CLASS,
  META_VISUAL_GRID_CLASS,
  META_VISUAL_TEXTAREA_CLASS,
  metaVisualSettingsRowClass,
} from "@/components/ppc/meta/meta-ads-visual-settings-layout";
import type { ContentCalendarRow } from "@/lib/social/content-creator-types";
import { cellString } from "@/lib/social/content-creator-types";
import { cn } from "@/lib/utils";
import { Field, TextareaField } from "@/ui";

export type ContentCreatorRowDetailsProps = {
  row: ContentCalendarRow;
  panelId?: string;
  fieldsReadOnly?: boolean;
  onUpdateRow: (patch: Partial<ContentCalendarRow>) => void;
};

export function ContentCreatorRowDetails({
  row,
  panelId,
  fieldsReadOnly,
  onUpdateRow,
}: ContentCreatorRowDetailsProps) {
  const dateLabel = cellString(row.date);
  const dayLabel = cellString(row.dayOfWeek);
  const scheduleLabel =
    dateLabel.length > 0 && dayLabel.length > 0
      ? `${dateLabel} · ${dayLabel}`
      : dateLabel.length > 0
        ? dateLabel
        : dayLabel;

  return (
    <div className="flex flex-col gap-3 px-0 pb-3 pt-0 sm:px-0" id={panelId}>
      {scheduleLabel.length > 0 ? (
        <div className={cn(metaVisualSettingsRowClass(0), META_VISUAL_GRID_CLASS, "items-center")}>
          <span className={cn(META_VISUAL_CELL_CLASS, "text-base font-semibold text-foreground")}>
            Schedule
          </span>
          <span className="col-span-3 text-base text-muted-foreground">{scheduleLabel}</span>
        </div>
      ) : null}

      <div
        className={cn(
          metaVisualSettingsRowClass(scheduleLabel.length > 0 ? 1 : 0),
          META_VISUAL_GRID_CLASS,
          "items-start",
        )}
      >
        <span className={cn(META_VISUAL_CELL_CLASS, "pt-2 text-base font-semibold text-foreground")}>
          Events
        </span>
        <Field
          value={row.events ?? ""}
          placeholder="Event or holiday"
          aria-label="Events"
          disabled={fieldsReadOnly}
          onChange={(e) => onUpdateRow({ events: e.target.value })}
        />
      </div>

      <div className={cn(metaVisualSettingsRowClass(2), META_VISUAL_GRID_CLASS, "items-start")}>
        <span className={cn(META_VISUAL_CELL_CLASS, "pt-2 text-base font-semibold text-foreground")}>
          FB/Instagram Content
        </span>
        <TextareaField
          value={row.fbInstagramContent ?? ""}
          placeholder="Facebook and Instagram post copy"
          aria-label="FB/Instagram Content"
          disabled={fieldsReadOnly}
          onChange={(e) => onUpdateRow({ fbInstagramContent: e.target.value })}
        />
      </div>

      <div className={cn(metaVisualSettingsRowClass(3), META_VISUAL_GRID_CLASS, "items-start")}>
        <span className={cn(META_VISUAL_CELL_CLASS, "pt-2 text-base font-semibold text-foreground")}>
          LinkedIn Content
        </span>
        <TextareaField
          value={row.linkedinContent ?? ""}
          placeholder="LinkedIn post copy"
          aria-label="LinkedIn Content"
          disabled={fieldsReadOnly}
          onChange={(e) => onUpdateRow({ linkedinContent: e.target.value })}
        />
      </div>

      <div className={cn(metaVisualSettingsRowClass(4), META_VISUAL_GRID_CLASS, "items-start")}>
        <span className={cn(META_VISUAL_CELL_CLASS, "pt-2 text-base font-semibold text-foreground")}>
          Prompt Modifier
        </span>
        <TextareaField
          value={row.promptModifier ?? ""}
          placeholder="Image prompt modifier"
          aria-label="Prompt Modifier"
          disabled={fieldsReadOnly}
          onChange={(e) => onUpdateRow({ promptModifier: e.target.value })}
        />
      </div>
    </div>
  );
}
