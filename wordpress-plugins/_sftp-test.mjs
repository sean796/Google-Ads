import { Client } from "ssh2";
import { loadHubSites } from "./deploy/lib/hub-sites.js";

const sites = await loadHubSites();
const row = sites.sites.find((s) => (s.wpEngineDomain || "").includes("kwbllp"));

const conn = new Client();
conn.on("ready", () => {
  console.log("SSH_READY");
  conn.sftp((err, sftp) => {
    if (err) {
      console.log("SFTP_ERR", err.message);
      conn.end();
      process.exit(1);
    }
    sftp.readdir(".", (e, list) => {
      console.log(e ? "READ_ERR " + e.message : "READ_OK " + list.length);
      conn.end();
      process.exit(e ? 1 : 0);
    });
  });
});
conn.on("error", (e) => {
  console.log("CONN_ERR", e.message);
  process.exit(1);
});
conn.connect({
  host: row.wpEngineHost,
  port: row.wpEnginePort || 2222,
  username: row.wpEngineUsername,
  password: row.wpEnginePassword,
  readyTimeout: 60000,
  tryKeyboard: true,
  debug: (msg) => {
    if (msg.includes("HANDSHAKE") || msg.includes("reset") || msg.includes("auth")) {
      console.log("DBG", msg.trim().slice(0, 120));
    }
  },
});
