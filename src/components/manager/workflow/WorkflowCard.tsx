import React, { useMemo } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WordPressSiteOption } from "@/components/manager/tasks/NewProjectDialog";
import {
  getPropertyListRowBlackIconButtonClass,
} from "@/components/integrations/wordpress/cyberpunk-theme";
import {
  workflowCardClassName,
  workflowCardDescriptionText,
  workflowClientSiteIds,
  workflowCardTitleCase,
} from "@/components/manager/workflow/forge-workflow-styles";
import type { WorkflowDefinition } from "@/lib/workflow/workflow-types";
import { Button } from "@/ui";

export type WorkflowCardProps = {
  workflow: WorkflowDefinition;
  sites?: WordPressSiteOption[];
  selected?: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
};

/** Same footprint as the trash control (h-8 w-8) so 1- and 2-digit counts never resize. */
const META_BOX_CLASS =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center bg-black text-base font-medium tabular-nums text-primary";

const TITLE_FRAME_CLASS =
  "flex min-h-10 min-w-0 flex-1 items-center overflow-hidden bg-black px-3 py-2 text-left text-base font-semibold text-primary";

export function WorkflowCard({
  workflow,
  sites = [],
  selected = false,
  onSelect,
  onDelete,
}: WorkflowCardProps): React.ReactElement {
  const clientCount = useMemo(() => {
    const available = sites.map((site) => site.id);
    return workflowClientSiteIds(workflow, available).length;
  }, [sites, workflow]);
  const description = workflowCardDescriptionText(workflow.description);
  const title = workflowCardTitleCase(workflow.name);

  return (
    <article className={workflowCardClassName(workflow.status, selected)}>
      <div className="flex min-h-0 min-w-0 gap-2">
        <Button
          variant="quiet"
          onClick={onSelect}
        >
          <span className={TITLE_FRAME_CLASS}>
            <span className="overflow-hidden whitespace-nowrap">{title}</span>
          </span>
          <p className="h-16 overflow-hidden break-words text-base leading-8 text-muted-foreground">
            {description || "\u00a0"}
          </p>
        </Button>
        <div className="flex w-8 shrink-0 flex-col gap-0 pt-1">
          {onDelete ? (
            <Button
              size="icon" icon={Trash2}
              variant="quiet"
              aria-label={`Delete ${title}`}
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
            ></Button>
          ) : (
            <span className={META_BOX_CLASS} aria-hidden />
          )}
          <span className={META_BOX_CLASS} aria-label={`${clientCount} clients`}>
            {clientCount}
          </span>
        </div>
      </div>
    </article>
  );
}
