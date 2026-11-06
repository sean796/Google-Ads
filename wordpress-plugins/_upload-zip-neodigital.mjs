import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadHubSites } from "./deploy/lib/hub-sites.js";

const zipPath = join(dirname(fileURLToPath(import.meta.url)), "neo-pulse-wp.zip");
const bytes = readFileSync(zipPath);

const sitesJson = await loadHubSites();
const row = (sitesJson.sites || []).find((s) =>
  (s.siteUrl || "").includes("neodigital.ca")
);
if (!row?.appPassword) {
  console.error("Neo Digital app password missing");
  process.exit(1);
}
const pass = String(row.appPassword).replace(/\s+/g, "");
const auth = Buffer.from(`${row.username}:${pass}`).toString("base64");

const form = new FormData();
form.append("file", new Blob([bytes]), "neo-pulse-wp.zip");

const res = await fetch("https://neodigital.ca/wp-json/wp/v2/media", {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Disposition": 'attachment; filename="neo-pulse-wp.zip"',
  },
  body: form,
});
const json = await res.json();
if (!res.ok) {
  console.error("UPLOAD_FAIL", res.status, JSON.stringify(json).slice(0, 400));
  process.exit(1);
}
console.log("UPLOAD_OK", json.source_url || json.guid?.rendered || json.id);
