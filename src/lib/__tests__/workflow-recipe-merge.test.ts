import { describe, expect, it } from "vitest";
import type { AutomationRecipeCatalogItem } from "@/lib/automation-recipes-types";
import { emptyWorkflowDraft } from "@/lib/workflow/workflow-migrate-from-planner";
import { linearOrderedNodes } from "@/lib/workflow/workflow-graph-mutations";
import { mergeRecipeIntoWorkflow, recipeToActionSubgraph } from "@/lib/workflow/workflow-recipe-merge";
import { defaultTaskTriggerConfig } from "@/lib/task-trigger-types";

const singleActionRecipe: AutomationRecipeCatalogItem = {
  keyword: "pages-ctr-rescue",
  name: "Pages CTR Drop",
  description: "Optimize pages when CTR drops",
  isAutomation: true,
  category: "maintenance",
  verticals: [],
  tags: [],
  prerequisites: ["gsc"],
  filters: { targetBuckets: ["pages"] },
  triggerBlock: {
    keyword: "gsc-pages",
    kind: "gsc",
    source: "gsc",
    targetBucket: "pages",
    triggerConfig: {
      ...defaultTaskTriggerConfig(),
      conditions: [{ signal: "ctr_drop", operator: "gte", value: 15, minImpressions: 100 }],
    },
  },
  actionBlock: {
    keyword: "meta-optimizer",
    executionKind: "content_optimizer_meta",
    executionPayload: { targetBucket: "pages" },
    title: "Optimize meta",
  },
};

const multiActionRecipe: AutomationRecipeCatalogItem = {
  ...singleActionRecipe,
  keyword: "seo-autopilot-flywheel",
  name: "SEO Autopilot Flywheel",
  actionBlocks: [
    {
      keyword: "step-1",
      executionKind: "content_optimizer_meta",
      executionPayload: { targetBucket: "pages" },
      title: "Meta pass",
    },
    {
      keyword: "step-2",
      executionKind: "content_optimizer",
      executionPayload: { targetBucket: "pages" },
      title: "Content pass",
    },
  ],
};

describe("workflow-recipe-merge", () => {
  it("starts from empty draft", () => {
    const draft = emptyWorkflowDraft(1, null);
    // Intentional starter: every workflow begins with one Client node (ensureWorkflowClientNode).
    expect(draft.nodes).toHaveLength(1);
    expect(draft.nodes[0]?.kind).toBe("workflow_client");
    expect(draft.edges).toHaveLength(0);
  });

  it("merges single-action recipe with rag archive", () => {
    const draft = emptyWorkflowDraft(1, null);
    const merged = mergeRecipeIntoWorkflow(draft, singleActionRecipe, null);

    const ordered = linearOrderedNodes(merged);
    expect(ordered.filter((node) => node.kind === "action_agent").length).toBeGreaterThanOrEqual(1);
    expect(ordered[ordered.length - 1]?.kind).toBe("rag_archive");
    expect(merged.insertedNodeIds).toHaveLength(1);
  });

  it("preserves multi-action order", () => {
    const draft = emptyWorkflowDraft(1, null);
    const merged = mergeRecipeIntoWorkflow(draft, multiActionRecipe, null);
    const inserted = merged.nodes.filter((node) => merged.insertedNodeIds.includes(node.id));
    expect(inserted).toHaveLength(2);
    expect(inserted[0]?.label).toContain("Meta pass");
    expect(inserted[1]?.label).toContain("Content pass");
  });

  it("dedupes rag keys when inserting twice", () => {
    const draft = emptyWorkflowDraft(1, null);
    const first = mergeRecipeIntoWorkflow(draft, singleActionRecipe, null);
    const second = mergeRecipeIntoWorkflow(
      { nodes: first.nodes, edges: first.edges, ragVariables: first.ragVariables },
      singleActionRecipe,
      first.insertedNodeIds[0] ?? null,
    );
    const keys = second.ragVariables.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("does not add trigger from recipe subgraph", () => {
    const draft = emptyWorkflowDraft(1, null);
    const subgraph = recipeToActionSubgraph(singleActionRecipe, new Set());
    expect(subgraph.nodes.every((node) => node.kind === "action_agent")).toBe(true);
    const merged = mergeRecipeIntoWorkflow(draft, singleActionRecipe, null);
    expect(merged.nodes.filter((node) => node.kind.startsWith("trigger_"))).toHaveLength(0);
  });
});
