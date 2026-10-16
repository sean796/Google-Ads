import { z } from "zod";
import {
  createStep,
  createWorkflow,
  type PulseStep,
  type PulseWorkflow,
  type PulseWorkflowContext,
} from "@/lib/agent-pipeline";
import { linearOrderedNodes } from "@/lib/workflow/workflow-graph-mutations";
import { defaultNodeLabel } from "@/lib/workflow/workflow-graph-utils";
import type { WalkFromNodeResult } from "@/lib/workflow/workflow-walk-types";
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowRun,
  WorkflowStepOutput,
} from "@/lib/workflow/workflow-types";

export const MastraWorkflowNodeStepInputSchema = z.object({
  nodeId: z.string().min(1),
  nodeKind: z.string().min(1),
  workflowId: z.number(),
  runId: z.number(),
});

export const MastraWorkflowNodeStepOutputSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  deferWorkflowCompletion: z.boolean().optional(),
});

export type MastraWorkflowNodeStepInput = z.infer<typeof MastraWorkflowNodeStepInputSchema>;
export type MastraWorkflowNodeStepOutput = z.infer<typeof MastraWorkflowNodeStepOutputSchema>;

export function createMastraWorkflowNodeStep(
  node: WorkflowNode,
  executeNode: () => Promise<WalkFromNodeResult | null>,
): PulseStep<MastraWorkflowNodeStepInput, MastraWorkflowNodeStepOutput> {
  const stepTitle = node.label?.trim() || defaultNodeLabel(node.kind);
  return createStep({
    id: node.id,
    title: stepTitle,
    inputSchema: MastraWorkflowNodeStepInputSchema,
    outputSchema: MastraWorkflowNodeStepOutputSchema,
    execute: async () => {
      const result = await executeNode();
      if (!result) {
        return { ok: true };
      }
      return {
        ok: result.ok,
        ...(result.error ? { error: result.error } : {}),
        ...(result.deferWorkflowCompletion ? { deferWorkflowCompletion: true } : {}),
      };
    },
  });
}

export async function runMastraWorkflowNodeStep(args: {
  workflow: WorkflowDefinition;
  run: WorkflowRun;
  node: WorkflowNode;
  executeNode: () => Promise<WalkFromNodeResult | null>;
  context?: PulseWorkflowContext;
}): Promise<WalkFromNodeResult | null> {
  let didExecute = false;
  let rawResult: WalkFromNodeResult | null = null;
  const step = createMastraWorkflowNodeStep(args.node, async () => {
    rawResult = await args.executeNode();
    didExecute = true;
    return rawResult;
  });

  const validatedInput = step.inputSchema.parse({
    nodeId: args.node.id,
    nodeKind: args.node.kind,
    workflowId: Number(args.workflow.id ?? args.run.workflowId ?? 0),
    runId: Number(args.run.id ?? 0),
  });

  const out = await step.execute({
    inputData: validatedInput,
    context: args.context ?? {},
  });
  step.outputSchema.parse(out);
  return didExecute ? rawResult : null;
}

export type MastraWorkflowPipelineState = {
  workflowId: number;
  runId: number;
  outputs: WorkflowStepOutput[];
  completedNodeIds: string[];
};

const MastraWorkflowPipelineStateSchema: z.ZodType<MastraWorkflowPipelineState> = z.object({
  workflowId: z.number(),
  runId: z.number(),
  outputs: z.array(z.custom<WorkflowStepOutput>()),
  completedNodeIds: z.array(z.string()),
});

export function buildMastraWorkflowPipeline(
  workflow: Pick<WorkflowDefinition, "id" | "name" | "nodes" | "edges">,
  executeNode?: (
    node: WorkflowNode,
    state: MastraWorkflowPipelineState,
  ) => Promise<MastraWorkflowPipelineState>,
): PulseWorkflow<MastraWorkflowPipelineState, MastraWorkflowPipelineState> {
  const ordered = linearOrderedNodes(workflow);
  let builder = createWorkflow({
    id: `forge.workflow.${workflow.id || "draft"}`,
    inputSchema: MastraWorkflowPipelineStateSchema,
    outputSchema: MastraWorkflowPipelineStateSchema,
  });

  for (const node of ordered) {
    const step = createStep({
      id: node.id,
      title: node.label?.trim() || defaultNodeLabel(node.kind),
      inputSchema: MastraWorkflowPipelineStateSchema,
      outputSchema: MastraWorkflowPipelineStateSchema,
      execute: async ({ inputData }) => {
        if (executeNode) {
          return executeNode(node, inputData);
        }
        return {
          ...inputData,
          completedNodeIds: [...inputData.completedNodeIds, node.id],
        };
      },
    });
    builder = builder.then(step);
  }

  return builder.commit();
}
