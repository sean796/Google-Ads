import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createWorkflowNode } from "@/lib/workflow/workflow-graph-mutations";
import { mergeRecipeIntoWorkflow } from "@/lib/workflow/workflow-recipe-merge";
import { persistWorkflowDefinition, resetWorkflowSummaryFingerprintCache } from "@/lib/workflow/workflow-persist";
import type { AutomationRecipeCatalogItem } from "@/lib/automation-recipes-types";
import type { WorkflowDefinition } from "@/lib/workflow/workflow-types";

vi.mock("@/lib/workflow/workflow-api", () => ({
  updateWorkflow: vi.fn(async (_teamId: number, _workflowId: number, payload: Partial<WorkflowDefinition>) => ({
    ok: true,
    workflow: {
      id: 7,
      teamId: 1,
      name: "GSC Monthly MoM Report",
      description: payload.description,
      nodes: payload.nodes ?? [],
      edges: payload.edges ?? [],
      ragVariables: payload.ragVariables ?? [],
    },
  })),
  createWorkflow: vi.fn(),
  summarizeWorkflow: vi.fn(async () => ({
    ok: true,
    description: "Pulls Search Console data.\nBuilds a monthly compare report.",
  })),
}));

vi.mock("@/lib/workflow/workflow-compile", () => ({
  compileWorkflowTasks: vi.fn(async (workflow: WorkflowDefinition) => workflow),
}));

describe("persistWorkflowDefinition after recipe insert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWorkflowSummaryFingerprintCache();
  });

  it("perserves action_agent nodes when compile is skipped", async () => {
    const catalog = JSON.parse(
      readFileSync(join(process.cwd(), "src/lib/automation-recipes-catalog.bundle.json"), "utf8"),
    ) as AutomationRecipeCatalogItem[];
    const recipe = catalog.find((item) => item.keyword === "gsc-monthly-mom-report");
    expect(recipe).toBeTruthy();

    const schedule = createWorkflowNode("trigger_calendar", "Schedule");
    const workflow: WorkflowDefinition = {
      id: 7,
      teamId: 1,
      name: "GSC Monthly MoM Report",
      status: "draft",
      nodes: [
        createWorkflowNode("workflow_client", "Client"),
        schedule,
        createWorkflowNode("then_google_drive", "Google Drive"),
        createWorkflowNode("then_email", "Email"),
      ],
      edges: [],
      ragVariables: [],
    };

    const merged = mergeRecipeIntoWorkflow(workflow, recipe!, schedule.id);
    const result = await persistWorkflowDefinition(1, { ...workflow, ...merged }, { compile: false });
    expect(result.ok).toBe(true);
    expect(result.workflow?.nodes.some((node) => node.kind === "action_agent")).toBe(true);
  });
});
