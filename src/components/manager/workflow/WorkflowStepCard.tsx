import React, { useMemo } from "react";
import { Copy, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPropertyListRowIconButtonHoverGlowClass } from "@/components/integrations/wordpress/cyberpunk-theme";
import type { WordPressSiteOption } from "@/components/manager/tasks/NewProjectDialog";
import {
  WORKFLOW_STEP_ACTION_BAR_CLASS,
  WORKFLOW_STEP_ACTION_BTN_CLASS,
  WORKFLOW_STEP_ACTION_SLOT_CLASS,
  WORKFLOW_STEP_TYPE_ICON_CLASS,
  WORKFLOW_STEP_TYPE_ICON_SLOT_CLASS,
  WORKFLOW_STEP_UTILITY_ICON_CLASS,
  workflowKindBadgeClass,
  workflowStepCardClass,
} from "@/components/manager/workflow/forge-workflow-styles";
import { workflowClientPublishSummary, workflowClientSiteSummary } from "@/lib/workflow/workflow-client-config";
import { defaultNodeLabel } from "@/lib/workflow/workflow-graph-utils";
import { workflowStepIconForNode } from "@/lib/workflow/workflow-step-icons";
import { thenEmailDisplayLabel } from "@/lib/workflow/workflow-then-utils";
import { workflowStepForgeRouteLabel } from "@/lib/workflow/workflow-step-navigation";
import type { WorkflowClientConfig, WorkflowNode } from "@/lib/workflow/workflow-types";
import {
  isWorkflowClientKind,
  isWorkflowTriggerKind,
  workflowTriggerLabel,
} from "@/lib/workflow/workflow-types";
import { Button } from "@/ui";

function ActionSlot({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn(WORKFLOW_STEP_ACTION_SLOT_CLASS, className)}>
      {children}
    </div>
  );
}

export type WorkflowStepCardProps = {
  node: WorkflowNode;
  stepNumber: number;
  selected?: boolean;
  sites?: WordPressSiteOption[];
  onSelect: () => void;
  onOpenDeepLink?: () => void;
  deepLinkEnabled?: boolean;
  onDelete?: () => void;
  onDuplicate?: () => void;
};

export function WorkflowStepCard({
  node,
  stepNumber,
  selected = false,
  sites = [],
  onSelect,
  onOpenDeepLink,
  deepLinkEnabled = false,
  onDelete,
  onDuplicate,
}: WorkflowStepCardProps): React.ReactElement {
  const recipeCategory = (node.config as { recipeCategory?: string }).recipeCategory;
  const clientConfig = node.config as WorkflowClientConfig;
  const primaryClientSiteId = clientConfig.siteIds?.[0];
  const isClientStep = isWorkflowClientKind(node.kind);
  const kindLabel = isWorkflowTriggerKind(node.kind)
    ? workflowTriggerLabel(node.kind)
    : isClientStep
      ? workflowTriggerLabel(node.kind)
      : defaultNodeLabel(node.kind);

  const clientSiteSummary = useMemo(() => {
    if (!isClientStep) return null;
    return workflowClientSiteSummary(clientConfig, sites);
  }, [clientConfig, isClientStep, sites]);

  const clientPublishSummary = useMemo(() => {
    if (!isClientStep) return null;
    return workflowClientPublishSummary(clientConfig);
  }, [clientConfig, isClientStep]);

  const primaryTitle = useMemo(() => {
    if (isClientStep) {
      const label = node.label.trim();
      if (label && label !== kindLabel) return label;
      return clientSiteSummary ?? kindLabel;
    }
    if (node.kind === "then_email") return thenEmailDisplayLabel(node);
    return node.label;
  }, [clientSiteSummary, isClientStep, kindLabel, node]);

  const typeIcon = workflowStepIconForNode(node, primaryClientSiteId);
  const typeIconClassName = cn(typeIcon.className, WORKFLOW_STEP_TYPE_ICON_CLASS);
  const showForgeLink =
    deepLinkEnabled && onOpenDeepLink && node.kind === "action_agent";
  const showUtilityBar = Boolean(onDelete || onDuplicate);

  return (
    <div
      className={cn(
        workflowStepCardClass({
          kind: node.kind,
          selected,
          recipeCategory,
          clientSiteId: primaryClientSiteId,
        }),
        "flex flex-col p-0",
      )}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-base text-muted-foreground">Step {stepNumber}</span>
            <span className={workflowKindBadgeClass(node.kind, primaryClientSiteId)}>
              {kindLabel}
            </span>
          </div>
          <p className="text-base font-semibold text-white">{primaryTitle}</p>
          {clientPublishSummary ? (
            <p className="mt-1 text-base tabular-nums text-muted-foreground">{clientPublishSummary}</p>
          ) : null}
        </div>
        <div className={WORKFLOW_STEP_TYPE_ICON_SLOT_CLASS}>
          {showForgeLink ? (
            <Button
              variant="quiet"
              aria-label={workflowStepForgeRouteLabel(node)}
              onClick={(event) => {
                event.stopPropagation();
                onOpenDeepLink();
              }}
            >
              <typeIcon.Icon className={typeIconClassName} aria-hidden />
            </Button>
          ) : (
            <typeIcon.Icon className={typeIconClassName} aria-hidden />
          )}
        </div>
      </div>
      {showUtilityBar ? (
        <div className={WORKFLOW_STEP_ACTION_BAR_CLASS}>
          <ActionSlot>
            {onDelete ? (
              <Button
                size="icon" icon={Trash2}
                variant="quiet"
                aria-label={`Delete ${node.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
              ></Button>
            ) : null}
          </ActionSlot>
          <ActionSlot>
            {onDuplicate ? (
              <Button
                size="icon" icon={Copy}
                variant="quiet"
                aria-label="Duplicate step"
                onClick={(event) => {
                  event.stopPropagation();
                  onDuplicate();
                }}
              ></Button>
            ) : null}
          </ActionSlot>
        </div>
      ) : null}
    </div>
  );
}
