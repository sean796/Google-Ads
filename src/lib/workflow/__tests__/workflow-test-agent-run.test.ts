import { describe, expect, it } from "vitest";
import {
  agentRunMatchesWorkflowRun,
  findAgentRunIdInOutputs,
} from "@/lib/workflow/workflow-test-agent-run";
import type { AgentRun } from "@/lib/agent-runs-types";
import type { WorkflowStepOutput } from "@/lib/workflow/workflow-types";

describe("agentRunMatchesWorkflowRun", () => {
  it("matches when context workflow ids align", () => {
    const run: AgentRun = {
      id: 1,
      teamId: 1,
      createdBy: 1,
      title: "Run",
      recipeKey: "gsc_reporting",
      recipeTitle: "Run",
      status: "done",
      source: "workflow",
      taskId: 0,
      taskTitle: "",
      context: { workflowId: 14, workflowRunId: 401 },
      plan: {},
      result: null,
      errorMessage: "",
      clientBatchKey: "",
      startedAt: null,
      finishedAt: null,
      createdAt: "",
      updatedAt: "",
    };
    expect(agentRunMatchesWorkflowRun(run, 14, 401)).toBe(true);
    expect(agentRunMatchesWorkflowRun(run, 14, 402)).toBe(false);
  });

  it("matches plan fields when context is empty", () => {
    const run: AgentRun = {
      id: 1,
      teamId: 1,
      createdBy: 1,
      title: "Run",
      recipeKey: "gsc_reporting",
      recipeTitle: "Run",
      status: "done",
      source: "workflow",
      taskId: 0,
      taskTitle: "",
      context: {},
      plan: { workflowId: 14, workflowRunId: 401 },
      result: null,
      errorMessage: "",
      clientBatchKey: "",
      startedAt: null,
      finishedAt: null,
      createdAt: "",
      updatedAt: "",
    };
    expect(agentRunMatchesWorkflowRun(run, 14, 401)).toBe(true);
  });
});

describe("findAgentRunIdInOutputs", () => {
  it("returns first output with agentRunId", () => {
    const outputs: WorkflowStepOutput[] = [
      {
        id: 1,
        runId: 1,
        nodeId: "a",
        variableKey: "a",
        scope: "run",
        label: "A",
        textPreview: "",
        fileRefs: [],
        createdAt: "",
      },
      {
        id: 2,
        runId: 1,
        nodeId: "b",
        variableKey: "b",
        scope: "run",
        label: "B",
        textPreview: "",
        fileRefs: [],
        agentRunId: 99,
        createdAt: "",
      },
    ];
    expect(findAgentRunIdInOutputs(outputs)).toBe(99);
  });

  it("returns undefined when no agent run on outputs", () => {
    expect(findAgentRunIdInOutputs([])).toBeUndefined();
  });
});
