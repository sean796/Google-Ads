/**
 * Gate ratchet: runs eslint, tsc, and vitest, then compares the measured
 * debt counts against docs/gates/baseline.json. Fails when any count is
 * higher than the recorded baseline. Baselines only move down; when a
 * gate reaches zero it leaves the baseline and becomes a plain check.
 *
 * Usage: node scripts/check-gate-baseline.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(root, "docs", "gates", "baseline.json");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));

function run(command, args) {
  try {
    const out = execFileSync(command, args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

const node = process.execPath;
const eslintBin = join(root, "node_modules", "eslint", "bin", "eslint.js");
const tscBin = join(root, "node_modules", "typescript", "bin", "tsc");
const vitestBin = join(root, "node_modules", "vitest", "vitest.mjs");

// --- eslint -----------------------------------------------------------------
function measureEslint() {
  const { out } = run(node, [eslintBin, ".", "-f", "json"]);
  const start = out.indexOf("[");
  if (start === -1) throw new Error("eslint produced no JSON output");
  const results = JSON.parse(out.slice(start));
  let errors = 0;
  let warnings = 0;
  const perFile = [];
  for (const file of results) {
    errors += file.errorCount;
    warnings += file.warningCount;
    if (file.errorCount > 0) {
      perFile.push({ file: file.filePath.replace(root, ""), count: file.errorCount });
    }
  }
  perFile.sort((a, b) => b.count - a.count);
  return { errors, warnings, worst: perFile.slice(0, 10) };
}

// --- tsc --------------------------------------------------------------------
function measureTsc(project) {
  const { out } = run(node, [tscBin, "--noEmit", "-p", project]);
  const byCode = {};
  const perFile = new Map();
  let total = 0;
  for (const line of out.split("\n")) {
    const match = line.match(/^(.+?)\(\d+,\d+\): error (TS\d+):/);
    if (!match) continue;
    total += 1;
    byCode[match[2]] = (byCode[match[2]] ?? 0) + 1;
    perFile.set(match[1], (perFile.get(match[1]) ?? 0) + 1);
  }
  const worst = [...perFile.entries()]
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  return { total, byCode, worst };
}

// --- vitest -----------------------------------------------------------------
function measureVitest() {
  const reportFile = join(tmpdir(), `gate-baseline-vitest-${process.pid}.json`);
  run(node, [vitestBin, "run", "--reporter=json", `--outputFile=${reportFile}`]);
  let report;
  try {
    report = JSON.parse(readFileSync(reportFile, "utf8"));
  } finally {
    try {
      unlinkSync(reportFile);
    } catch {
      /* already gone */
    }
  }
  const failedFiles = report.testResults
    .filter((r) => r.status === "failed")
    .map((r) => r.name.replace(/\\/g, "/").replace(root.replace(/\\/g, "/") + "/", ""))
    .sort();
  return { failedTests: report.numFailedTests ?? 0, failedFiles };
}

// --- compare ----------------------------------------------------------------
const failures = [];
function checkCount(label, current, allowed) {
  const status = current > allowed ? "INCREASED" : current < allowed ? "improved" : "same";
  console.log(`${label}: ${current} (baseline ${allowed}, ${status})`);
  if (current > allowed) failures.push(`${label} rose ${allowed} -> ${current}`);
}

console.log("Measuring gates (eslint, tsc, vitest). This takes a few minutes.");

const eslintNow = measureEslint();
// eslint gates reached zero and left the baseline; lint is a plain blocking check now.
checkCount("eslint errors", eslintNow.errors, baseline.gates.eslint?.errors ?? 0);
checkCount("eslint warnings", eslintNow.warnings, baseline.gates.eslint?.warnings ?? 0);

// tsc gates reached zero and left the baseline; they are plain blocking checks now.
const tscAppNow = measureTsc("tsconfig.app.json");
checkCount("tsc app errors", tscAppNow.total, baseline.gates.tscApp?.total ?? 0);
for (const [code, count] of Object.entries(tscAppNow.byCode).sort((a, b) => b[1] - a[1])) {
  const allowed = baseline.gates.tscApp?.byCode?.[code] ?? 0;
  if (count > allowed) failures.push(`tsc app ${code} rose ${allowed} -> ${count}`);
}
console.log(`tsc app by code: ${JSON.stringify(tscAppNow.byCode)}`);

const tscNodeNow = measureTsc("tsconfig.node.json");
checkCount("tsc node errors", tscNodeNow.total, baseline.gates.tscNode?.total ?? 0);

const vitestNow = measureVitest();
checkCount("failing tests", vitestNow.failedTests, baseline.gates.tests.failedTests);
const allowedFiles = new Set(baseline.gates.tests.failedFiles);
const newFiles = vitestNow.failedFiles.filter((f) => !allowedFiles.has(f));
if (newFiles.length) {
  failures.push(`new failing test files: ${newFiles.join(", ")}`);
}
console.log(`failing test files (${vitestNow.failedFiles.length}): ${vitestNow.failedFiles.join(", ") || "none"}`);

console.log("\nWorst eslint files:");
for (const w of eslintNow.worst) console.log(`  ${w.count}  ${w.file}`);
console.log("Worst tsc app files:");
for (const w of tscAppNow.worst) console.log(`  ${w.count}  ${w.file}`);

if (failures.length) {
  console.error("\nGate baseline exceeded:");
  for (const f of failures) console.error(`  - ${f}`);
  console.error("Fix the new debt or, if a count legitimately moved down, lower docs/gates/baseline.json in the same change.");
  process.exit(1);
}
console.log("\nAll gate counts at or below baseline.");
