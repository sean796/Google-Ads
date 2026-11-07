#!/usr/bin/env node
/**
 * Changelog source feeder.
 *
 * Reads this repo's git commits since the newest archived changelog
 * entry and sends them to the hub's /api/changelog/source route, where
 * they wait in the commit pool until the App Changelog Writer covers
 * them. Run it whenever you want the archive to see new work (for
 * example before generating a weekly entry).
 *
 * Usage:
 *   node scripts/changelog-source.mjs [--since=YYYY-MM-DD]
 *
 * Environment:
 *   NEO_PULSE_CHANGELOG_EMAIL     Hub sign-in email (required)
 *   NEO_PULSE_CHANGELOG_PASSWORD  Hub sign-in password (required)
 *   NEO_PULSE_CHANGELOG_API_BASE  App base URL (default http://127.0.0.1:8080)
 *
 * Credentials come from the environment only. Never commit them.
 */
import { execFileSync } from "node:child_process";

const MAX_COMMITS = 490;

const email = process.env.NEO_PULSE_CHANGELOG_EMAIL?.trim();
const password = process.env.NEO_PULSE_CHANGELOG_PASSWORD?.trim();
const base = (process.env.NEO_PULSE_CHANGELOG_API_BASE?.trim() || "http://127.0.0.1:8080").replace(/\/+$/, "");

if (!email || !password) {
  console.error("Set NEO_PULSE_CHANGELOG_EMAIL and NEO_PULSE_CHANGELOG_PASSWORD first.");
  process.exit(1);
}

async function api(path, options = {}) {
  const res = await fetch(`${base}/api/${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Request failed (${res.status}) for ${path}`);
  }
  return data;
}

const login = await api("auth/login/", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!login.sessionToken) {
  console.error("Sign-in did not return a session token.");
  process.exit(1);
}
const authHeaders = {
  Authorization: `Bearer ${login.sessionToken}`,
  "Content-Type": "application/json",
};

const archive = await api("changelog/", { headers: authHeaders });
const sinceArg = process.argv.find((a) => a.startsWith("--since="))?.slice("--since=".length);
const coveredThrough = archive.source?.coveredThrough ?? null;
const since =
  sinceArg ||
  coveredThrough ||
  new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

console.log(
  coveredThrough
    ? `Archive covers through ${coveredThrough}. Reading commits since ${since}.`
    : `No entries yet. Reading the last 30 days (since ${since}).`,
);

const subjectsRaw = execFileSync(
  "git",
  ["log", `--since=${since}`, `--max-count=${MAX_COMMITS}`, "--pretty=format:%H%x1f%cs%x1f%s%x1f%b%x1e"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
const filesRaw = execFileSync(
  "git",
  ["log", `--since=${since}`, `--max-count=${MAX_COMMITS}`, "--name-only", "--pretty=format:%H"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

const filesByHash = new Map();
for (const block of filesRaw.split(/\r?\n\r?\n/)) {
  const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) continue;
  filesByHash.set(lines[0], lines.slice(1));
}

const commits = subjectsRaw
  .split("\x1e")
  .map((record) => record.replace(/^\r?\n/, ""))
  .filter((record) => record.trim() !== "")
  .map((record) => {
    const [hash, date, subject, body = ""] = record.split("\x1f");
    return {
      hash: hash.trim(),
      date: date.trim(),
      subject: subject.trim(),
      body: body.trim(),
      files: filesByHash.get(hash.trim()) ?? [],
    };
  })
  .filter((c) => c.hash && c.date && c.subject);

if (commits.length === 0) {
  console.log("No new commits to send. The archive is up to date.");
  process.exit(0);
}

const result = await api("changelog/source/", {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({ commits }),
});

console.log(
  `Sent ${commits.length} commit(s). Pool: ${result.source.commitCount} total, ${result.source.uncoveredCount} waiting for an entry, covered through ${result.source.coveredThrough ?? "nothing yet"}.`,
);
