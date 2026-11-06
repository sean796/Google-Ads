import { describe, expect, it, vi } from "vitest";
import { AGENTS_PHASE_MIN_MS, LEAD_PHASE_MIN_MS, WorkflowPacer } from "../stream";

describe("WorkflowPacer", () => {
  it("keeps all agents running until the minimum dwell elapses", async () => {
    vi.useFakeTimers();
    const views: string[][] = [];

    const pacer = new WorkflowPacer((workflow) => {
      views.push(workflow.steps.map((step) => `${step.label}:${step.status}`));
    });

    pacer.ingest({
      status: "agent_plan",
      agents: [
        { id: "meta_agent", role: "Meta description reviewer" },
        { id: "focus_agent", role: "Focus keyword reviewer" },
        { id: "body_agent", role: "Body content reviewer" },
      ],
    });

    pacer.ingest({ status: "agent", id: "meta_agent", state: "done" });
    pacer.ingest({ status: "agent", id: "focus_agent", state: "done" });
    pacer.ingest({ status: "agent", id: "body_agent", state: "done" });
    pacer.ingest({ status: "lead", state: "running" });
    pacer.ingest({ status: "lead", state: "done" });

    const ready = pacer.waitUntilResultReady();
    await vi.advanceTimersByTimeAsync(AGENTS_PHASE_MIN_MS + LEAD_PHASE_MIN_MS + 500);
    await ready;

    expect(views[0]).toEqual([
      "Meta description reviewer:running",
      "Focus keyword reviewer:running",
      "Body content reviewer:running",
      "Lead execution:pending",
    ]);

    const leadRunningView = views.find((view) => view[3] === "Lead execution:running");
    expect(leadRunningView).toBeDefined();

    const allDoneView = views.find(
      (view) =>
        view[0]?.endsWith(":done") &&
        view[1]?.endsWith(":done") &&
        view[2]?.endsWith(":done") &&
        view[3] === "Lead execution:done",
    );
    expect(allDoneView).toBeDefined();

    pacer.dispose();
    vi.useRealTimers();
  });
});
