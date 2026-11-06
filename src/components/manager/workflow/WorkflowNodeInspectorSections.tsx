import { X } from "lucide-react";
import React from "react";
import { TaskFormFlatSelectPlaceholder } from "@/components/manager/tasks/TaskFormLayout";
import {
  WorkflowInspectorField,
  WorkflowInspectorGroup,
} from "@/components/manager/workflow/WorkflowInspectorLayout";
import {
  WORKFLOW_INSPECTOR_FIELD_CELL_CLASS,
  WORKFLOW_SIDEBAR_FIELD_CLASS,
} from "@/components/manager/workflow/forge-workflow-styles";
import {
  resolveRagInputKeys,
  upstreamRagVariablesForNode,
} from "@/lib/workflow/workflow-rag-utils";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowPathBranchConfig,
  WorkflowRagArchiveConfig,
  WorkflowRagArchiveDeliverableScope,
  WorkflowRagVariable,
} from "@/lib/workflow/workflow-types";
import { cn } from "@/lib/utils";
import { Button, Field, SelectField } from "@/ui";
import { RAG_ARCHIVE_DELIVERABLE_OPTIONS } from "@/components/manager/workflow/workflow-node-inspector-shared";

export function RagArchiveInspector({
  node,
  nodes,
  edges,
  ragVariables,
  onChange,
}: {
  node: WorkflowNode;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  ragVariables: WorkflowRagVariable[];
  onChange: (node: WorkflowNode) => void;
}): React.ReactElement {
  const config = node.config as WorkflowRagArchiveConfig;
  const upstream = upstreamRagVariablesForNode({ nodes, edges, ragVariables }, node.id);

  const patchConfig = (patch: Partial<WorkflowRagArchiveConfig>) => {
    onChange({
      ...node,
      config: {
        ...config,
        ...patch,
      },
    });
  };

  return (
    <WorkflowInspectorGroup title="Archive">
      <WorkflowInspectorField>
        <SelectField placeholder="Source variable" value={String(config.variableKey ?? "")} onValueChange={(value) => patchConfig({ variableKey: value, scope: "run" })} options={upstream.map((variable) => ({ value: variable.key, label: variable.label || variable.key }))} />
      </WorkflowInspectorField>
      <WorkflowInspectorField>
        <SelectField placeholder="Deliverables" value={config.deliverableScope ?? "final"} onValueChange={(value) =>
            patchConfig({ deliverableScope: value as WorkflowRagArchiveDeliverableScope })
          } options={RAG_ARCHIVE_DELIVERABLE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} />
      </WorkflowInspectorField>
    </WorkflowInspectorGroup>
  );
}

export function ActionAgentRagInputs({
  node,
  nodes,
  edges,
  ragVariables,
  onChange,
}: {
  node: WorkflowNode;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  ragVariables: WorkflowRagVariable[];
  onChange: (node: WorkflowNode) => void;
}): React.ReactElement {
  const config = node.config as Record<string, unknown>;
  const selectedKeys = resolveRagInputKeys(config as Parameters<typeof resolveRagInputKeys>[0]);
  const upstream = upstreamRagVariablesForNode({ nodes, edges, ragVariables }, node.id);
  const available = upstream.filter((variable) => !selectedKeys.includes(variable.key));

  const patchRagInputs = (ragInputKeys: string[]) => {
    onChange({
      ...node,
      config: {
        ...config,
        ragInputKeys,
        ragScope: "run",
        upstreamVariable: undefined,
      },
    });
  };

  const addKey = (key: string) => {
    if (!key || selectedKeys.includes(key)) return;
    patchRagInputs([...selectedKeys, key]);
  };

  const removeKey = (key: string) => {
    patchRagInputs(selectedKeys.filter((item) => item !== key));
  };

  const labelForKey = (key: string) =>
    ragVariables.find((variable) => variable.key === key)?.label ?? key;

  return (
    <WorkflowInspectorGroup title="RAG context">
      {selectedKeys.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {selectedKeys.map((key) => (
            <li
              key={key}
              className={cn(WORKFLOW_SIDEBAR_FIELD_CLASS, "flex items-center justify-between gap-3 px-3 py-2")}
            >
              <span className="break-words text-base text-primary">{`{{${key}}}`}</span>
              <span className="break-words text-base text-muted-foreground">{labelForKey(key)}</span>
              <Button
                size="icon" icon={X}
                variant="quiet"
                aria-label={`Remove ${key}`}
                onClick={() => removeKey(key)}
              ></Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-base text-muted-foreground">No run context attached.</p>
      )}
      {available.length > 0 ? (
        <TaskFormFlatSelectPlaceholder
          placeholder="Add run context"
          value=""
          onChange={addKey}
          options={available.map((variable) => ({
            value: variable.key,
            label: variable.label || variable.key,
          }))}
          className={WORKFLOW_INSPECTOR_FIELD_CELL_CLASS}
        />
      ) : null}
    </WorkflowInspectorGroup>
  );
}

export function PathRulesInspector({
  node,
  onChange,
}: {
  node: WorkflowNode;
  onChange: (node: WorkflowNode) => void;
}): React.ReactElement {
  const config = node.config as { branches?: WorkflowPathBranchConfig[] };
  const branches = config.branches ?? [];

  const updateBranch = (index: number, patch: Partial<WorkflowPathBranchConfig>) => {
    const next = branches.map((branch, i) => (i === index ? { ...branch, ...patch } : branch));
    onChange({ ...node, config: { ...config, branches: next } });
  };

  return (
    <div className="flex flex-col gap-4">
      {branches.map((branch, index) => (
        <WorkflowInspectorField key={branch.branchId}>
          <Field
            value={branch.label}
            onChange={(event) => updateBranch(index, { label: event.target.value })}
            placeholder="Path label"
          />
        </WorkflowInspectorField>
      ))}
    </div>
  );
}
