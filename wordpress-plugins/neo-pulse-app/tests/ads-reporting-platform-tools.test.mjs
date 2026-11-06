import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readPhp(relativePath) {
  const content = readFileSync(join(root, relativePath), "utf8");
  const dir = dirname(join(root, relativePath));
  const slug = relativePath
    .split("/")
    .pop()
    .replace(/^class-/, "")
    .replace(/\.php$/, "");
  const traitFiles = readdirSync(dir)
    .filter((name) => name.startsWith(`trait-${slug}-`) && name.endsWith(".php"))
    .sort();
  if (traitFiles.length === 0) {
    return content;
  }
  const traits = traitFiles.map((name) => readFileSync(join(dir, name), "utf8"));
  return [content, ...traits].join("\n");
}

describe("ads reporting platform tools", () => {
  it("loads and registers Ads Ask tools", () => {
    const loader = readPhp("includes/class-neo-pulse-app-loader.php");
    expect(loader).toContain("class-platform-data-ads-reporting-tools.php");

    const tools = readPhp("includes/platform-data/class-platform-data-tools.php");
    expect(tools).toContain("ads_reporting_status");
    expect(tools).toContain("ads_reporting_compare_summary");
    expect(tools).toContain("Neo_Pulse_App_Platform_Data_Ads_Reporting_Tools");

    const ads = readPhp("includes/platform-data/class-platform-data-ads-reporting-tools.php");
    expect(ads).toContain("Set a 10-digit Google Ads customer ID on this property.");
    expect(ads).toContain("fetch_reporting_bundle");
    expect(ads).toContain("resolve_customer_id");

    const resolver = readPhp("includes/task-execution/class-task-execution-site-resolver.php");
    expect(resolver).toContain("googleAdsCustomerId");

    const store = readPhp("includes/tasks/class-tasks-store.php");
    expect(store).toContain("normalize_ads_reporting_task");
    expect(store).toContain("ads-monthly-mom-report");
    expect(store).toContain("ads-mom-report");

    const drive = readPhp("includes/google-mcp/class-google-drive-upload.php");
    expect(drive).toContain("ads_reporting");
  });
});
