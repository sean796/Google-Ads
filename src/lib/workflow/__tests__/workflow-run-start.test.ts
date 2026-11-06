import { describe, expect, it } from "vitest";
import { createWorkflowNode } from "@/lib/workflow/workflow-graph-mutations";
import { resolveWorkflowRunStart, resolveWorkflowTestWalkStart } from "@/lib/workflow/workflow-graph-utils";
import { WORKFLOW_TRIGGER_KINDS, type WorkflowDefinition } from "@/lib/workflow/workflow-types";

function chainWorkflow(nodes: ReturnType<typeof createWorkflowNode>[]): WorkflowDefinition {
  const edges = nodes.slice(0, -1).map((node, index) => ({
    id: `e-${index}`,
    source: node.id,
    target: nodes[index + 1]!.id,
  }));
  return {
    id: 1,
    teamId: 1,
    name: "Test",
    status: "draft",
    nodes,
    edges,
    ragVariables: [],
  };
}

describe("resolveWorkflowRunStart", () => {
  it("does not treat Schedule as an event trigger kind", () => {
    expect(WORKFLOW_TRIGGER_KINDS).not.toContain("trigger_calendar");
  });

  it("starts after the client and skips Schedule", () => {
    const client = createWorkflowNode("workflow_client", "Client");
    const trigger = createWorkflowNode("trigger_calendar", "Schedule");
    const agent = createWorkflowNode("action_agent", "Gap check");
    const workflow = chainWorkflow([client, trigger, agent]);

    expect(resolveWorkflowRunStart(workflow)).toEqual({
      entryNodeId: client.id,
      firstWalkNodeId: agent.id,
    });
  });

  it("starts after the client when there is no trigger", () => {
    const client = createWorkflowNode("workflow_client", "Client");
    const agent = createWorkflowNode("action_agent", "Gap check");
    const workflow = chainWorkflow([client, agent]);

    expect(resolveWorkflowRunStart(workflow)).toEqual({
      entryNodeId: client.id,
      firstWalkNodeId: agent.id,
    });
  });

  it("falls back to visual order when the trigger has no outgoing edge", () => {
    const client = createWorkflowNode("workflow_client", "Client");
    client.position = { x: 120, y: 80 };
    const trigger = createWorkflowNode("trigger_calendar", "Schedule");
    trigger.position = { x: 120, y: 220 };
    const agent = createWorkflowNode("action_agent", "Gap check");
    agent.position = { x: 120, y: 360 };
    const workflow: WorkflowDefinition = {
      id: 1,
      teamId: 1,
      name: "Test",
      status: "draft",
      nodes: [client, trigger, agent],
      edges: [{ id: "e-client-agent", source: client.id, target: agent.id }],
      ragVariables: [],
    };

    expect(resolveWorkflowRunStart(workflow)).toEqual({
      entryNodeId: client.id,
      firstWalkNodeId: agent.id,
    });
  });

  it("starts on the first runnable step in visual order when edges are missing", () => {
    const client = createWorkflowNode("workflow_client", "Client");
    client.position = { x: 120, y: 80 };
    const agent = createWorkflowNode("action_agent", "Gap check");
    agent.position = { x: 120, y: 220 };
    const workflow: WorkflowDefinition = {
      id: 1,
      teamId: 1,
      name: "Test",
      status: "draft",
      nodes: [agent, client],
      edges: [],
      ragVariables: [],
    };

    expect(resolveWorkflowRunStart(workflow)).toEqual({
      entryNodeId: client.id,
      firstWalkNodeId: agent.id,
    });
  });
});

describe("resolveWorkflowTestWalkStart", () => {
  it("skips client and schedule and starts at the first actionable step", () => {
    const client = createWorkflowNode("workflow_client", "Client");
    const trigger = createWorkflowNode("trigger_calendar", "Schedule");
    const agent = createWorkflowNode("action_agent", "DFS audit");
    const workflow = chainWorkflow([client, trigger, agent]);

    expect(resolveWorkflowTestWalkStart(workflow)).toEqual({
      entryNodeId: client.id,
      firstWalkNodeId: agent.id,
    });
  });

  it("starts at the agent when schedule has no outgoing edge", () => {
    const client = createWorkflowNode("workflow_client", "Client");
    client.position = { x: 120, y: 80 };
    const trigger = createWorkflowNode("trigger_calendar", "Schedule");
    trigger.position = { x: 120, y: 220 };
    const agent = createWorkflowNode("action_agent", "DFS audit");
    agent.position = { x: 120, y: 360 };
    const workflow: WorkflowDefinition = {
      id: 1,
      teamId: 1,
      name: "Test",
      status: "draft",
      nodes: [client, trigger, agent],
      edges: [{ id: "e-client-agent", source: client.id, target: agent.id }],
      ragVariables: [],
    };

    expect(resolveWorkflowTestWalkStart(workflow)).toEqual({
      entryNodeId: client.id,
      firstWalkNodeId: agent.id,
    });
  });
});
