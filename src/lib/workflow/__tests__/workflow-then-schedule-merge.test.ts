import { describe, expect, it } from "vitest";
import { createWorkflowNode } from "@/lib/workflow/workflow-graph-mutations";
import { mergeThenStepScheduleIntoPayload } from "@/lib/workflow/workflow-then-utils";
import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from "@/lib/workflow/workflow-types";

function chainWorkflow(nodes: WorkflowNode[]): WorkflowDefinition {
  const edges: WorkflowEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({
      id: `e-${i}`,
      source: nodes[i]!.id,
      target: nodes[i + 1]!.id,
    });
  }
  return {
    id: 10,
    teamId: 1,
    name: "Chain",
    status: "draft",
    nodes,
    edges,
    ragVariables: [],
    createdAt: "",
    updatedAt: "",
  };
}

describe("mergeThenStepScheduleIntoPayload", () => {
  it("overrides agent schedule fields from downstream then_scheduled step", () => {
    const client = createWorkflowNode("workflow_client", "Client");
    const trigger = createWorkflowNode("trigger_manual", "Trigger");
    const agent = createWorkflowNode("action_agent", "Entity pages");
    agent.config = {
      executionKind: "entity_page_creator",
      executionPayload: {
        scheduleFrequency: "custom",
        scheduleStartDateOption: "immediate",
        scheduleCustomInterval: 15,
        scheduleStartTime: "09:00",
      },
    };
    const thenScheduled = createWorkflowNode("then_scheduled", "Scheduled publish");
    thenScheduled.config = {
      inputVariableKey: "step_agent",
      executionPayload: {
        scheduleFrequency: "immediately",
        scheduleStartDateOption: "custom",
        scheduleCustomInterval: 1,
        scheduleStartTime: "09:00",
      },
    };

    const workflow = chainWorkflow([client, trigger, agent, thenScheduled]);
    const merged = mergeThenStepScheduleIntoPayload(workflow, agent.id, {
      scheduleFrequency: "custom",
      scheduleStartDateOption: "immediate",
      scheduleCustomInterval: 15,
    });

    expect(merged.scheduleFrequency).toBe("immediately");
  });

  it("returns payload unchanged when no downstream Then step exists", () => {
    const agent = createWorkflowNode("action_agent", "Agent");
    const workflow = chainWorkflow([agent]);
    const payload = { scheduleFrequency: "custom" as const };
    expect(mergeThenStepScheduleIntoPayload(workflow, agent.id, payload)).toEqual(payload);
  });
});
