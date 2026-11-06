import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveUpstreamGridCsvFromWorkflow } from "@/lib/entity-page-creator/resolve-upstream-grid-csv";
import type { WorkflowStepOutput } from "@/lib/workflow/workflow-types";

vi.mock("@/lib/agent-runs-api", () => ({
  fetchAgentRunCsvContent: vi.fn(),
}));

vi.mock("@/lib/workflow/workflow-api", () => ({
  fetchWorkflowStepOutputs: vi.fn(),
}));

import { fetchAgentRunCsvContent } from "@/lib/agent-runs-api";
import { fetchWorkflowStepOutputs } from "@/lib/workflow/workflow-api";

const outputs: WorkflowStepOutput[] = [
  {
    id: 1,
    runId: 294,
    nodeId: "ld-node",
    variableKey: "local_dominator_export_1",
    scope: "run",
    label: "Grid export",
    textPreview: "CSV",
    agentRunId: 899,
    fileRefs: [
      {
        name: "grid.csv",
        url: "https://neopulse.local/wp-content/uploads/neo-pulse/agent-runs/899/grid.csv",
        mime: "text/csv",
      },
    ],
    createdAt: "",
  },
];

describe("resolveUpstreamGridCsvFromWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads grid CSV through agent run deliverables API, not a public URL", async () => {
    vi.mocked(fetchWorkflowStepOutputs).mockResolvedValue(outputs);
    vi.mocked(fetchAgentRunCsvContent).mockResolvedValue("Business Name,Rank\nTest,1");

    const text = await resolveUpstreamGridCsvFromWorkflow({
      teamId: 1,
      workflowId: 10,
      workflowRunId: 294,
      ragInputKeys: ["local_dominator_export_1"],
    });

    expect(text).toContain("Business Name");
    expect(fetchAgentRunCsvContent).toHaveBeenCalledWith(1, 899);
  });
});
