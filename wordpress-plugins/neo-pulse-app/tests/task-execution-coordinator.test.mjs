import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readPhp(relativePath) {
  const content = readFileSync(join(root, relativePath), "utf8");
  if (relativePath !== "includes/tasks/class-tasks-store.php") {
    return content;
  }
  const tasksDir = join(root, "includes/tasks");
  const traitFiles = readdirSync(tasksDir)
    .filter((name) => name.startsWith("trait-tasks-store-") && name.endsWith(".php"))
    .sort();
  const traits = traitFiles.map((name) => readFileSync(join(tasksDir, name), "utf8"));
  return [content, ...traits].join("\n");
}

describe("task execution coordinator", () => {
  it("defines execution statuses and terminal states", () => {
    const store = readPhp("includes/task-execution/class-task-execution-store.php");
    expect(store).toContain("awaiting_client");
    expect(store).toContain("preflight");
    expect(store).toContain("neo_pulse_team_task_executions");
  });

  it("routes content optimizer kinds through registry", () => {
    const registry = readPhp("includes/task-execution/class-task-execution-registry.php");
    expect(registry).toContain("content_optimizer");
    expect(registry).toContain("content_optimizer_meta");
    expect(registry).toContain("Neo_Pulse_App_Task_Execution_Runner_Content_Optimizer");
  });

  it("meta runner completes server-side without awaiting_client branch in coordinator", () => {
    const runner = readPhp("includes/task-execution/runners/class-task-execution-runner-content-optimizer.php");
    expect(runner).toContain("content_optimizer_meta");
    expect(runner).toContain("Overview_Meta_Ai::run_optimize_meta_ai");
    expect(runner).toContain("awaiting_client");
    expect(runner).toContain("clientRunContract");
    expect(runner).toContain("awaiting_client_all_contract");
    expect(runner).toContain("'ALL'");

    const store = readPhp("includes/tasks/class-tasks-store.php");
    expect(store).toContain("is_execution_target_all");
    expect(store).toContain("sanitize_execution_target_url");
    expect(store).toContain("sanitize_execution_target_bucket");
    expect(store).toContain("targetBucket");

    const coordinator = readPhp("includes/task-execution/class-task-execution-coordinator.php");
    expect(coordinator).toContain("patch_progress");
    expect(coordinator).toContain("awaiting_client");
    expect(coordinator).toContain("task_has_pulse_assignee");
  });

  it("registers pulse assist execution tools", () => {
    const registry = readPhp("includes/pulse-assist/action/class-pulse-assist-action-registry.php");
    expect(registry).toContain("executions_start");
    expect(registry).toContain("executions_get");
    expect(registry).toContain("executions_list_for_task");

    const tools = readPhp("includes/pulse-assist/action/class-pulse-assist-action-tools-executions.php");
    expect(tools).toContain("Task_Execution_Coordinator::start");
  });
});
