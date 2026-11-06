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

describe("pulse assist action tools", () => {
  it("registers recipe catalog tools", () => {
    const registry = readPhp("includes/pulse-assist/action/class-pulse-assist-action-registry.php");
    expect(registry).toContain("recipes_list");
    expect(registry).toContain("recipes_install");
    expect(registry).toContain("recipes_run");

    const loader = readPhp("includes/class-neo-pulse-app-loader.php");
    expect(loader).toContain("class-automation-recipe-registry.php");
    expect(loader).toContain("class-pulse-assist-action-tools-recipes.php");

    const routes = readPhp("includes/tasks/class-tasks-route-handlers.php");
    expect(routes).toContain("automation-recipes");
  });

  it("registers Pulse Forge dashboard and workflow tools with build write gate", () => {
    const registry = readPhp("includes/pulse-assist/action/class-pulse-assist-action-registry.php");
    expect(registry).toContain("forge_dashboard");
    expect(registry).toContain("workflows_list");
    expect(registry).toContain("workflows_get");
    expect(registry).toContain("workflows_list_runs");
    expect(registry).toContain("workflows_create");
    expect(registry).toContain("workflows_publish");
    expect(registry).toContain("workflows_run");

    const forge = readPhp("includes/pulse-assist/action/class-pulse-assist-action-tools-forge.php");
    expect(forge).toContain("graph_from_recipe_keyword");
    expect(forge).toContain("Recipe has no trigger or action blocks.");
    expect(forge).toContain("Valid recipe keyword is required.");
    expect(forge).toContain("'nodes'");
    expect(forge).toContain("'edges'");

    const loader = readPhp("includes/class-neo-pulse-app-loader.php");
    expect(loader).toContain("class-pulse-assist-action-tools-forge.php");

    const intent = readPhp("includes/pulse-assist/action/class-pulse-assist-action-intent.php");
    expect(intent).toContain("is_forge_message");
    expect(intent).toContain("forge_resolver");

    const lead = readPhp("includes/pulse-assist/action/class-pulse-assist-action-lead-agent.php");
    expect(lead).toContain("workflows_create");
    expect(lead).toContain("Do not emit nodes or edges");

    const orchestrator = readPhp("includes/pulse-assist/action/class-pulse-assist-action-orchestrator.php");
    expect(orchestrator).toContain("Created workflow");
    expect(orchestrator).toContain("pulseForge");
    expect(orchestrator).toContain("pulse-forge/forge");
  });

  it("defines read and write task tools with build gate", () => {
    const registry = readPhp("includes/pulse-assist/action/class-pulse-assist-action-registry.php");
    expect(registry).toContain("tasks_create_batch");
    expect(registry).toContain("tasks_list_projects");
    expect(registry).toContain("MAX_BATCH_TASKS");
    expect(registry).toContain("'submodes'    => array( 'build' )");

    const tools = readPhp("includes/pulse-assist/action/class-pulse-assist-action-tools-tasks.php");
    expect(tools).toContain("Neo_Pulse_App_Tasks_Store::create_task");
    expect(tools).toContain("create_batch");
    expect(tools).toContain("resolve_project_id");
    expect(tools).toContain("resolve_member_id");
    expect(tools).toContain("project_label_for_card");
    expect(tools).toContain("client_display_name");

    const orchestrator = readPhp("includes/pulse-assist/action/class-pulse-assist-action-orchestrator.php");
    expect(orchestrator).toContain("normalize_execution");
    expect(orchestrator).toContain("Ask mode is preview only");
  });

  it("wires orchestrator into pulse assist ask pipeline", () => {
    const ask = readPhp("includes/pulse-assist/class-pulse-assist-ask.php");
    expect(ask).toContain("Neo_Pulse_App_Pulse_Assist_Action_Orchestrator::run");
    expect(ask).toContain("build_no_action_card");
    expect(ask).not.toContain("Build writes are not available in Pulse Assist yet");
  });

  it("executor streams tool events", () => {
    const executor = readPhp("includes/pulse-assist/action/class-pulse-assist-action-executor.php");
    expect(executor).toContain("'status' => 'tool'");
    expect(executor).toContain("allowed_for_submode");
    expect(executor).toContain("createdProjectIds");
  });

  it("routes project creation intents including typo stems", () => {
    const intent = readPhp("includes/pulse-assist/action/class-pulse-assist-action-intent.php");
    expect(intent).toContain("is_project_create_message");
    expect(intent).toContain("create project");
    expect(intent).toContain("project_creator");
    expect(intent).toContain("extract_project_title");

    const lead = readPhp("includes/pulse-assist/action/class-pulse-assist-action-lead-agent.php");
    expect(lead).toContain("tasks_create_project");

    const orchestrator = readPhp("includes/pulse-assist/action/class-pulse-assist-action-orchestrator.php");
    expect(orchestrator).toContain("Created project");
    expect(orchestrator).toContain("createdProjectIds");
  });

  it("registers ads_reporting_execute before GSC steal on PPC phrasing", () => {
    const registry = readPhp("includes/pulse-assist/action/class-pulse-assist-action-registry.php");
    expect(registry).toContain("ads_reporting_execute");

    const executions = readPhp("includes/pulse-assist/action/class-pulse-assist-action-tools-executions.php");
    expect(executions).toContain("ads_reporting_execute");
    expect(executions).toContain("'recipeKey' => 'ads_reporting'");
    expect(executions).toContain("Set a 10-digit Google Ads customer ID on this property.");

    const intent = readPhp("includes/pulse-assist/action/class-pulse-assist-automation-intent.php");
    const adsIdx = intent.indexOf("is_ads_reporting");
    const gscIdx = intent.indexOf("is_gsc_reporting");
    expect(adsIdx).toBeGreaterThan(0);
    expect(gscIdx).toBeGreaterThan(adsIdx);
    expect(intent).toContain("'ppc report'");
    expect(intent).toContain("'ads_reporting'");

    const lead = readPhp("includes/pulse-assist/action/class-pulse-assist-action-lead-agent.php");
    expect(lead).toContain("ads_reporting_execute");
    expect(lead).toContain("ads-monthly-mom-report");
    expect(lead).toContain("Do not use gsc_reporting_execute for Ads or PPC spend");
  });

  it("handles compound project + task intents with title normalization and chaining", () => {
    const intent = readPhp("includes/pulse-assist/action/class-pulse-assist-action-intent.php");
    expect(intent).toContain("is_compound_project_task_message");
    expect(intent).toContain("extract_task_title_hint");
    expect(intent).toContain("normalize_display_title");
    expect(intent).toContain("build_task_title_from_hint");
    expect(intent).toContain(" and add");
    expect(intent).toContain("task_decomposer");

    const lead = readPhp("includes/pulse-assist/action/class-pulse-assist-action-lead-agent.php");
    expect(lead).toContain("compoundProjectTask");
    expect(lead).toContain("Task', 'Project', 'Due");

    const orchestrator = readPhp("includes/pulse-assist/action/class-pulse-assist-action-orchestrator.php");
    expect(orchestrator).toContain("Created project and ");
    expect(orchestrator).toContain("build_execution_summary_body");
    expect(orchestrator).toContain("compoundProjectTask");
    expect(orchestrator).toContain("Project created, task missing");

    const executor = readPhp("includes/pulse-assist/action/class-pulse-assist-action-executor.php");
    expect(executor).toContain("active_project_id");
    expect(executor).toContain("tasks_create_batch");
  });

  it("supports template save/load tools and UI client pickers", () => {
    const store = readPhp("includes/tasks/class-tasks-store.php");
    expect(store).toContain("upsert_template");
    expect(store).toContain("delete_template");
    expect(store).toContain("apply_client_to_task_title");

    const routes = readPhp("includes/tasks/class-tasks-route-handlers.php");
    expect(routes).toContain("templates/upsert");
    expect(routes).toContain("templates/from-project");

    const registry = readPhp("includes/pulse-assist/action/class-pulse-assist-action-registry.php");
    expect(registry).toContain("tasks_save_template");
    expect(registry).toContain("tasks_delete_template");

    const intent = readPhp("includes/pulse-assist/action/class-pulse-assist-action-intent.php");
    expect(intent).toContain("template_resolver");
    expect(intent).toContain("is_template_message");

    const orchestrator = readPhp("includes/pulse-assist/action/class-pulse-assist-action-orchestrator.php");
    expect(orchestrator).toContain("Saved template");
    expect(orchestrator).toContain("Deleted template");

    const newProject = readFileSync(join(root, "../../src/components/manager/tasks/NewProjectDialog.tsx"), "utf8");
    expect(newProject).toContain("Save as template");
    expect(newProject).toContain('placeholder="Client"');
  });
});
