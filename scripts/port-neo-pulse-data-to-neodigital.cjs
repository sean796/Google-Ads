#!/usr/bin/env node
/**
 * Mirror the private neo-pulse-data root (above the web root) from flowbie.ca (flowbietest) to neodigital.ca.
 *
 *   node scripts/port-neo-pulse-data-to-neodigital.cjs          # dry-run list only
 *   node scripts/port-neo-pulse-data-to-neodigital.cjs --execute  # copy + backup dest
 */

const { existsSync, mkdirSync, readFileSync, rmSync, readdirSync, statSync } = require("fs");
const { join, dirname, posix: pathPosix } = require("path");
const SftpClient = require("ssh2-sftp-client");

const repoRoot = join(__dirname, "..");
const csvPath = join(repoRoot, "wordpress-plugins/Customer List/SFTP Users_Clients List.csv");
const stagingDir = join(repoRoot, ".port-neo-pulse-data-staging");

const execute = process.argv.includes("--execute");
const destRel = "../neo-pulse-data";
const sourceCandidates = [
  "../neo-pulse-data",
  "wp-content/uploads/flowbie-data",
  "wp-content/flowbie-data",
  "wp-content/neo-pulse-data",
];

function parseCsvRow(line) {
  const parts = line.split(",").map((item) => item.trim());
  const password = line.split(",").slice(4).join(",").trim().replace(/^"|"$/g, "");
  return {
    site: parts[0],
    host: parts[1],
    port: Number(parts[2]) || 2222,
    username: parts[3],
    password,
  };
}

function loadSitesFromCsv() {
  const text = readFileSync(csvPath, "utf8");
  return text
    .split(/\r?\n/)
    .slice(1)
    .map(parseCsvRow)
    .filter((row) => row.site && row.host && row.username && row.password);
}

function loadSiteCredentials(domain) {
  const configPath = join(repoRoot, "wordpress-plugins/flowbie-wpengine.config.json");
  if (domain === "neodigital.ca" && existsSync(configPath)) {
    const raw = JSON.parse(readFileSync(configPath, "utf8"));
    const site = String(raw.site ?? "")
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
    if (site === domain && raw.host && raw.username && raw.password) {
      return {
        site: domain,
        host: raw.host,
        port: Number(raw.port) || 2222,
        username: raw.username,
        password: raw.password,
      };
    }
  }
  if (!existsSync(csvPath)) {
    throw new Error(`Missing CSV: ${csvPath}`);
  }
  const rows = loadSitesFromCsv().filter((row) => row.site === domain);
  const row = rows.find((r) => r.username.includes("matt")) ?? rows.find((r) => r.password) ?? rows[0];
  if (!row?.password) {
    throw new Error(`No SFTP credentials for ${domain}`);
  }
  return row;
}

async function connectSite(site) {
  const sftp = new SftpClient();
  await sftp.connect({
    host: site.host,
    port: site.port,
    username: site.username,
    password: site.password,
    readyTimeout: 45000,
  });
  return sftp;
}

async function remoteExists(sftp, remotePath) {
  try {
    const kind = await sftp.exists(remotePath);
    return kind === "d" || kind === "-" || kind === "l";
  } catch {
    return false;
  }
}

async function resolveSourceDir(sftp) {
  for (const candidate of sourceCandidates) {
    if (await remoteExists(sftp, candidate)) {
      return candidate;
    }
  }
  return null;
}

async function listRemoteTree(sftp, remoteRoot) {
  const files = [];
  const dirs = [];
  async function walk(relDir) {
    const abs = relDir ? `${remoteRoot}/${relDir}` : remoteRoot;
    let entries;
    try {
      entries = await sftp.list(abs);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "." || entry.name === "..") continue;
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.type === "d") {
        dirs.push(rel);
        await walk(rel);
      } else {
        files.push(rel);
      }
    }
  }
  await walk("");
  return { files, dirs };
}

