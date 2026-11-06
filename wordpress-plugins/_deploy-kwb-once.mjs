import { readFileSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildPluginZip } from "./deploy/lib/build-zip.js";
import { deployZip } from "./deploy/lib/deploy-zip.js";
import { loadHubSites } from "./deploy/lib/hub-sites.js";

const dir = dirname(fileURLToPath(import.meta.url));
const zipPath = join(dir, "neo-pulse-wp.zip");
const pluginDir = join(dir, "neo-pulse-wp");

const sitesJson = await loadHubSites();
const row = (sitesJson.sites || []).find(
  (s) => (s.wpEngineDomain || s.siteUrl || "").includes("kwbllp")
);
if (!row?.wpEngineHost || !row?.wpEngineUsername || !row?.wpEnginePassword) {
  console.error("KWB SFTP row missing in sites.json");
  process.exit(1);
}
const site = {
  site: row.wpEngineDomain || "kwbllp.com",
  host: row.wpEngineHost,
  port: row.wpEnginePort || 2222,
  username: row.wpEngineUsername,
  password: row.wpEnginePassword,
  label: "KWB",
};

buildPluginZip(pluginDir, zipPath);
const result = await deployZip(site, zipPath, pluginDir);
console.log(result.ok ? "DEPLOY_OK" : `DEPLOY_FAIL ${result.error}`);
process.exit(result.ok ? 0 : 1);
