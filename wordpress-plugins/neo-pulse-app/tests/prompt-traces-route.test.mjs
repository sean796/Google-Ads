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
const storeSource = readFileSync(
  join(pluginDir, "includes/prompt-traces/class-prompt-traces-store.php"),
  "utf8",
);
const handlerSource = readFileSync(
  join(pluginDir, "includes/prompt-traces/class-prompt-trace-route-handlers.php"),
  "utf8",
);
const loaderSource = readFileSync(
  join(pluginDir, "includes/class-neo-pulse-app-loader.php"),
  "utf8",
);

describe("prompt traces route (Wave 2)", () => {
  it("is dispatched behind the session auth gate, not the public route list", () => {
    expect(dispatcherSource).toContain("prompt-traces");
    expect(dispatcherSource).toContain("Neo_Pulse_App_Prompt_Trace_Route_Handlers::dispatch_http");
    const publicList = dispatcherSource.slice(
      dispatcherSource.indexOf("private static function public_routes"),
      dispatcherSource.indexOf("private static function machine_routes"),
    );
    expect(publicList).not.toContain("prompt-traces");
  });

  it("handler requires a session user and validates the trace payload", () => {
    expect(handlerSource).toContain("Neo_Pulse_App_Auth_Session::require_user()");
    expect(handlerSource).toContain("401");
    expect(handlerSource).toContain("trace.calls is required");
  });

  it("store creates the prompt traces table and records the created_by user", () => {
    expect(storeSource).toContain("neo_pulse_prompt_traces");
    expect(storeSource).toContain("dbDelta");
    expect(storeSource).toContain("trace_json");
    expect(storeSource).toContain("created_by");
  });

  it("loader requires both new classes", () => {
    expect(loaderSource).toContain("class-prompt-traces-store.php");
    expect(loaderSource).toContain("class-prompt-trace-route-handlers.php");
  });
});
