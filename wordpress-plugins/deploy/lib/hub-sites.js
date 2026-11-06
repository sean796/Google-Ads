import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import SftpClient from "ssh2-sftp-client";

const libDir = dirname(fileURLToPath(import.meta.url));

// Sites (with credentials) live in the hub's private data root above the web
// root; read them over SFTP instead of the old public uploads URL. Hub SFTP
// credentials come from the same Customer List CSV the deploy scripts use.
export async function loadHubSites() {
  const csvPath = join(libDir, "..", "..", "Customer List", "SFTP Users_Clients List.csv");
  const rows = readFileSync(csvPath, "utf8")
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(",").map((item) => item.trim());
      return {
        site: parts[0],
        host: parts[1],
        port: Number(parts[2]) || 2222,
        username: parts[3],
        password: line
          .split(",")
          .slice(4)
          .join(",")
          .trim()
          .replace(/^"|"$/g, ""),
      };
    });
  const hub = rows.find((r) => (r.site || "").toLowerCase().includes("neodigital"));
  if (!hub) throw new Error("neodigital.ca row not found in Customer List CSV");
  const sftp = new SftpClient();
  await sftp.connect({
    host: hub.host,
    port: hub.port,
    username: hub.username,
    password: hub.password,
    readyTimeout: 30000,
  });
  try {
    const buf = await sftp.get("../neo-pulse-data/sites.json");
    return JSON.parse(buf.toString("utf8"));
  } finally {
    await sftp.end();
  }
}
