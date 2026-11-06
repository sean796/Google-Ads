import React, { useMemo } from "react";
import { Calendar, Settings, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskProject, TeamTask } from "@/lib/tasks-types";
import { AutomationTaskExecuteButton } from "@/components/manager/tasks/AutomationTaskExecuteButton";
import { automationCardClassName } from "@/components/manager/pulse-forge/forge-recipe-styles";
import { forgeClientColorUnique } from "@/lib/pulse-forge/forge-client-colors";
import { formatAutomationDisplayTitle } from "@/lib/pulse-forge/forge-automation-row-meta";
import {
  getPropertyListRowBlackIconButtonClass,
  getPropertyListRowIconButtonHoverGlowClass,
} from "@/components/integrations/wordpress/cyberpunk-theme";


import { Button, Popover, PopoverContent, PopoverTrigger, Checkbox } from "@/ui";

const FORGE_AUTOMATION_SELECT_CHECKBOX_CLASS =
  "border-white/50 data-[state=checked]:border-white data-[state=checked]:bg-white data-[state=checked]:text-black";

export type ForgeAutomationListTileProps = {
  title: string;
  siteId?: string;
  siteName: string;
  scheduleLabel?: string;
  compareLabel?: string;
  executionTimeLabel?: string;
  active: boolean;
  demoMode?: boolean;
  project?: TaskProject;
  teamId?: number | null;
  task?: TeamTask | null;
  showExecute?: boolean;
  visibilityLabel?: string;
  onOpenSettings?: () => void;
  onDelete?: () => void;
  onExecuted?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
};

const FORGE_AUTOMATION_TILE_ICON_CLASS = getPropertyListRowBlackIconButtonClass(true);

function planDetailRows(props: {
  scheduleLabel?: string;
  compareLabel?: string;
  executionTimeLabel?: string;
  visibilityLabel?: string;
}): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (props.scheduleLabel && props.scheduleLabel !== "—") {
    rows.push({ label: "Schedule", value: props.scheduleLabel });
  }
  if (props.compareLabel && props.compareLabel !== "—") {
    rows.push({ label: "Compare", value: props.compareLabel });
  }
  if (props.executionTimeLabel && props.executionTimeLabel !== "—") {
    rows.push({ label: "Time", value: props.executionTimeLabel });
  }
  if (props.visibilityLabel?.trim()) {
    rows.push({ label: "Visibility", value: props.visibilityLabel });
  }
  return rows;
}

export function ForgeAutomationListTile({
  title,
  siteId = "",
  siteName,
  scheduleLabel,
  compareLabel,
  executionTimeLabel,
  active,
  demoMode = false,
  visibilityLabel,
  project,
  teamId = null,
  task = null,
  showExecute = false,
  onOpenSettings,
  onDelete,
  onExecuted,
  selectable = false,
  selected = false,
  onSelectedChange,
}: ForgeAutomationListTileProps): React.ReactElement {
  const interactive = !demoMode && Boolean(onOpenSettings);
  const clientColor = forgeClientColorUnique(siteId, siteName);
  const displayTitle = formatAutomationDisplayTitle(title, siteName);
  const planRows = useMemo(
    () =>
      planDetailRows({
        scheduleLabel,
        compareLabel,
        executionTimeLabel,
        visibilityLabel,
      }),
    [compareLabel, executionTimeLabel, scheduleLabel, visibilityLabel],
  );

  return (
    <>
      <article
        className={cn(
          automationCardClassName(siteId, active, siteName),
          "flex min-w-0 flex-col gap-1.5 p-2",
          demoMode && "opacity-95",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {selectable ? (
            <Checkbox
              checked={selected}
              onCheckedChange={(value) => {
                if (value === "indeterminate") return;
                onSelectedChange?.(value === true);
              }}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              className={FORGE_AUTOMATION_SELECT_CHECKBOX_CLASS}
              aria-label={`Select ${displayTitle}`}
            />
          ) : null}
          <span className={cn("min-w-0 flex-1 break-words text-base font-medium", clientColor.textClass)}>
            {siteName}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {showExecute && task ? (
              <AutomationTaskExecuteButton
                teamId={teamId}
                taskId={task.id}
                task={task}
                project={project ?? null}
                variant="icon"
                className={cn(
                  FORGE_AUTOMATION_TILE_ICON_CLASS,
                  getPropertyListRowIconButtonHoverGlowClass("powerOn"),
                )}
                onExecuted={onExecuted}
              />
            ) : null}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="icon" icon={Calendar}
                  variant="quiet"
                  aria-label={`View schedule for ${displayTitle}`}
                ></Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-56 rounded-none border-0 bg-black p-3 text-white shadow-tile"
              >
                {planRows.length > 0 ? (
                  <dl className="flex flex-col gap-2">
                    {planRows.map((row) => (
                      <div key={row.label} className="flex flex-col gap-0.5">
                        <dt className="text-base text-muted-foreground">{row.label}</dt>
                        <dd className="text-base text-white">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-base text-muted-foreground">No schedule set</p>
                )}
              </PopoverContent>
            </Popover>
            <Button
              size="icon" icon={Settings}
              variant="quiet"
              aria-label={`Open plan for ${displayTitle}`}
              disabled={demoMode}
              onClick={onOpenSettings}
            ></Button>
            <Button
              size="icon" icon={Trash2}
              variant="quiet"
              aria-label={`Delete ${displayTitle}`}
              disabled={demoMode}
              onClick={() => {
                if (demoMode || !onDelete) return;
                onDelete();
              }}
            ></Button>
          </div>
        </div>

        <Button
          variant="quiet"
          disabled={!interactive}
          onClick={onOpenSettings}
        >
          <h3 className="break-words text-base font-semibold text-white">{displayTitle}</h3>
        </Button>
      </article>
    </>
  );
}
