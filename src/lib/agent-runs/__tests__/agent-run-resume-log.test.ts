import { describe, expect, it } from "vitest";
import {
  checkpointFieldsFromStepPayload,
  readAgentRunCheckpoint,
  stripHeavyAgentRunStepPayload,
} from "@/lib/agent-runs/agent-run-checkpoint";
import { getAgentRunResumePoint, agentRunHasResumeProgress } from "@/lib/agent-runs/agent-run-resume";
import {
  formatAgentRunLogJson,
  formatAgentRunLogTimeline,
  normalizeAgentRunStepsForDisplay,
} from "@/lib/agent-runs/agent-run-log-format";
import type { AgentRun } from "@/lib/agent-runs-types";

function baseRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 1,
    teamId: 1,
    createdBy: 1,
    title: "Test run",
    recipeKey: "post_creator",
    recipeTitle: "Post creator",
    status: "running",
    source: "task_manager",
    taskId: 0,
    taskTitle: "",
    context: {},
    plan: {},
    result: null,
    errorMessage: "",
    clientBatchKey: "",
    startedAt: "2026-08-16T12:00:00.000Z",
    finishedAt: null,
    createdAt: "2026-08-16T12:00:00.000Z",
    updatedAt: "2026-08-16T12:00:00.000Z",
    steps: [],
    ...overrides,
  };
}

describe("agent-run-resume", () => {
  it("returns resume point from last step with payload", () => {
    const run = baseRun({
      steps: [
        {
          id: 1,
          stepIndex: 0,
          label: "Post 2/3: uploading…",
          status: "running",
          createdAt: "2026-08-16T12:05:00.000Z",
          payload: { phase: "bulk", rowIndex: 1, postCount: 3 },
        },
      ],
    });
    const point = getAgentRunResumePoint(run);
    expect(point?.label).toBe("Post 2/3: uploading…");
    expect(point?.payload.rowIndex).toBe(1);
    expect(agentRunHasResumeProgress(run)).toBe(true);
  });

  it("ignores Starting step as resume point", () => {
    const run = baseRun({
      steps: [{ id: 1, stepIndex: 0, label: "Starting…", status: "running", createdAt: "" }],
    });
    expect(getAgentRunResumePoint(run)).toBeNull();
  });
});

describe("checkpointFieldsFromStepPayload", () => {
  it("maps bulk payload fields onto checkpoint", () => {
    const existing = readAgentRunCheckpoint(null);
    const patch = checkpointFieldsFromStepPayload("Optimizing 2/5", "2026-08-16T12:00:00.000Z", {
      currentIndex: 1,
      totalCount: 5,
      uploadedUrls: ["https://example.com/a"],
      completedUrls: ["https://example.com/a"],
    }, existing);
    expect(patch.currentIndex).toBe(1);
    expect(patch.totalCount).toBe(5);
    expect(patch.uploadedUrls).toEqual(["https://example.com/a"]);
  });
});

describe("stripHeavyAgentRunStepPayload", () => {
  it("removes GSC CSV bodies from the run payload", () => {
    const stripped = stripHeavyAgentRunStepPayload({
      phase: "gsc_outline",
      cachedFiles: [{ name: "Queries-MoM.csv", content: "q".repeat(1000) }],
      outlineRequestBodyJson: "{\"huge\":true}",
    });
    expect(stripped.cachedFiles).toBeUndefined();
    expect(stripped.outlineRequestBodyJson).toBeUndefined();
    expect(stripped.cachedFileCount).toBe(1);
    expect(stripped.cachedFileNames).toEqual(["Queries-MoM.csv"]);
    expect(stripped.phase).toBe("gsc_outline");
  });
});

