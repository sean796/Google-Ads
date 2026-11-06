import { describe, expect, it } from "vitest";
import {
  agentRunCardTitle,
  agentRunCollapsedHint,
  agentRunInlineStatus,
  agentRunStatusHint,
  buildAgentRunProgressLabel,
  isAgentRunNodeDiagnosticLabel,
  splitProgressLabel,
} from "@/lib/agent-runs/agent-run-display";
import type { AgentRun } from "@/lib/agent-runs-types";

describe("buildAgentRunProgressLabel", () => {
  it("returns message only when it already includes the step prefix", () => {
    expect(
      buildAgentRunProgressLabel(
        "SERP research brief complete",
        "SERP research brief complete · Harness 1/8: Overview…",
      ),
    ).toBe("SERP research brief complete · Harness 1/8: Overview…");
  });

  it("joins distinct step and message once", () => {
    expect(buildAgentRunProgressLabel("Load", "Optimizing meta…")).toBe("Load · Optimizing meta…");
  });

  it("returns message when step is empty", () => {
    expect(buildAgentRunProgressLabel("", "Harness 2/8: Blueprint…")).toBe("Harness 2/8: Blueprint…");
  });
});

describe("isAgentRunNodeDiagnosticLabel", () => {
  it("detects NODE_TLS_REJECT_UNAUTHORIZED process warnings", () => {
    expect(
      isAgentRunNodeDiagnosticLabel(
        "(node:30860) Warning: Setting the NODE_TLS_REJECT_UNAUTHORIZED environment variable to '0' makes TLS connections and HTTPS requests insecure by disabling certificate verification. (Use `node --trace-warnings ...` to show where the warning was created)",
      ),
    ).toBe(true);
  });

  it("leaves real progress labels alone", () => {
    expect(isAgentRunNodeDiagnosticLabel("Post creator server job started")).toBe(false);
    expect(isAgentRunNodeDiagnosticLabel("1 post URLs loaded, KW JSON (496 keywords)")).toBe(false);
  });
});

describe("agentRunStatusHint", () => {
  it("prefers harness detail tail over stale step prefix", () => {
    expect(
      agentRunStatusHint("SERP research brief complete · Harness 3/8: Blueprint and content…"),
    ).toBe("Harness 3/8: Blueprint and content…");
  });

  it("falls back to single-line label", () => {
    expect(agentRunStatusHint("Starting optimization…")).toBe("Starting optimization…");
  });

  it("hides Node TLS process warnings", () => {
    expect(
      agentRunStatusHint(
        "(node:30860) Warning: Setting the NODE_TLS_REJECT_UNAUTHORIZED environment variable to '0' makes TLS connections and HTTPS requests insecure by disabling certificate verification.",
      ),
    ).toBeNull();
  });
});

describe("agentRunInlineStatus", () => {
  it("shows detail line only when split", () => {
    expect(
      agentRunInlineStatus("SERP research brief complete · Harness 1/8: Overview…"),
    ).toBe("Harness 1/8: Overview…");
  });
});

describe("splitProgressLabel", () => {
  it("splits on middle dot separator", () => {
    expect(splitProgressLabel("Step one · Step two")).toEqual({
      line1: "Step one",
      line2: "Step two",
    });
  });
});

describe("agentRunCardTitle", () => {
  it("strips client suffix from title when grouped under client folder", () => {
    const run = {
      id: 75,
      title: "Create scheduled blog posts — Advance Blinds",
      recipeTitle: "Post creator",
    } as AgentRun;
    expect(agentRunCardTitle(run, "Advance Blinds")).toBe("Create scheduled blog posts");
  });

  it("keeps title when client suffix does not match", () => {
    const run = {
      id: 1,
      title: "Create scheduled blog posts — Advance Blinds",
      recipeTitle: "Post creator",
    } as AgentRun;
    expect(agentRunCardTitle(run, "Other Site")).toBe("Create scheduled blog posts — Advance Blinds");
  });
});

describe("agentRunCollapsedHint", () => {
  it("prefers terminal error message for failed post_creator runs", () => {
    const run = {
      id: 75,
      recipeKey: "post_creator",
      status: "failed",
      errorMessage: "Blueprint generation failed: Blueprint missing agents.",
      recipeTitle: "Post creator",
      source: "task_manager",
      taskId: 0,
      context: {},
      plan: {},
      createdAt: "",
      updatedAt: "",
    } as AgentRun;
    expect(agentRunCollapsedHint(run, null, 0)).toBe(
      "Blueprint generation failed: Blueprint missing agents.",
    );
  });

  it("shows result message instead of duplicate Done status label", () => {
    const run = {
      id: 83,
      recipeKey: "gsc_reporting",
      status: "done",
      recipeTitle: "GSC reporting",
      source: "task_manager",
      taskId: 1,
      context: {},
      plan: {},
      result: { message: "GSC MoM report generated" },
      createdAt: "",
      updatedAt: "",
    } as AgentRun;
    expect(
      agentRunCollapsedHint(
        run,
        {
          isLive: false,
          currentUrl: null,
          postTitle: null,
          progressLabel: "Done",
          positionLabel: null,
          percent: 100,
          generatedFiles: [],
          completedUrlFiles: [],
        },
        0,
      ),
    ).toBe("GSC MoM report generated");
  });

  it("hides hint when it only repeats the terminal status pill label", () => {
    const run = {
      id: 84,
      recipeKey: "local_dominator_export",
      status: "cancelled",
      recipeTitle: "Grid export",
      source: "workflow",
      taskId: 0,
      context: {},
      plan: {},
      createdAt: "",
      updatedAt: "",
    } as AgentRun;
    expect(
      agentRunCollapsedHint(
        run,
        {
          isLive: false,
          currentUrl: null,
          postTitle: null,
          progressLabel: "Cancelled",
          positionLabel: null,
          percent: 0,
          generatedFiles: [],
          completedUrlFiles: [],
        },
        0,
      ),
    ).toBe("");
  });

  it("skips Node TLS warnings and shows the recipe title instead", () => {
    const run = {
      id: 91,
      recipeKey: "post_creator",
      status: "running",
      recipeTitle: "Post creator",
      source: "workflow",
      taskId: 0,
      context: {},
      plan: {},
      createdAt: "",
      updatedAt: "",
    } as AgentRun;
    expect(
      agentRunCollapsedHint(
        run,
        {
          isLive: true,
          currentUrl: null,
          postTitle: null,
          progressLabel:
            "(node:30860) Warning: Setting the NODE_TLS_REJECT_UNAUTHORIZED environment variable to '0' makes TLS connections and HTTPS requests insecure by disabling certificate verification.",
          positionLabel: null,
          percent: null,
          generatedFiles: [],
          completedUrlFiles: [],
        },
        0,
      ),
    ).toBe("Post creator");
  });

  it("shows the URL the optimizer is working on", () => {
    const run = {
      id: 90,
      recipeKey: "content_optimizer_bulk",
      status: "running",
      recipeTitle: "Full AISEO",
      source: "workflow",
      taskId: 1,
      context: {},
      plan: {},
      createdAt: "",
      updatedAt: "",
    } as AgentRun;
    expect(
      agentRunCollapsedHint(
        run,
        {
          isLive: true,
          currentUrl: "https://poshoutdoors.com/glamping-tips/",
          postTitle: "Glamping Tips",
          progressLabel: "Working https://poshoutdoors.com/glamping-tips/ (1/12)",
          positionLabel: "1/12",
          percent: 0,
          generatedFiles: [],
          completedUrlFiles: [],
        },
        0,
      ),
    ).toBe("Glamping Tips");
  });
});
