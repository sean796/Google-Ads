import { describe, expect, it, beforeEach } from "vitest";
import { AGENT_RUN_STEP_KEYS, gscSectionStepKey } from "@/lib/agent-runs/agent-run-step-keys";
import {
  appendAgentRunStepLocally,
  registerAgentRunListPatcher,
} from "@/lib/agent-runs/agent-runs-local-patch";
import { normalizeAgentRunStepsForDisplay } from "@/lib/agent-runs/agent-run-log-format";
import { getAgentRunResumePoint } from "@/lib/agent-runs/agent-run-resume";
import {
  formatGscBundleReadyLabel,
  formatGscOutlineCompleteLabel,
  formatGscSectionCompleteLabel,
  resolveGscAgentProgressStepKey,
} from "@/lib/gsc-reporting/gsc-reporting-progress-log";
import type { AgentRun } from "@/lib/agent-runs-types";

function createRun(steps: AgentRun["steps"] = [], result: AgentRun["result"] = null): AgentRun {
  return {
    id: 924,
    teamId: 1,
    createdBy: 1,
    title: "GSC MoM",
    recipeKey: "gsc_reporting",
    recipeTitle: "GSC reporting",
    status: "running",
    source: "workflow",
    taskId: 0,
    taskTitle: "",
    context: {},
    plan: {},
    result,
    errorMessage: "",
    clientBatchKey: "",
    startedAt: null,
    finishedAt: null,
    createdAt: "",
    updatedAt: "",
    steps,
  };
}

