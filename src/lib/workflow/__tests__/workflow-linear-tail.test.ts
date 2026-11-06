import { describe, expect, it } from "vitest";
import {
  createWorkflowActionAgentNode,
  createWorkflowNode,
  findUpstreamActionAgent,
  insertNodeAfter,
} from "@/lib/workflow/workflow-graph-mutations";
import { linearExecutableTailNodes } from "@/lib/workflow/workflow-linear-tail";
import type { WorkflowDefinition } from "@/lib/workflow/workflow-types";

describe("linearExecutableTailNodes", () => {
  it("returns Then and RAG steps after an agent even when edges are missing", () => {
    const trigger = createWorkflowNode("trigger_manual", "Start");
    const gsc = createWorkflowNode("action_agent", "GSC", { executionKind: "gsc_reporting" });
    const gdrive = createWorkflowNode("then_google_drive", "Google Drive");
    const rag = createWorkflowNode("rag_archive", "Archive");

    let workflow: WorkflowDefinition = {
      id: 1,
      teamId: 1,
      name: "GSC pipeline",
      status: "draft",
      nodes: [trigger],
      edges: [],
      ragVariables: [],
      createdAt: "",
      updatedAt: "",
    };
    workflow = insertNodeAfter(workflow, trigger.id, gsc);
    workflow = insertNodeAfter(workflow, gsc.id, gdrive);
    workflow = insertNodeAfter(workflow, gdrive.id, rag);

    const gscNode = workflow.nodes.find((node) => node.label === "GSC")!;
    const tail = linearExecutableTailNodes(workflow, gscNode.id);

    expect(tail.map((node) => node.label)).toEqual(["Google Drive", "Archive"]);
  });

  it("finds the nearest upstream agent before Google Drive", () => {
    const client = createWorkflowNode("workflow_client", "Client");
    const optimizer = createWorkflowActionAgentNode({
      executionKind: "content_optimizer",
      label: "Optimizer",
    });
    const audit = createWorkflowActionAgentNode({
      executionKind: "chatgpt_website_audit",
      label: "Audit",
    });
    const drive = createWorkflowNode("then_google_drive", "Google Drive");

    let workflow: WorkflowDefinition = {
      id: 1,
      teamId: 1,
      name: "Audit pipeline",
      status: "draft",
      nodes: [client],
      edges: [],
      ragVariables: [],
      createdAt: "",
      updatedAt: "",
    };
    workflow = insertNodeAfter(workflow, client.id, optimizer);
    workflow = insertNodeAfter(workflow, optimizer.id, audit);
    workflow = insertNodeAfter(workflow, audit.id, drive);

    const agent = findUpstreamActionAgent(workflow, drive.id);
    expect(agent?.label).toBe("Audit");
    expect((agent?.config as { executionKind?: string }).executionKind).toBe("chatgpt_website_audit");
  });
});
