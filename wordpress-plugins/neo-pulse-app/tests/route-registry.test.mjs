import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NEO_PULSE_APP_DISPATCHER_MARKERS, NEO_PULSE_APP_VISIBLE_TAB_ROUTES } from "./route-registry.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dispatcherPath = join(__dirname, "../includes/router/class-api-dispatcher.php");
const dispatcherSource = readFileSync(dispatcherPath, "utf8");

describe("neo-pulse-app route registry", () => {
  it("registers visible-tab handlers in the dispatcher", () => {
    for (const marker of NEO_PULSE_APP_DISPATCHER_MARKERS) {
      expect(dispatcherSource).toContain(marker.split("::")[0]);
    }
  });

  it("lists expected visible-tab paths", () => {
    expect(NEO_PULSE_APP_VISIBLE_TAB_ROUTES.length).toBeGreaterThanOrEqual(8);
    const gmb = NEO_PULSE_APP_VISIBLE_TAB_ROUTES.find((r) => r.path === "gmb/config-status");
    expect(gmb?.method).toBe("GET");
    const publish = NEO_PULSE_APP_VISIBLE_TAB_ROUTES.find((r) => r.path === "google-ads/publish-campaign");
    expect(publish?.method).toBe("POST");
  });

  it("registers the Google Ads publish-campaign handler", () => {
    const handlerPath = join(__dirname, "../includes/google-ads/class-google-ads-route-handlers.php");
    const handlerSource = readFileSync(handlerPath, "utf8");
    expect(handlerSource).toContain("publish-campaign");
    expect(handlerSource).toContain("Neo_Pulse_App_Google_Ads_Campaign_Publisher::publish_campaign");
  });

  it("registers fetch-ppc-research-signals", () => {
    const fetchRoute = NEO_PULSE_APP_VISIBLE_TAB_ROUTES.find((r) => r.path === "google-ads/fetch-ppc-research-signals");
    expect(fetchRoute?.method).toBe("POST");
    const handlerPath = join(__dirname, "../includes/google-ads/class-google-ads-route-handlers.php");
    const handlerSource = readFileSync(handlerPath, "utf8");
    expect(handlerSource).toContain("fetch-ppc-research-signals");
    expect(handlerSource).toContain("Neo_Pulse_App_Google_Ads_Ppc_Research::fetch_signals");
  });

  it("registers fetch-campaign-insights", () => {
    const fetchRoute = NEO_PULSE_APP_VISIBLE_TAB_ROUTES.find((r) => r.path === "google-ads/fetch-campaign-insights");
    expect(fetchRoute?.method).toBe("POST");
    const handlerPath = join(__dirname, "../includes/google-ads/class-google-ads-route-handlers.php");
    const handlerSource = readFileSync(handlerPath, "utf8");
    expect(handlerSource).toContain("fetch-campaign-insights");
    expect(handlerSource).toContain("Neo_Pulse_App_Google_Ads_Campaign_Insights::fetch_campaign_insights");
    const insightsSource = readFileSync(
      join(__dirname, "../includes/google-ads/class-google-ads-campaign-insights.php"),
      "utf8",
    );
    expect(insightsSource).toContain("adGroupDailySeriesById");
    expect(insightsSource).toContain("keywordDailySeriesByKey");
    expect(insightsSource).toContain("recommendations");
  });

  it("runs the Wave 0 auth gate before any handler branch", () => {
    const gateCall = dispatcherSource.indexOf("require_gate( $method, $trimmed_route )");
    const firstBranch = dispatcherSource.indexOf("video/brainstorm/upload");
    expect(gateCall).toBeGreaterThan(-1);
    expect(firstBranch).toBeGreaterThan(gateCall);
  });

  it("keeps the exact Wave 0 public and machine route lists", () => {
    const publicBlock = dispatcherSource.slice(
      dispatcherSource.indexOf("function public_routes"),
      dispatcherSource.indexOf("function machine_routes"),
    );
    const machineBlock = dispatcherSource.slice(
      dispatcherSource.indexOf("function machine_routes"),
      dispatcherSource.indexOf("function route_matches"),
    );
    const publicEntries = publicBlock.match(/array\(\s*'(GET|POST)'/g) ?? [];
    const machineEntries = machineBlock.match(/array\(\s*'(GET|POST)'/g) ?? [];
    expect(publicEntries.length).toBe(13);
    expect(machineEntries.length).toBe(3);
    for (const entry of [
      "'GET', 'auth/me'",
      "'POST', 'auth/login'",
      "'POST', 'auth/logout'",
      "'POST', 'auth/register'",
      "'POST', 'auth/bootstrap'",
      "'POST', 'auth/setup-admin'",
      "'GET', 'teams/invites/accept'",
      "'GET', 'organic-dashboard/client-report/load'",
      "'GET', 'organic-dashboard/client-report/open'",
      "'GET', 'manager-wordpress-properties/client-logo/*'",
      "'GET', 'gmb/callback'",
      "'GET', 'google-ads/callback'",
      "'GET', 'google-mcp/callback'",
      "'POST', 'integrations/hub-data-export'",
      "'POST', 'integrations/hub-data-import'",
      "'POST', 'organic-dashboard/client-report/save'",
    ]) {
      expect(dispatcherSource).toContain(entry);
    }
  });

  it("has no open REST permission stubs left", () => {
    for (const rel of [
      "gsc/class-gsc-route-handlers.php",
      "wordpress/class-wp-route-handlers.php",
      "overview/class-overview-route-handlers.php",
      "dataforseo/class-dataforseo-route-handlers.php",
      "semrush/class-semrush-route-handlers.php",
      "proposal/class-proposal-route-handlers.php",
    ]) {
      const src = readFileSync(join(__dirname, "../includes", rel), "utf8");
      expect(src).not.toContain("__return_true");
    }
  });

  it("no longer exposes or accepts browser-supplied server keys", () => {
    const integrations = readFileSync(
      join(__dirname, "../includes/integrations/class-integrations-route-handlers.php"),
      "utf8",
    );
    expect(integrations).not.toContain("resolved-openrouter-key");
    expect(integrations).not.toContain("sync-email-worker-keys");
    const manager = readFileSync(
      join(__dirname, "../includes/integrations/class-manager-route-handlers.php"),
      "utf8",
    );
    expect(manager).not.toContain("sync-openrouter");
    expect(manager).not.toContain("sync-semrush");
    const chatRoute = readFileSync(
      join(__dirname, "../includes/openrouter/class-openrouter-chat-completion-route.php"),
      "utf8",
    );
    expect(chatRoute).not.toContain("body['apiKey']");
    expect(chatRoute).not.toContain("use_request_api_key( $api_key");
  });

  it("registers import-search-campaigns", () => {
    const fetchRoute = NEO_PULSE_APP_VISIBLE_TAB_ROUTES.find((r) => r.path === "google-ads/import-search-campaigns");
    expect(fetchRoute?.method).toBe("POST");
    const handlerPath = join(__dirname, "../includes/google-ads/class-google-ads-route-handlers.php");
    const handlerSource = readFileSync(handlerPath, "utf8");
    expect(handlerSource).toContain("import-search-campaigns");
    expect(handlerSource).toContain("Neo_Pulse_App_Google_Ads_Campaign_Import::import_search_campaigns");
  });
});
