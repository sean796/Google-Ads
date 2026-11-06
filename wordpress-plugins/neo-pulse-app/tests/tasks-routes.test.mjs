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

describe("tasks routes", () => {
  it("registers tasks store and route handlers in loader", () => {
    const loader = readPhp("includes/class-neo-pulse-app-loader.php");
    expect(loader).toContain("class-tasks-store.php");
    expect(loader).toContain("class-tasks-route-handlers.php");
    expect(loader).toContain("class-tasks-assets.php");
    expect(loader).toContain("class-task-execution-store.php");
    expect(loader).toContain("class-task-execution-coordinator.php");
    expect(loader).toContain("class-pulse-assist-action-tools-executions.php");
    expect(loader).toContain("Neo_Pulse_App_Tasks_Store::install_tables()");
    expect(loader).toContain("Neo_Pulse_App_Task_Execution_Store::install_tables()");
  });

  it("mounts tasks dispatch from teams route handlers", () => {
    const teams = readPhp("includes/teams/class-teams-route-handlers.php");
    expect(teams).toContain("Neo_Pulse_App_Tasks_Route_Handlers::dispatch");
    expect(teams).toMatch(/tasks\//);
  });

  it("defines tasks tables and keyword-first payload encoding", () => {
    const store = readPhp("includes/tasks/class-tasks-store.php");
    expect(store).toContain("neo_pulse_team_task_projects");
    expect(store).toContain("neo_pulse_team_tasks");
    expect(store).toContain("neo_pulse_team_task_sections");
    expect(store).toContain("neo_pulse_team_task_notes");
    expect(store).toContain("neo_pulse_team_task_files");
    expect(store).toContain("encode_payload");
    expect(store).toContain("'keyword' => $keyword");
    expect(store).toContain("list_my_tasks");
    expect(store).toContain("parent_task_id");
    expect(store).toContain("section_id");
  });

  it("defines v2 API routes", () => {
    const routes = readPhp("includes/tasks/class-tasks-route-handlers.php");
    expect(routes).toContain("'my'");
    expect(routes).toContain("'search'");
    expect(routes).toContain("'tags'");
    expect(routes).toContain("/sections");
    expect(routes).toContain("/subtasks");
    expect(routes).toContain("/files");
    expect(routes).toContain("/execute");
    expect(routes).toContain("executions/");
    expect(routes).toContain("Task_Execution_Coordinator");

    const store = readPhp("includes/tasks/class-tasks-store.php");
    expect(store).toContain("mentionUserIds");
    expect(store).toContain("EXECUTION_KINDS");
    expect(store).toContain("task_has_pulse_assignee");
    expect(store).toContain("executionKind");
  });

  it("stores task files under tasks/teams path", () => {
    const assets = readPhp("includes/tasks/class-tasks-assets.php");
    expect(assets).toContain("tasks/teams/");

    const routes = readPhp("includes/tasks/class-tasks-route-handlers.php");
    expect(routes).toContain("dataBase64");
  });

  it("cascade deletes tasks when a section is deleted", () => {
    const store = readPhp("includes/tasks/class-tasks-store.php");
    expect(store).toContain("delete_section");
    expect(store).toContain("list_subtasks");
    expect(store).toContain("delete_task");
    expect(store).toMatch(/section_id = %d[\s\S]*delete_task/);
  });
});
