import React, { useEffect, useState } from "react";
import type { WordPressSiteOption } from "@/components/manager/tasks/NewProjectDialog";
import { WorkflowNodeInspector } from "@/components/manager/workflow/WorkflowNodeInspector";
import { WorkflowRagSidebar } from "@/components/manager/workflow/WorkflowRagSidebar";
import {
  WORKFLOW_RIGHT_RAIL_CLASS,
  WORKFLOW_RAIL_TAB_CLASS,
  WORKFLOW_SIDEBAR_BG_CLASS,
  WORKFLOW_SIDEBAR_FIELD_CLASS,
} from "@/components/manager/workflow/forge-workflow-styles";
import type { WorkflowEdge, WorkflowNode, WorkflowRagVariable } from "@/lib/workflow/workflow-types";
import type { WorkflowStepTestResult } from "@/lib/workflow/workflow-step-test";
import { cn } from "@/lib/utils";

export type WorkflowRightRailProps = {
  teamId: number;
  workflowId: number;
  sites: WordPressSiteOption[];
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNode: WorkflowNode | null;
  ragVariables: WorkflowRagVariable[];
  activeRunId: number | null;
  focusRagOnRunId?: number | null;
  inspectorNote?: string | null;
  saveError?: string | null;
  stepTestResult?: WorkflowStepTestResult | null;
  testingStepId?: string | null;
  onTestStep?: (nodeId: string) => void;
  onNodeChange: (node: WorkflowNode) => void;
  clientsMenuOpen?: boolean;
  onClientsMenuOpenChange?: (open: boolean) => void;
};

export function WorkflowRightRail({
  teamId,
  workflowId,
  sites,
  nodes,
  edges,
  selectedNode,
  ragVariables,
  activeRunId,
  focusRagOnRunId = null,
  inspectorNote,
  saveError,
  stepTestResult,
  testingStepId,
  onTestStep,
  onNodeChange,
  clientsMenuOpen,
  onClientsMenuOpenChange,
}: WorkflowRightRailProps): React.ReactElement {
  const [tab, setTab] = useState<"setup" | "rag">("setup");

  useEffect(() => {
    if (activeRunId && focusRagOnRunId && activeRunId === focusRagOnRunId) setTab("rag");
  }, [activeRunId, focusRagOnRunId]);

  useEffect(() => {
    if (stepTestResult) setTab("setup");
  }, [stepTestResult]);

  return (
    <aside className={WORKFLOW_RIGHT_RAIL_CLASS}>
      <div className={cn("flex shrink-0", WORKFLOW_SIDEBAR_BG_CLASS)}>
        <button
          type="button"
          data-active={tab === "setup"}
          className={cn(WORKFLOW_RAIL_TAB_CLASS)}
          onClick={() => setTab("setup")}
        >
          Setup
        </button>
        <button
          type="button"
          data-active={tab === "rag"}
          className={cn(WORKFLOW_RAIL_TAB_CLASS)}
          onClick={() => setTab("rag")}
        >
          RAG
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {saveError ? (
          <div className={cn("shrink-0 px-5 py-3", WORKFLOW_SIDEBAR_FIELD_CLASS)} role="alert">
            <p className="select-text whitespace-pre-wrap break-words text-base text-red-400">
              {saveError}
            </p>
          </div>
        ) : null}
        {tab === "setup" ? (
          <div className="flex h-full flex-col overflow-hidden">
            {inspectorNote ? (
              <div className={cn("shrink-0 px-5 py-3", WORKFLOW_SIDEBAR_FIELD_CLASS)}>
                <p className="select-text whitespace-pre-wrap break-words text-base text-muted-foreground">
                  {inspectorNote}
                </p>
              </div>
            ) : null}
            <WorkflowNodeInspector
              node={selectedNode}
              nodes={nodes}
              edges={edges}
              ragVariables={ragVariables}
              sites={sites}
              stepTestResult={stepTestResult}
              testingStepId={testingStepId}
              onTestStep={onTestStep}
              onChange={onNodeChange}
              clientsMenuOpen={clientsMenuOpen}
              onClientsMenuOpenChange={onClientsMenuOpenChange}
            />
          </div>
        ) : (
          <WorkflowRagSidebar
            teamId={teamId}
            workflowId={workflowId}
            nodes={nodes}
            activeRunId={activeRunId}
          />
        )}
      </div>
    </aside>
  );
}

export type WorkflowRightRailDraftProps = {
  sites: WordPressSiteOption[];
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNode: WorkflowNode | null;
  ragVariables: WorkflowRagVariable[];
  inspectorNote?: string | null;
  onNodeChange: (node: WorkflowNode) => void;
  clientsMenuOpen?: boolean;
  onClientsMenuOpenChange?: (open: boolean) => void;
};

export function WorkflowRightRailDraft({
  sites,
  nodes,
  edges,
  selectedNode,
  ragVariables,
  inspectorNote,
  onNodeChange,
  clientsMenuOpen,
  onClientsMenuOpenChange,
}: WorkflowRightRailDraftProps): React.ReactElement {
  return (
    <aside className={WORKFLOW_RIGHT_RAIL_CLASS}>
      <div className={cn("shrink-0 px-6 py-4", WORKFLOW_SIDEBAR_FIELD_CLASS)}>
        <p className="text-base font-normal text-white">Setup</p>
      </div>
      {inspectorNote ? (
        <div className={cn("shrink-0 px-5 py-3", WORKFLOW_SIDEBAR_FIELD_CLASS)}>
          <p className="select-text whitespace-pre-wrap break-words text-base text-muted-foreground">
            {inspectorNote}
          </p>
        </div>
      ) : null}
      <WorkflowNodeInspector
        node={selectedNode}
        nodes={nodes}
        edges={edges}
        ragVariables={ragVariables}
        sites={sites}
        onChange={onNodeChange}
        clientsMenuOpen={clientsMenuOpen}
        onClientsMenuOpenChange={onClientsMenuOpenChange}
      />
    </aside>
  );
}