describe("agent-run-log-format", () => {
  it("builds structured JSON export", () => {
    const run = baseRun({
      steps: [
        {
          id: 1,
          stepIndex: 0,
          stepKey: "content-bucket",
          label: "Loading content bucket…",
          status: "running",
          createdAt: "2026-08-16T12:00:00.000Z",
        },
      ],
    });
    const json = formatAgentRunLogJson(run, run.steps ?? []);
    expect(json.run.title).toBe("Test run");
    expect(json.steps[0]?.stepKey).toBe("content-bucket");
    expect(JSON.stringify(json)).toContain("Loading content bucket");
  });

  it("normalizes duplicate and resume-noise steps", () => {
    const steps = [
      {
        id: 1,
        stepIndex: 0,
        stepKey: "preflight",
        label: "Preflight",
        status: "done" as const,
        createdAt: "2026-08-16T12:00:00.000Z",
      },
      {
        id: 2,
        stepIndex: 1,
        label: "Resuming: Preflight",
        status: "running" as const,
        createdAt: "2026-08-16T12:01:00.000Z",
      },
      {
        id: 3,
        stepIndex: 2,
        stepKey: "preflight",
        label: "Preflight",
        status: "running" as const,
        createdAt: "2026-08-16T12:02:00.000Z",
      },
    ];
    const normalized = normalizeAgentRunStepsForDisplay(steps);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.label).toBe("Preflight");
  });

  it("collapses site audit progress steps to the latest row", () => {
    const steps = [
      {
        id: 1,
        stepIndex: 0,
        stepKey: "starting",
        label: "Starting…",
        status: "done" as const,
        createdAt: "2026-08-20T21:45:36.586Z",
      },
      ...Array.from({ length: 5 }, (_, index) => ({
        id: index + 2,
        stepIndex: index + 1,
        label: `Site audit ${index + 1}/299: /page-${index + 1}`,
        status: "running" as const,
        createdAt: `2026-08-20T21:46:${String(index).padStart(2, "0")}.000Z`,
      })),
      {
        id: 8,
        stepIndex: 7,
        label: "Browser automation complete",
        status: "done" as const,
        createdAt: "2026-08-20T21:58:09.447Z",
      },
    ];
    const normalized = normalizeAgentRunStepsForDisplay(steps);
    expect(normalized).toHaveLength(3);
    expect(normalized[1]?.label).toBe("Site audit 5/299: /page-5");
  });

  it("shows keyed GSC progress without legacy duplicate rows", () => {
    const steps = [
      {
        id: 1,
        stepIndex: 0,
        stepKey: "starting",
        label: "Starting…",
        status: "running" as const,
        createdAt: "2026-08-21T12:32:48.000Z",
      },
      {
        id: 2,
        stepIndex: 1,
        stepKey: "preflight",
        label: "Preflight",
        status: "running" as const,
        createdAt: "2026-08-21T12:32:49.000Z",
      },
      {
        id: 3,
        stepIndex: 2,
        stepKey: "gsc-section",
        label: "Section 3/5: Key Performance Insights for the Team…",
        status: "running" as const,
        createdAt: "2026-08-21T12:32:50.000Z",
      },
      {
        id: 4,
        stepIndex: 3,
        stepKey: "gsc-deliverables",
        label: "Deliverables (7/7)",
        status: "running" as const,
        createdAt: "2026-08-21T12:32:51.000Z",
      },
    ];
    const normalized = normalizeAgentRunStepsForDisplay(steps);
    expect(normalized.map((step) => step.stepKey)).toEqual([
      "starting",
      "preflight",
      "gsc-section",
      "gsc-deliverables",
    ]);
  });

  it("sorts keyed steps by createdAt then stepIndex", () => {
    const steps = [
      {
        id: 1,
        stepIndex: 3,
        stepKey: "gsc-outline",
        label: "Outline complete",
        status: "running" as const,
        createdAt: "2026-08-21T12:16:02.000Z",
      },
      {
        id: 2,
        stepIndex: 2,
        stepKey: "gsc-section-0",
        label: "Section 1/7: Executive Summary complete",
        status: "running" as const,
        createdAt: "2026-08-21T12:16:05.000Z",
      },
      {
        id: 3,
        stepIndex: 1,
        stepKey: "gsc-bundle-ready",
        label: "GSC reporting bundle ready",
        status: "running" as const,
        createdAt: "2026-08-21T12:16:00.000Z",
      },
    ];
    const normalized = normalizeAgentRunStepsForDisplay(steps);
    expect(normalized.map((step) => step.stepKey)).toEqual([
      "gsc-bundle-ready",
      "gsc-outline",
      "gsc-section-0",
    ]);
  });

  it("filters Complete and Done from log export", () => {
    const run = baseRun({
      steps: [
        {
          id: 1,
          stepIndex: 0,
          label: "Section 1/5: Executive Summary…",
          status: "running",
          createdAt: "2026-08-21T12:15:00.000Z",
        },
        {
          id: 2,
          stepIndex: 1,
          label: "Complete",
          status: "done",
          createdAt: "2026-08-21T12:16:08.000Z",
        },
      ],
    });
    const json = formatAgentRunLogJson(run, run.steps ?? []);
    expect(json.steps.map((step) => step.label)).toEqual(["Section 1/5: Executive Summary…"]);
    expect(json.steps[0]?.status).toBe("running");
  });

  it("strips GSC cached file bodies from exported step payloads", () => {
    const run = baseRun({
      result: {
        checkpoint: {
          completedUrls: [],
          uploadedUrls: [],
          lastStepPayload: {
            phase: "gsc_outline",
            cachedFiles: [{ name: "Queries-MoM.csv", content: "z".repeat(8000) }],
          },
        },
      },
      steps: [
        {
          id: 1,
          stepIndex: 0,
          label: "GSC reporting bundle ready",
          status: "running",
          createdAt: "2026-08-21T12:14:28.000Z",
          payload: {
            phase: "gsc_outline",
            cachedFiles: [
              { name: "Pages-MoM.csv", content: "x".repeat(5000) },
              { name: "Queries-MoM.csv", content: "y".repeat(3000) },
            ],
          },
        },
      ],
    });
    const json = formatAgentRunLogJson(run, run.steps ?? []);
    const payload = json.steps[0]?.payload as Record<string, unknown>;
    expect(payload.cachedFiles).toBeUndefined();
    expect(payload.cachedFileCount).toBe(2);
    expect(payload.cachedFileNames).toEqual(["Pages-MoM.csv", "Queries-MoM.csv"]);
    const checkpointPayload = json.checkpoint?.lastStepPayload as Record<string, unknown> | undefined;
    expect(checkpointPayload?.cachedFiles).toBeUndefined();
    expect(checkpointPayload?.cachedFileCount).toBe(1);
    expect(JSON.stringify(json).length).toBeLessThan(2000);
  });

  it("formats timeline rows with time and label", () => {
    const run = baseRun({
      steps: [
        {
          id: 1,
          stepIndex: 0,
          label: "Generating blog ideas…",
          status: "running",
          createdAt: "2026-08-16T12:01:00.000Z",
        },
      ],
    });
    const rows = formatAgentRunLogTimeline(run, run.steps ?? [], "Generating blog ideas…");
    expect(rows[0]?.label).toBe("Generating blog ideas…");
    expect(rows[0]?.timeLabel.length).toBeGreaterThan(0);
  });

  it("shows Drive folder as a clickable artifact and strips plain folderId from the label", () => {
    const run = baseRun({
      steps: [
        {
          id: 1,
          stepIndex: 0,
          stepKey: "automation-google-drive-resolve",
          label:
            "Google Drive: resolving folder (NEO Pulse / Advance Blinds / Reporting / 2026 / August) · single, folderId 1YrbOxNXBkYBp7GLGIUoSd07WGU8e0VEd",
          status: "running",
          createdAt: "2026-08-21T16:41:00.000Z",
          payload: {
            folderId: "1YrbOxNXBkYBp7GLGIUoSd07WGU8e0VEd",
            folderUrl: "https://drive.google.com/drive/folders/1YrbOxNXBkYBp7GLGIUoSd07WGU8e0VEd",
          },
        },
      ],
    });
    const rows = formatAgentRunLogTimeline(run, run.steps ?? []);
    expect(rows[0]?.label).toBe(
      "Google Drive: resolving folder (NEO Pulse / Advance Blinds / Reporting / 2026 / August) · single",
    );
    expect(rows[0]?.label).not.toMatch(/folderId/i);
    expect(rows[0]?.artifacts).toEqual([
      expect.objectContaining({
        name: "August",
        url: "https://drive.google.com/drive/folders/1YrbOxNXBkYBp7GLGIUoSd07WGU8e0VEd",
      }),
    ]);
  });

  it("hides Node TLS process warnings from the progress log", () => {
    const steps = [
      {
        id: 1,
        stepIndex: 0,
        label: "Post creator server job started",
        status: "running" as const,
        createdAt: "2026-09-14T17:58:00.000Z",
      },
      {
        id: 2,
        stepIndex: 1,
        label:
          "(node:30860) Warning: Setting the NODE_TLS_REJECT_UNAUTHORIZED environment variable to '0' makes TLS connections and HTTPS requests insecure by disabling certificate verification.",
        status: "running" as const,
        createdAt: "2026-09-14T17:58:01.000Z",
      },
      {
        id: 3,
        stepIndex: 2,
        label: "1 post URLs loaded, KW JSON (496 keywords)",
        status: "running" as const,
        createdAt: "2026-09-14T17:58:02.000Z",
      },
    ];
    const normalized = normalizeAgentRunStepsForDisplay(steps);
    expect(normalized.map((step) => step.label)).toEqual([
      "Post creator server job started",
      "1 post URLs loaded, KW JSON (496 keywords)",
    ]);
  });
});
