import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Hub routes 401 without the session Bearer (the session cookie dies with the
 * browser, the stored Bearer does not). Every browser fetch to this app's API
 * must therefore attach auth headers. This guard fails when a new hub fetch
 * is added without them.
 */
const SRC_ROOT = path.resolve(process.cwd(), "src");

// backendApiUrl(...) or a template URL on one of the hub base constants.
const HUB_URL = /backendApiUrl\(|\$\{(?:BACKEND_API_BASE|apiBase|API_BASE)\}\/api\//;
// neoPulseApiHeaders is the canonical helper; openRouterAppApiHeaders also
// attaches the session Bearer (see openrouter-app-api.ts). A literal
// Authorization header set by hand counts too.
const AUTH = /neoPulseApiHeaders|openRouterAppApiHeaders|Authorization/;

// Public by design: called before any session exists.
const ALLOWLIST = new Map<string, string>([
  ["pages/Register.tsx", "posts to public /api/auth/bootstrap before login"],
]);

function collect(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__") collect(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
}

describe("hub api auth guard", () => {
  it("every fetch to this app's API attaches auth headers", () => {
    const files: string[] = [];
    collect(SRC_ROOT, files);
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (!text.includes("fetch(") || !HUB_URL.test(text) || AUTH.test(text)) continue;
      const rel = path.relative(SRC_ROOT, file).split(path.sep).join("/");
      if (!ALLOWLIST.has(rel)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
