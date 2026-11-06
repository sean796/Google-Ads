import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginDir = join(__dirname, "..");

const dispatcherSource = readFileSync(
  join(pluginDir, "includes/router/class-api-dispatcher.php"),
  "utf8",
);
const secretsSource = readFileSync(
  join(pluginDir, "includes/config/class-secrets-loader.php"),
  "utf8",
);
const organicSource = readFileSync(
  join(pluginDir, "includes/organic-dashboard/class-organic-dashboard-route-handlers.php"),
  "utf8",
);
const agentRunsSource = readFileSync(
  join(pluginDir, "includes/agent-runs/class-agent-runs-route-handlers.php"),
  "utf8",
);

describe("server credentials only (Wave 3)", () => {
  it("dispatcher calls DataForSEO handlers directly, no request credential wrapper", () => {
    expect(dispatcherSource).toContain(
      "Neo_Pulse_App_Dataforseo_Route_Handlers::handle_mcp_tool_with_status",
    );
    expect(dispatcherSource).toContain(
      "Neo_Pulse_App_Dataforseo_Route_Handlers::dispatch_http",
    );
    expect(dispatcherSource).not.toContain("run_with_dataforseo_request_credentials");
  });

  it("no hub code path accepts DataForSEO credentials from the request", () => {
    for (const source of [dispatcherSource, secretsSource, organicSource, agentRunsSource]) {
      expect(source).not.toContain("use_request_dataforseo_credentials");
      expect(source).not.toContain("dataforseo_from_request");
      expect(source).not.toContain("clear_request_dataforseo_credentials");
    }
    expect(secretsSource).not.toContain("request_dataforseo");
  });
});
