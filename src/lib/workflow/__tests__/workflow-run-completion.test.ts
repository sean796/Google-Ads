import { describe, expect, it } from "vitest";
import { createWorkflowActionAgentNode, createWorkflowNode, insertNodeAfter } from "@/lib/workflow/workflow-graph-mutations";
import {
  hasIncompleteWorkflowSteps,
  isContentGapGoalMetFromPreview,
  missingWorkflowStepNodeIds,
} from "@/lib/workflow/workflow-run-completion";
import type { WorkflowDefinition, WorkflowStepOutput } from "@/lib/workflow/workflow-types";

function output(
  nodeId: string,
  textPreview = "ok",
  fileRefs: WorkflowStepOutput["fileRefs"] = [],
): WorkflowStepOutput {
  return {
    id: 1,
    runId: 1,
    nodeId,
    variableKey: `step_${nodeId}`,
    scope: "run",
    label: nodeId,
    textPreview,
    fileRefs,
    createdAt: "",
  };
}

function ldCsvOutput(nodeId: string): WorkflowStepOutput {
  return output(nodeId, "Grid export CSV", [
    { name: "grid.csv", url: "https://example.com/grid.csv", mime: "text/csv" },
  ]);
}

describe("hasIncompleteWorkflowSteps", () => {
  it("returns true until agent, Then, and RAG steps all have run outputs", () => {
    const trigger = createWorkflowNode("trigger_manual", "Start");
    const ld = createWorkflowActionAgentNode({
      executionKind: "local_dominator_export",
      label: "Export grid",
    });
    const entity = createWorkflowActionAgentNode({
      executionKind: "entity_page_creator",
      label: "Entity pages",
    });
    const gdrive = createWorkflowNode("then_google_drive", "Google Drive");
    const rag = createWorkflowNode("rag_archive", "Archive");

    let workflow: WorkflowDefinition = {
      id: 1,
      teamId: 1,
      name: "Pipeline",
      status: "draft",
      nodes: [trigger],
      edges: [],
      ragVariables: [],
      createdAt: "",
      updatedAt: "",
    };
    workflow = insertNodeAfter(workflow, trigger.id, ld);
    workflow = insertNodeAfter(workflow, ld.id, entity);
    workflow = insertNodeAfter(workflow, entity.id, gdrive);
    workflow = insertNodeAfter(workflow, gdrive.id, rag);

    const ldNode = workflow.nodes.find((node) => node.label === "Export grid")!;
    const entityNode = workflow.nodes.find((node) => node.label === "Entity pages")!;
    const gdriveNode = workflow.nodes.find((node) => node.label === "Google Drive")!;
    const ragNode = workflow.nodes.find((node) => node.label === "Archive")!;

    expect(hasIncompleteWorkflowSteps(workflow, [])).toBe(true);
    expect(hasIncompleteWorkflowSteps(workflow, [output(ldNode.id)])).toBe(true);
    expect(hasIncompleteWorkflowSteps(workflow, [ldCsvOutput(ldNode.id)])).toBe(true);
    expect(
      hasIncompleteWorkflowSteps(workflow, [ldCsvOutput(ldNode.id), output(entityNode.id)]),
    ).toBe(true);
    expect(
      hasIncompleteWorkflowSteps(workflow, [
        ldCsvOutput(ldNode.id),
        output(entityNode.id),
        output(gdriveNode.id),
      ]),
    ).toBe(true);
    expect(
      hasIncompleteWorkflowSteps(workflow, [
        ldCsvOutput(ldNode.id),
        output(entityNode.id),
        output(gdriveNode.id),
        output(ragNode.id),
      ]),
    ).toBe(false);
  });

  it("treats Local Dominator output without a CSV as incomplete", () => {
    const trigger = createWorkflowNode("trigger_manual", "Start");
    const gap = createWorkflowActionAgentNode({
      executionKind: "content_gap_check",
      label: "Content gap check",
    });
    const ld = createWorkflowActionAgentNode({
      executionKind: "local_dominator_export",
      label: "Export grid",
    });
    const entity = createWorkflowActionAgentNode({
      executionKind: "entity_page_creator",
      label: "Entity pages",
    });

    let workflow: WorkflowDefinition = {
      id: 3,
      teamId: 1,
      name: "Gap to entity",
      status: "draft",
      nodes: [trigger],
      edges: [],
      ragVariables: [],
      createdAt: "",
      updatedAt: "",
    };
    workflow = insertNodeAfter(workflow, trigger.id, gap);
    workflow = insertNodeAfter(workflow, gap.id, ld);
    workflow = insertNodeAfter(workflow, ld.id, entity);

    const gapNode = workflow.nodes.find((node) => node.label === "Content gap check")!;
    const ldNode = workflow.nodes.find((node) => node.label === "Export grid")!;
    const entityNode = workflow.nodes.find((node) => node.label === "Entity pages")!;
    const openPreview =
      "Content: SAP\nCurrent: 0\nTarget: 15\nGap: 15\nCreate 15 SAP page(s) to reach the target.";

    expect(
      missingWorkflowStepNodeIds(workflow, [
        output(gapNode.id, openPreview),
        output(ldNode.id, "started"),
      ]),
    ).toEqual([ldNode.id, entityNode.id]);

    expect(
      missingWorkflowStepNodeIds(workflow, [
        output(gapNode.id, openPreview),
        ldCsvOutput(ldNode.id),
      ]),
    ).toEqual([entityNode.id]);
  });

  it("stops after content gap check when Gap is 0 (no posts needed)", () => {
    const trigger = createWorkflowNode("trigger_manual", "Start");
    const gap = createWorkflowActionAgentNode({
      executionKind: "content_gap_check",
      label: "Content gap check",
    });
    const posts = createWorkflowActionAgentNode({
      executionKind: "post_creator",
      label: "Post creator",
    });

    let workflow: WorkflowDefinition = {
      id: 2,
      teamId: 1,
      name: "Gap then posts",
      status: "draft",
      nodes: [trigger],
      edges: [],
      ragVariables: [],
      createdAt: "",
      updatedAt: "",
    };
    workflow = insertNodeAfter(workflow, trigger.id, gap);
    workflow = insertNodeAfter(workflow, gap.id, posts);

    const gapNode = workflow.nodes.find((node) => node.label === "Content gap check")!;
    const postsNode = workflow.nodes.find((node) => node.label === "Post creator")!;
    const metPreview =
      "Content: Posts\nCurrent: 15\nTarget: 3\nGap: 0\nTarget met (15/3). No post(s) needed.";

    expect(isContentGapGoalMetFromPreview(metPreview)).toBe(true);
    expect(hasIncompleteWorkflowSteps(workflow, [output(gapNode.id, metPreview)])).toBe(false);
    expect(missingWorkflowStepNodeIds(workflow, [output(gapNode.id, metPreview)])).toEqual([]);

    const openPreview =
      "Content: Posts\nCurrent: 1\nTarget: 3\nGap: 2\nCreate 2 post(s) to reach the target.";
    expect(hasIncompleteWorkflowSteps(workflow, [output(gapNode.id, openPreview)])).toBe(true);
    expect(missingWorkflowStepNodeIds(workflow, [output(gapNode.id, openPreview)])).toEqual([
      postsNode.id,
    ]);
  });

  it("keeps post creator incomplete when only some clients still have a gap", () => {
    const trigger = createWorkflowNode("trigger_manual", "Start");
    const gap = createWorkflowActionAgentNode({
      executionKind: "content_gap_check",
      label: "Content gap check",
    });
    const posts = createWorkflowActionAgentNode({
      executionKind: "post_creator",
      label: "Post creator",
    });

    let workflow: WorkflowDefinition = {
      id: 3,
      teamId: 1,
      name: "Multi-client gap",
      status: "draft",
      nodes: [trigger],
      edges: [],
      ragVariables: [],
      createdAt: "",
      updatedAt: "",
    };
    workflow = insertNodeAfter(workflow, trigger.id, gap);
    workflow = insertNodeAfter(workflow, gap.id, posts);

    const gapNode = workflow.nodes.find((node) => node.label === "Content gap check")!;
    const postsNode = workflow.nodes.find((node) => node.label === "Post creator")!;
    const metPreview =
      "Content: Posts\nCurrent: 15\nTarget: 3\nGap: 0\nTarget met (15/3). No post(s) needed.";
    const openPreview =
      "Content: Posts\nCurrent: 1\nTarget: 3\nGap: 2\nCreate 2 post(s) to reach the target.";

    const mixed: WorkflowStepOutput[] = [
      { ...output(gapNode.id, metPreview), siteId: "site-a", variableKey: `step_${gapNode.id}__site-a` },
      { ...output(gapNode.id, openPreview), siteId: "site-b", variableKey: `step_${gapNode.id}__site-b` },
    ];
    expect(hasIncompleteWorkflowSteps(workflow, mixed)).toBe(true);
    expect(missingWorkflowStepNodeIds(workflow, mixed)).toEqual([postsNode.id]);

    const allMet: WorkflowStepOutput[] = [
      { ...output(gapNode.id, metPreview), siteId: "site-a", variableKey: `step_${gapNode.id}__site-a` },
      { ...output(gapNode.id, metPreview), siteId: "site-b", variableKey: `step_${gapNode.id}__site-b` },
    ];
    expect(hasIncompleteWorkflowSteps(workflow, allMet)).toBe(false);
    expect(missingWorkflowStepNodeIds(workflow, allMet)).toEqual([]);
  });
});
