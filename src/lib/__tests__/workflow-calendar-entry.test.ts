import { describe, expect, it } from "vitest";
import { workflowCalendarEntryActionNodeIds } from "@/lib/workflow/workflow-compile";
import type { WorkflowDefinition } from "@/lib/workflow/workflow-types";

function gapToPostsWorkflow(): WorkflowDefinition {
  return {
    id: 1,
    teamId: 1,
    name: "Gap to posts",
    status: "draft",
    nodes: [
      {
        id: "client_1",
        kind: "workflow_client",
        label: "Client",
        position: { x: 0, y: 0 },
        config: {
          siteIds: ["site_a"],
          frequency: "monthly",
          startDate: "2026-01-01",
          time: "09:00",
        },
      },
      {
        id: "gap_1",
        kind: "action_agent",
        label: "Content gap check",
        position: { x: 0, y: 120 },
        config: { executionKind: "content_gap_check", executionPayload: { targetCount: 10 } },
      },
      {
        id: "posts_1",
        kind: "action_agent",
        label: "Create scheduled blog posts",
        position: { x: 0, y: 240 },
        config: { executionKind: "post_creator", executionPayload: { postCount: 3 } },
      },
    ],
    edges: [
      { id: "e0", source: "client_1", target: "gap_1" },
      { id: "e1", source: "gap_1", target: "posts_1" },
    ],
    ragVariables: [],
  };
}

describe("workflowCalendarEntryActionNodeIds", () => {
  it("marks only the first action step as the calendar entry", () => {
    const workflow = gapToPostsWorkflow();
    const ids = workflowCalendarEntryActionNodeIds(workflow);
    expect(ids.has("gap_1")).toBe(true);
    expect(ids.has("posts_1")).toBe(false);
  });
});
