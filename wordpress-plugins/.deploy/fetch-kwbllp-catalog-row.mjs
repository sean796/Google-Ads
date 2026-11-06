import { writeFileSync } from "fs";
import { join } from "path";
import SftpClient from "ssh2-sftp-client";

const dir = join(import.meta.dirname, "..");
const cfg = JSON.parse(
  (await import("fs")).readFileSync(join(dir, "flowbie-wpengine.config.json"), "utf8"),
);

const sftp = new SftpClient();
await sftp.connect({
  host: cfg.host,
  port: Number(cfg.port) || 2222,
  username: cfg.username,
  password: cfg.password,
  readyTimeout: 30000,
});
const remote = "../neo-pulse-data/wpengine-sftp-catalog.json";
const buf = await sftp.get(remote);
await sftp.end();
const payload = JSON.parse(buf.toString("utf8"));
const rows = Array.isArray(payload) ? payload : payload.rows || payload.sites || [];
const kwb = (Array.isArray(rows) ? rows : []).find((r) => {
  const site = String(r.site || r.siteUrl || r.wpEngineDomain || "").toLowerCase();
  return site.includes("kwbllp");
});
if (!kwb) {
  console.log("no kwbllp row; keys", Object.keys(payload));
  console.log("row count", Array.isArray(rows) ? rows.length : "n/a");
  process.exit(1);
}
const host = kwb.host || kwb.wpEngineHost;
const username = kwb.username || kwb.wpEngineUsername;
const password = kwb.password || kwb.wpEnginePassword;
const port = Number(kwb.port || kwb.wpEnginePort || 2222);
console.log("live catalog", host, username, "passLen", String(password).length);

const kwbSftp = new SftpClient();
await kwbSftp.connect({
  host,
  port,
  username,
  password,
  readyTimeout: 30000,
});
const plugins = await kwbSftp.list("./wp-content/plugins");
await kwbSftp.end();
console.log(
  "kwbllp plugins",
  plugins
    .filter((e) => e.type === "d")
    .map((e) => e.name)
    .sort()
    .join(", "),
);
