import { beforeEach, describe, expect, it, vi } from "vitest";
import { compileWorkflowTasks } from "@/lib/workflow/workflow-compile";
import type { WorkflowDefinition } from "@/lib/workflow/workflow-types";

vi.mock("@/lib/teams-api", () => ({
  fetchTeamMembers: vi.fn(async () => [
    { userId: 42, email: "pulse@neodigital.ca", isBot: true, displayName: "NEO Pulse" },
  ]),
}));

vi.mock("@/lib/tasks-api", () => ({
  createTaskProject: vi.fn(async () => ({ ok: true, project: { id: 99 } })),
  createProjectTask: vi.fn(async () => ({ ok: true, task: { id: 501 } })),
  updateTask: vi.fn(async () => ({ ok: true, task: { id: 501 } })),
}));

import { createProjectTask, updateTask } from "@/lib/tasks-api";

const baseWorkflow: WorkflowDefinition = {
  id: 7,
  teamId: 1,
  name: "Gap to posts",
  status: "draft",
  nodes: [
    {
      id: "agent_1",
      kind: "action_agent",
      label: "Content gap check",
      position: { x: 0, y: 0 },
      config: {
        executionKind: "content_gap_check",
        title: "Content gap check",
        executionPayload: { targetCount: 10 },
      },
    },
  ],
  edges: [],
  ragVariables: [],
};

describe("compileWorkflowTasks pulse assignee", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assigns Pulse AI when creating compiled workflow tasks", async () => {
    const compiled = await compileWorkflowTasks(1, baseWorkflow);
    expect(createProjectTask).toHaveBeenCalledWith(
      1,
      99,
      expect.objectContaining({ assigneeIds: [42] }),
    );
    expect(compiled.nodes[0]?.config).toMatchObject({ compiledTaskId: 501 });
  });

  it("assigns Pulse AI when updating existing compiled tasks", async () => {
    const workflow: WorkflowDefinition = {
      ...baseWorkflow,
      nodes: [
        {
          ...baseWorkflow.nodes[0]!,
          config: {
            ...baseWorkflow.nodes[0]!.config,
            compiledTaskId: 888,
          },
        },
      ],
    };

    await compileWorkflowTasks(1, { ...workflow, projectId: 55 } as WorkflowDefinition & { projectId: number });
    expect(updateTask).toHaveBeenCalledWith(
      1,
      888,
      expect.objectContaining({ assigneeIds: [42] }),
    );
  });

  it("calendar-schedules only the first workflow action, not downstream post creator", async () => {
    const workflow = {
      ...gapToPostsWorkflow(),
      projectId: 55,
      nodes: gapToPostsWorkflow().nodes.map((node) => ({
        ...node,
        config: {
          ...node.config,
          ...(node.id === "gap_1" ? { compiledTaskId: 701 } : {}),
          ...(node.id === "posts_1" ? { compiledTaskId: 702 } : {}),
        },
      })),
    } as WorkflowDefinition & { projectId: number };

    await compileWorkflowTasks(1, workflow);

    expect(updateTask).toHaveBeenCalledWith(
      1,
      701,
      expect.objectContaining({
        scheduleMode: "calendar",
        dueDate: "2026-01-01",
        dueTime: "09:00",
        recurrenceRule: "monthly",
      }),
    );
    expect(updateTask).toHaveBeenCalledWith(
      1,
      702,
      expect.objectContaining({ scheduleMode: "trigger" }),
    );
  });
});

function gapToPostsWorkflow(): WorkflowDefinition {
  return {
    id: 7,
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
