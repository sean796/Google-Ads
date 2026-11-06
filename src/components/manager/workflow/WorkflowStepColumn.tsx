import React, { useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { WordPressSiteOption } from "@/components/manager/tasks/NewProjectDialog";
import { WorkflowInsertMenu } from "@/components/manager/workflow/WorkflowInsertMenu";
import { WorkflowStepCard } from "@/components/manager/workflow/WorkflowStepCard";
import {
  WORKFLOW_BUILDER_CANVAS_CLASS,
  WORKFLOW_COLUMN_CLASS,
  WORKFLOW_CONNECTOR_CLASS,
  WORKFLOW_INSERT_BTN_CLASS,
  WORKFLOW_ADD_STEP_ROW_CLASS,
} from "@/components/manager/workflow/forge-workflow-styles";
import { linearOrderedNodes } from "@/lib/workflow/workflow-graph-mutations";
import { resolveWorkflowStepForgeRoute } from "@/lib/workflow/workflow-step-navigation";
import type { AutomationRecipeCatalogItem } from "@/lib/automation-recipes-types";
import type { WorkflowDefinition, WorkflowNode, WorkflowNodeKind } from "@/lib/workflow/workflow-types";
import {
  isWorkflowClientKind,
  isWorkflowTriggerKind,
} from "@/lib/workflow/workflow-types";
import { Button } from "@/ui";

export type WorkflowStepColumnProps = {
  teamId: number;
  workflow: Pick<WorkflowDefinition, "nodes" | "edges">;
  sites: WordPressSiteOption[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onOpenStepDeepLink?: (node: WorkflowNode) => void;
  onAddStep: (kind: WorkflowNodeKind, afterNodeId: string | null) => void;
  onAddActionAgentPreset: (presetId: string, afterNodeId: string | null) => void;
  onAddRecipe: (recipe: AutomationRecipeCatalogItem, afterNodeId: string | null) => void;
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
};

function renderStepBlock(
  nodes: WorkflowNode[],
  ordered: WorkflowNode[],
  args: Omit<
    WorkflowStepColumnProps,
    "teamId" | "workflow" | "onAddStep" | "onAddActionAgentPreset" | "onAddRecipe"
  > & {
    onInsertAfter: (nodeId: string) => void;
  },
): React.ReactElement[] {
  const {
    sites,
    selectedNodeId,
    onSelectNode,
    onOpenStepDeepLink,
    onDeleteNode,
    onDuplicateNode,
    onInsertAfter,
  } = args;

  return nodes.flatMap((node) => {
    const stepNumber = ordered.findIndex((item) => item.id === node.id) + 1;
    return [
      <WorkflowStepCard
        key={node.id}
        node={node}
        stepNumber={stepNumber}
        selected={selectedNodeId === node.id}
        sites={sites}
        onSelect={() => onSelectNode(node.id)}
        deepLinkEnabled={resolveWorkflowStepForgeRoute(node) != null}
        onOpenDeepLink={onOpenStepDeepLink ? () => onOpenStepDeepLink(node) : undefined}
        onDelete={
          isWorkflowClientKind(node.kind) ? undefined : () => onDeleteNode(node.id)
        }
        onDuplicate={
          isWorkflowTriggerKind(node.kind) || isWorkflowClientKind(node.kind)
            ? undefined
            : () => onDuplicateNode(node.id)
        }
      />,
      <div key={`${node.id}-insert`} className="flex flex-col items-center">
        <div className={WORKFLOW_CONNECTOR_CLASS} aria-hidden />
        <Button
          size="icon" icon={Plus}
          variant="quiet"
          aria-label={`Add step after ${node.label}`}
          onClick={() => onInsertAfter(node.id)}
        ></Button>
        <div className={WORKFLOW_CONNECTOR_CLASS} aria-hidden />
      </div>,
    ];
  });
}

export function WorkflowStepColumn({
  teamId,
  workflow,
  sites,
  selectedNodeId,
  onSelectNode,
  onOpenStepDeepLink,
  onAddStep,
  onAddActionAgentPreset,
  onAddRecipe,
  onDeleteNode,
  onDuplicateNode,
}: WorkflowStepColumnProps): React.ReactElement {
  const ordered = linearOrderedNodes(workflow);
  const [insertAfterId, setInsertAfterId] = useState<string | null | undefined>(undefined);
  const insertAfterIdRef = useRef<string | null>(null);

  const openInsertMenu = (afterNodeId: string | null) => {
    insertAfterIdRef.current = afterNodeId;
    setInsertAfterId(afterNodeId);
  };

  const blockArgs = {
    sites,
    selectedNodeId,
    onSelectNode,
    onOpenStepDeepLink,
    onDeleteNode,
    onDuplicateNode,
    onInsertAfter: (nodeId: string) => openInsertMenu(nodeId),
  };

  return (
    <div className={WORKFLOW_BUILDER_CANVAS_CLASS}>
      <div className={WORKFLOW_COLUMN_CLASS}>
        {renderStepBlock(ordered, ordered, blockArgs)}
        <Button
          variant="quiet"
          onClick={() => openInsertMenu(null)}
        >
          <Plus className="h-4 w-4 text-primary" />
          Add step
        </Button>
      </div>

      <WorkflowInsertMenu
        teamId={teamId}
        open={insertAfterId !== undefined}
        insertAnchorNodeId={insertAfterId ?? null}
        onOpenChange={(open) => {
          if (!open) {
            insertAfterIdRef.current = null;
            setInsertAfterId(undefined);
          }
        }}
        onAddStep={onAddStep}
        onAddActionAgentPreset={onAddActionAgentPreset}
        onAddRecipe={onAddRecipe}
      />
    </div>
  );
}
