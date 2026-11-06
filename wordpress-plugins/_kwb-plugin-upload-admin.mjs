import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadHubSites } from "./deploy/lib/hub-sites.js";

const dir = dirname(fileURLToPath(import.meta.url));
const zipPath = join(dir, "neo-pulse-wp.zip");
const zip = readFileSync(zipPath);

const sites = await loadHubSites();
const row = sites.sites.find((s) => (s.wpEngineDomain || "").includes("kwbllp"));
const pass = String(row.appPassword).replace(/\s+/g, "");
const auth = Buffer.from(`${row.username}:${pass}`).toString("base64");
const headers = { Authorization: `Basic ${auth}` };

const installPage = await fetch(
  "https://kwbllp.com/wp-admin/plugin-install.php?tab=upload",
  { headers, redirect: "follow" }
);
const html = await installPage.text();
const nonceMatch = html.match(/name="_wpnonce"\s+value="([^"]+)"/);
const nonce = nonceMatch?.[1];
console.log("install_page", installPage.status, "nonce", nonce ? "yes" : "no");
if (!nonce) {
  console.log(html.slice(0, 400));
  process.exit(1);
}

const form = new FormData();
form.append("_wpnonce", nonce);
form.append("_wp_http_referer", "/wp-admin/plugin-install.php?tab=upload");
form.append("pluginzip", new Blob([zip]), "neo-pulse-wp.zip");
form.append("install-plugin-submit", "Install Now");

const up = await fetch("https://kwbllp.com/wp-admin/update.php?action=upload-plugin", {
  method: "POST",
  headers,
  body: form,
  redirect: "manual",
});
console.log("upload", up.status, up.headers.get("location") || "");
const body = await up.text();
if (body.includes("Plugin installed successfully") || body.includes("neo-pulse-wp")) {
  console.log("UPLOAD_OK");
  process.exit(0);
}
console.log(body.slice(0, 600));
process.exit(1);