describe("gsc agent step log", () => {
  let run: AgentRun;

  beforeEach(() => {
    run = createRun([]);
    registerAgentRunListPatcher((runId, patch) => {
      if (runId !== run.id) return;
      const next = typeof patch === "function" ? patch(run) : patch;
      run = { ...run, ...next };
    });
  });

  it("keeps each GSC milestone as its own keyed row", () => {
    appendAgentRunStepLocally(
      run.id,
      "GSC reporting bundle API · Jul 2025 vs Jun 2025",
      "running",
      { phase: "gsc_fetch" },
      undefined,
      AGENT_RUN_STEP_KEYS.gscBundleApi,
    );
    appendAgentRunStepLocally(
      run.id,
      formatGscBundleReadyLabel(
        [{ name: "Queries-MoM.csv" }, { name: "Pages-MoM.csv" }],
        "Jul 2025 vs Jun 2025",
      ),
      "running",
      { phase: "gsc_outline" },
      undefined,
      AGENT_RUN_STEP_KEYS.gscBundleReady,
    );
    appendAgentRunStepLocally(
      run.id,
      "Outline complete: 5 sections (Executive Summary, Insights, Content Performance +2 more)",
      "running",
      { phase: "gsc_sections" },
      undefined,
      AGENT_RUN_STEP_KEYS.gscOutline,
    );
    appendAgentRunStepLocally(
      run.id,
      formatGscSectionCompleteLabel(0, 5, "Executive Summary"),
      "running",
      { phase: "gsc_sections", sectionIndex: 0 },
      undefined,
      gscSectionStepKey(0),
    );

    expect(run.steps).toHaveLength(4);
    expect(run.steps?.map((step) => step.stepKey)).toEqual([
      AGENT_RUN_STEP_KEYS.gscBundleApi,
      AGENT_RUN_STEP_KEYS.gscBundleReady,
      AGENT_RUN_STEP_KEYS.gscOutline,
      gscSectionStepKey(0),
    ]);

    appendAgentRunStepLocally(
      run.id,
      formatGscSectionCompleteLabel(1, 5, "Insights"),
      "running",
      { phase: "gsc_sections", sectionIndex: 1 },
      undefined,
      gscSectionStepKey(1),
    );
    expect(run.steps).toHaveLength(5);
    expect(run.steps?.[4]?.label).toBe("Section 2/5: Insights complete");

    const normalized = normalizeAgentRunStepsForDisplay(run.steps ?? []);
    expect(normalized).toHaveLength(5);
  });

  it("formats outline complete with section titles", () => {
    expect(
      formatGscOutlineCompleteLabel([
        { h2Title: "Executive Summary" },
        { h2Title: "Search Performance Compared Month Over Month" },
        { h2Title: "Key Performance Insights for the Team" },
        { h2Title: "SAP & Local SEO Performance" },
      ]),
    ).toBe(
      "Outline complete: 4 sections (Executive Summary, Search Performance Compared Month Over Month, Key Performance Insights for the Team +1 more)",
    );
  });

  it("maps phases to distinct step keys including per-section keys", () => {
    expect(
      resolveGscAgentProgressStepKey("GSC reporting bundle API", { phase: "gsc_fetch" }),
    ).toBe(AGENT_RUN_STEP_KEYS.gscBundleApi);
    expect(
      resolveGscAgentProgressStepKey(formatGscBundleReadyLabel([{ name: "Queries-MoM.csv" }], "MoM"), {
        phase: "gsc_outline",
      }),
    ).toBe(AGENT_RUN_STEP_KEYS.gscBundleReady);
    expect(
      resolveGscAgentProgressStepKey("Outline complete: 7 sections (Executive Summary, Insights +5 more)", {
        phase: "gsc_sections",
      }),
    ).toBe(AGENT_RUN_STEP_KEYS.gscOutline);
    expect(
      resolveGscAgentProgressStepKey("Section 1/5: Executive Summary complete", {
        phase: "gsc_sections",
        sectionIndex: 0,
      }),
    ).toBe(gscSectionStepKey(0));
    expect(
      resolveGscAgentProgressStepKey("Section 2/5: Insights complete", {
        phase: "gsc_sections",
        sectionIndex: 1,
      }),
    ).toBe(gscSectionStepKey(1));
  });

  it("keeps deliverables on a separate keyed row", () => {
    appendAgentRunStepLocally(
      run.id,
      formatGscSectionCompleteLabel(1, 5, "Insights"),
      "running",
      { phase: "gsc_sections", sectionIndex: 1 },
      undefined,
      gscSectionStepKey(1),
    );
    appendAgentRunStepLocally(
      run.id,
      "Deliverables (2/2)",
      "running",
      { artifacts: [{ name: "report.md", url: "https://example.com/report.md" }] },
      undefined,
      AGENT_RUN_STEP_KEYS.gscDeliverables,
    );

    expect(run.steps).toHaveLength(2);
    const normalized = normalizeAgentRunStepsForDisplay(run.steps ?? []);
    expect(normalized.map((step) => step.stepKey)).toEqual([
      gscSectionStepKey(1),
      AGENT_RUN_STEP_KEYS.gscDeliverables,
    ]);
  });

  it("resumes from gsc_sections checkpoint instead of deliverable tail steps", () => {
    const resumeRun = createRun(
      [
        {
          id: 1,
          stepIndex: 0,
          stepKey: gscSectionStepKey(0),
          label: formatGscSectionCompleteLabel(0, 5, "Executive Summary"),
          status: "running",
          createdAt: "2026-08-21T12:40:00.000Z",
          payload: {
            phase: "gsc_sections",
            sectionIndex: 0,
            outline: { sections: [{ id: "s1", h2Title: "Executive Summary", kind: "executive_summary", ragQuery: "x" }] },
            sectionResults: [],
          },
        },
        {
          id: 2,
          stepIndex: 1,
          stepKey: AGENT_RUN_STEP_KEYS.gscDeliverables,
          label: "Deliverables (1/7)",
          status: "running",
          createdAt: "2026-08-21T12:41:00.000Z",
          payload: { artifacts: [{ name: "report.md", url: "https://example.com/report.md" }] },
        },
      ],
      {
        checkpoint: {
          completedUrls: [],
          uploadedUrls: [],
          lastStepLabel: formatGscSectionCompleteLabel(0, 5, "Executive Summary"),
          lastStepAt: "2026-08-21T12:40:00.000Z",
          lastStepPayload: {
            phase: "gsc_sections",
            sectionIndex: 0,
            outline: { sections: [{ id: "s1", h2Title: "Executive Summary", kind: "executive_summary", ragQuery: "x" }] },
            sectionResults: [],
          },
        },
      },
    );

    const resume = getAgentRunResumePoint(resumeRun);
    expect(resume?.label).toBe(formatGscSectionCompleteLabel(0, 5, "Executive Summary"));
    expect(resume?.payload.phase).toBe("gsc_sections");
    expect(resume?.payload.cachedFiles).toBeUndefined();
  });

  it("filters Done and Complete from normalized export", () => {
    appendAgentRunStepLocally(run.id, "GSC reporting bundle API", "running", {}, undefined, AGENT_RUN_STEP_KEYS.gscBundleApi);
    appendAgentRunStepLocally(run.id, "Done", "running", {}, undefined, gscSectionStepKey(0));
    appendAgentRunStepLocally(run.id, "Complete", "done", {}, undefined, AGENT_RUN_STEP_KEYS.complete);

    const normalized = normalizeAgentRunStepsForDisplay(run.steps ?? []);
    expect(normalized.some((step) => step.label.trim() === "Done")).toBe(false);
    expect(normalized.some((step) => step.label.trim() === "Complete")).toBe(false);
    expect(normalized.some((step) => step.stepKey === AGENT_RUN_STEP_KEYS.gscBundleApi)).toBe(true);
  });
});