async function downloadTree(sftp, remoteRoot, localRoot, tree) {
  mkdirSync(localRoot, { recursive: true });
  for (const dir of tree.dirs) {
    mkdirSync(join(localRoot, dir), { recursive: true });
  }
  let done = 0;
  for (const file of tree.files) {
    const remotePath = `${remoteRoot}/${file.replace(/\\/g, "/")}`;
    const localPath = join(localRoot, file);
    mkdirSync(dirname(localPath), { recursive: true });
    await sftp.fastGet(remotePath, localPath);
    done += 1;
    if (done % 25 === 0 || done === tree.files.length) {
      process.stdout.write(`\r  download: ${done}/${tree.files.length}`);
    }
  }
  if (tree.files.length) process.stdout.write("\n");
}

async function uploadTree(sftp, localRoot, remoteRoot, tree) {
  for (const dir of tree.dirs) {
    const remotePath = `${remoteRoot}/${dir.replace(/\\/g, "/")}`;
    try {
      await sftp.mkdir(remotePath, true);
    } catch {
      /* may exist */
    }
  }
  let done = 0;
  for (const file of tree.files) {
    const localPath = join(localRoot, file);
    const remotePath = `${remoteRoot}/${file.replace(/\\/g, "/")}`;
    await sftp.fastPut(localPath, remotePath);
    done += 1;
    if (done % 25 === 0 || done === tree.files.length) {
      process.stdout.write(`\r  upload: ${done}/${tree.files.length}`);
    }
  }
  if (tree.files.length) process.stdout.write("\n");
}

async function backupDestIfPresent(sftp, remoteRoot) {
  if (!(await remoteExists(sftp, remoteRoot))) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const parent = dirname(remoteRoot).replace(/\\/g, "/");
  const base = pathPosix.basename(remoteRoot);
  const backupPath = `${parent}/${base}.pre-port-${stamp}`;
  await sftp.rename(remoteRoot, backupPath);
  return backupPath;
}

function walkLocalTree(localRoot) {
  const files = [];
  const dirs = [];
  function walk(dir, rel) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      if (statSync(full).isDirectory()) {
        dirs.push(relPath);
        walk(full, relPath);
      } else {
        files.push(relPath);
      }
    }
  }
  walk(localRoot, "");
  return { files, dirs };
}

async function main() {
  const sourceSite = loadSiteCredentials("flowbie.ca");
  const destSite = loadSiteCredentials("neodigital.ca");

  console.log(execute ? "EXECUTE mode" : "DRY-RUN mode (pass --execute to copy)");
  console.log("Source:", `${sourceSite.host} (${sourceSite.username})`);
  console.log("Dest:", `${destSite.host} (${destSite.username})`);

  const sourceSftp = await connectSite(sourceSite);
  let tree;
  let sourceDir;
  try {
    sourceDir = await resolveSourceDir(sourceSftp);
    if (!sourceDir) {
      throw new Error(`No data dir on source. Checked: ${sourceCandidates.join(", ")}`);
    }
    console.log("\nSource dir:", sourceDir);
    tree = await listRemoteTree(sourceSftp, sourceDir);
    console.log(`Files: ${tree.files.length}, dirs: ${tree.dirs.length}`);
    if (tree.files.length === 0) {
      throw new Error("Source tree is empty.");
    }
    const sample = tree.files.slice(0, 12);
    console.log("Sample files:");
    for (const f of sample) console.log(`  ${f}`);
    if (tree.files.length > sample.length) {
      console.log(`  ... +${tree.files.length - sample.length} more`);
    }

    if (!execute) {
      console.log("\nDry-run complete. Re-run with --execute to copy.");
      return;
    }

    if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true, force: true });
    mkdirSync(stagingDir, { recursive: true });
    console.log("\nDownloading source to local staging...");
    await downloadTree(sourceSftp, sourceDir, stagingDir, tree);
  } finally {
    await sourceSftp.end();
  }

  const destSftp = await connectSite(destSite);
  try {
    console.log("\nBacking up destination (if present)...");
    const backupPath = await backupDestIfPresent(destSftp, destRel);
    if (backupPath) console.log("  backup:", backupPath);

    console.log("Uploading to", destRel);
    await destSftp.mkdir(destRel, true);
    const localTree = walkLocalTree(stagingDir);
    await uploadTree(destSftp, stagingDir, destRel, localTree);
    console.log("\nPort complete.");
  } finally {
    await destSftp.end();
    if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("Port failed:", err.message);
  process.exit(1);
});
