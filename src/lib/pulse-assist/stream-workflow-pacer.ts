import {
  AGENTS_PHASE_MIN_MS,
  INITIAL_WORKFLOW,
  LEAD_PHASE_MIN_MS,
  WORKFLOW_DONE_BEAT_MS,
  applyStreamEvent,
  sleep,
  type WorkflowState,
} from "./stream-workflow-state";
import type { AssistStreamEvent } from "./types";
export class WorkflowPacer {
  private target: WorkflowState = INITIAL_WORKFLOW;

  private agentIds: string[] = [];

  private agentsFinished = new Set<string>();

  private leadFinished = false;

  private phase: "agents" | "lead" | "complete" = "agents";

  private phaseAt = Date.now();

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private onDisplay: (workflow: WorkflowState) => void) {}

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  ingest(evt: AssistStreamEvent): void {
    this.target = applyStreamEvent(this.target, evt);

    if (evt.status === "agent_plan" && evt.agents?.length) {
      this.agentIds = evt.agents.map((agent, i) => agent.id || `agent-${i}`);
      this.agentsFinished.clear();
      this.leadFinished = false;
      this.phase = "agents";
      this.phaseAt = Date.now();
      this.pushDisplay(this.agentsRunningView());
      this.scheduleTick();
      return;
    }

    if (evt.status === "agent" && evt.id && (evt.state === "done" || evt.state === "error")) {
      this.agentsFinished.add(evt.id);
    }

    if (evt.status === "lead" && evt.state === "done") {
      this.leadFinished = true;
    }

    this.scheduleTick();
  }

  async waitUntilResultReady(): Promise<void> {
    while (this.phase !== "complete") {
      this.tick();
      await sleep(40);
    }
    await sleep(WORKFLOW_DONE_BEAT_MS);
  }

  private scheduleTick(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    const wait = this.msUntilTick();
    if (wait <= 0) {
      this.tick();
      return;
    }
    this.timer = setTimeout(() => this.tick(), wait);
  }

  private msUntilTick(): number {
    const elapsed = Date.now() - this.phaseAt;
    if (this.phase === "agents") {
      const minRemaining = AGENTS_PHASE_MIN_MS - elapsed;
      if (minRemaining > 0) {
        return minRemaining;
      }
      if (!this.allAgentsFinished()) {
        return 80;
      }
      return 0;
    }
    if (this.phase === "lead") {
      const minRemaining = LEAD_PHASE_MIN_MS - elapsed;
      if (minRemaining > 0) {
        return minRemaining;
      }
      if (!this.leadFinished) {
        return 80;
      }
      return 0;
    }
    return 0;
  }

  private tick(): void {
    const elapsed = Date.now() - this.phaseAt;

    if (this.phase === "agents") {
      this.pushDisplay(this.agentsRunningView());
      if (elapsed >= AGENTS_PHASE_MIN_MS && this.allAgentsFinished()) {
        this.phase = "lead";
        this.phaseAt = Date.now();
        this.pushDisplay(this.leadRunningView());
      }
      if (this.phase === "agents") {
        this.scheduleTick();
      } else {
        this.scheduleTick();
      }
      return;
    }

    if (this.phase === "lead") {
      this.pushDisplay(this.leadRunningView());
      if (elapsed >= LEAD_PHASE_MIN_MS && this.leadFinished) {
        this.phase = "complete";
        this.pushDisplay(this.allDoneView());
        return;
      }
      this.scheduleTick();
    }
  }

  private allAgentsFinished(): boolean {
    return this.agentIds.length > 0 && this.agentIds.every((id) => this.agentsFinished.has(id));
  }

  private agentsRunningView(): WorkflowState {
    return {
      title: this.target.title,
      steps: this.target.steps.map((step) => {
        if (step.step_kind === "agent") {
          return { ...step, status: "running" as const };
        }
        if (step.step_kind === "lead") {
          return { ...step, status: "pending" as const };
        }
        return step;
      }),
    };
  }

  private leadRunningView(): WorkflowState {
    return {
      title: this.target.title,
      steps: this.target.steps.map((step) => {
        if (step.step_kind === "agent") {
          const status = step.status === "error" ? ("error" as const) : ("done" as const);
          return { ...step, status };
        }
        if (step.step_kind === "lead") {
          return { ...step, status: "running" as const };
        }
        return step;
      }),
    };
  }

  private allDoneView(): WorkflowState {
    return {
      title: this.target.title,
      steps: this.target.steps.map((step) => {
        if (step.step_kind === "agent" || step.step_kind === "lead") {
          const status = step.status === "error" ? ("error" as const) : ("done" as const);
          return { ...step, status };
        }
        return step;
      }),
    };
  }

  private pushDisplay(view: WorkflowState): void {
    this.onDisplay(view);
  }
}
