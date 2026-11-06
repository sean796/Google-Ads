import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readPhp(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("workflow client publish cron", () => {
  it("evaluates Client calendar only and stores a once-per-period key", () => {
    const evaluator = readPhp("includes/workflows/class-workflow-trigger-evaluator.php");
    expect(evaluator).toContain("self::client_node( $workflow )");
    expect(evaluator).toContain("'workflow_client'");
    expect(evaluator).toContain("'periodKey' => $period_key");
    expect(evaluator).toContain("already_ran_period");
    expect(evaluator).toContain("return $now->format( 'Y-m' ) . ':' . $time;");
    expect(evaluator).toContain("if ( $now_min < $due_min )");
    expect(evaluator).toContain("strlen( $start_date ) < 10");
    expect(evaluator).not.toMatch(/enqueue\(\s*\$team_id,\s*\$workflow_id,\s*'trigger_calendar'/);
    expect(evaluator).not.toContain("Neo_Pulse_App_Workflow_Cron_Expression::is_due");
  });

  it("cancels leftover queued/running on Client calendar enqueue instead of skipping", () => {
    const evaluator = readPhp("includes/workflows/class-workflow-trigger-evaluator.php");
    expect(evaluator).toContain("cancel_leftover_runs( $team_id, $workflow_id )");
    expect(evaluator).toContain("$kind === 'workflow_client'");
    expect(evaluator).toContain("elseif ( ! $simulated && Neo_Pulse_App_Workflows_Store::has_active_run");

    const store = readPhp("includes/workflows/class-workflows-store.php");
    expect(store).toContain("function cancel_leftover_runs");
    expect(store).toContain("Replaced by due schedule");
    expect(store).toContain("status IN ('queued','running')");
  });

  it("starts the first agent from Client when afterNodeId is empty", () => {
    const dispatch = readPhp("includes/workflows/class-workflow-server-dispatch.php");
    expect(dispatch).toContain("client_node_id( $workflow )");
    expect(dispatch).toContain("is_dispatchable_action");
    expect(dispatch).toContain("client_site_ids_from_workflow");
    expect(dispatch).toContain("foreach ( $site_ids as $site_id )");
    expect(dispatch).toContain("Select at least one client on the Client step.");
    expect(dispatch).not.toContain("$nodes[0]");
    expect(dispatch).not.toContain("function client_site_id_from_workflow");
  });

  it("exposes POST workflows/cron/tick and evaluates from the 5-minute worker", () => {
    const routes = readPhp("includes/workflows/class-workflows-route-handlers.php");
    expect(routes).toContain("$sub === 'cron/tick'");
    expect(routes).toContain("evaluate_team( $team_id )");
    expect(routes).toContain("drain_pending( $team_id )");

    const worker = readPhp("includes/agent-runs/class-agent-run-worker-cron.php");
    expect(worker).toContain("Neo_Pulse_App_Workflow_Trigger_Cron::run()");
    expect(worker).toContain("neo_pulse_five_minutes");
    expect(worker).toContain("INTERVAL_SECONDS = 300");
    expect(worker).toContain("next_five_minute_ts");
    expect(worker).not.toContain("neo_pulse_two_minutes");

    const host = readFileSync(join(root, "../../scripts/local-dominator-worker-server.mjs"), "utf8");
    expect(host).toContain("5 * 60 * 1000");
    expect(host).toContain("msUntilNextTick");
    expect(host).not.toContain("120000");

    const layout = readFileSync(
      join(root, "../../src/components/manager/tasks/task-form-date-time-helpers.ts"),
      "utf8",
    );
    expect(layout).toContain("const SCHEDULE_TICK_MINUTES = 5");
    expect(layout).toContain("minute += SCHEDULE_TICK_MINUTES");
    expect(layout).not.toContain("minute += 15");
  });
});
