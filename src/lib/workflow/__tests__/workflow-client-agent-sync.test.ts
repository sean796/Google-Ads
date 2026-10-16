import { describe, expect, it } from "vitest";
import { syncAgentNodesForWorkflowClient } from "@/lib/workflow/workflow-client-agent-sync";
import { buildMastraWorkflowPipeline } from "@/lib/workflow/workflow-mastra-bridge";
import { upstreamRagVariablesForNode } from "@/lib/workflow/workflow-rag-utils";
import type { WorkflowEdge, WorkflowNode } from "@/lib/workflow/workflow-types";

function actionNode(
  id: string,
  executionKind: string,
  executionPayload: Record<string, unknown> = {},
  ragVariableKey?: string,
): WorkflowNode {
  return {
    id,
    kind: "action_agent",
    label: executionKind,
    config: {
      executionKind,
      executionPayload,
      ...(ragVariableKey ? { ragVariableKey } : {}),
    },
    position: { x: 120, y: 80 },
  };
}

describe("syncAgentNodesForWorkflowClient", () => {
  it("strips stored business name and wires entity page creator to grid workflow", () => {
    const nodes: WorkflowNode[] = [
      actionNode("ld", "local_dominator_export", { businessName: "Old Client" }, "local_dominator_export_1"),
      actionNode("entity", "entity_page_creator", { locationSource: "wiki", businessName: "Old Client" }, "entity_page_creator_2"),
    ];
    const edges: WorkflowEdge[] = [
      { id: "e1", source: "ld", target: "entity" },
    ];

    const synced = syncAgentNodesForWorkflowClient({ nodes, edges });

    const ld = synced.find((node) => node.id === "ld")?.config as {
      executionPayload?: { businessName?: string };
    };
    const entity = synced.find((node) => node.id === "entity")?.config as {
      ragInputKeys?: string[];
      executionPayload?: { locationSource?: string; gridInputSource?: string; ragInputKeys?: string[]; businessName?: string };
    };

    expect(ld.executionPayload?.businessName).toBeUndefined();
    expect(entity.executionPayload?.businessName).toBeUndefined();
    expect(entity.executionPayload?.locationSource).toBe("grid");
    expect(entity.executionPayload?.gridInputSource).toBe("workflow");
    expect(entity.executionPayload?.ragInputKeys).toEqual(["local_dominator_export_1"]);
    expect(entity.ragInputKeys).toEqual(["local_dominator_export_1"]);
  });

  it("wires entity_generator to sap_generator with workflow CSV input and RAG key", () => {
    const nodes: WorkflowNode[] = [
      actionNode("eg", "entity_generator", { businessName: "Old Client" }, "entity_generator_1"),
      actionNode("sap", "sap_generator", { businessName: "Old Client" }, "sap_generator_2"),
    ];
    const edges: WorkflowEdge[] = [
      { id: "e1", source: "eg", target: "sap" },
    ];

    const synced = syncAgentNodesForWorkflowClient({ nodes, edges });
    const sap = synced.find((node) => node.id === "sap")?.config as {
      ragInputKeys?: string[];
      executionPayload?: { entityCsvInputSource?: string; ragInputKeys?: string[]; businessName?: string };
    };

    expect(sap.executionPayload?.businessName).toBeUndefined();
    expect(sap.executionPayload?.entityCsvInputSource).toBe("workflow");
    expect(sap.executionPayload?.ragInputKeys).toEqual(["entity_generator_1"]);
    expect(sap.ragInputKeys).toEqual(["entity_generator_1"]);
  });

  it("exposes upstream csv_rows RAG variables and builds Mastra workflow pipeline", () => {
    const csvNode: WorkflowNode = {
      id: "csv1",
      kind: "csv_rows",
      label: "Page Audit CSV",
      config: { ragVariableKey: "csv_audit_1" },
      position: { x: 120, y: 80 },
    };
    const agent = actionNode("opt1", "content_optimizer", {}, "optimizer_1");
    agent.position = { x: 120, y: 220 };
    const edges: WorkflowEdge[] = [{ id: "e1", source: "csv1", target: "opt1" }];

    const upstream = upstreamRagVariablesForNode(
      { nodes: [csvNode, agent], edges, ragVariables: [] },
      "opt1",
    );
    expect(upstream.map((v) => v.key)).toContain("csv_audit_1");

    const pipeline = buildMastraWorkflowPipeline({
      id: 42,
      name: "CSV to Optimizer",
      nodes: [csvNode, agent],
      edges,
    });
    expect(pipeline.getPipelineTitles()).toEqual(["Page Audit CSV", "content_optimizer"]);
  });
});
