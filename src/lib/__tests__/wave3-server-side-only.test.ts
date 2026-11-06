import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMcpApiBase } from "@/lib/mcp-tools";
import { openRouterChatCompletionUrl } from "@/lib/openrouter-app-api";

/**
 * Wave 3 guard: the browser is a UI layer, not an integration layer.
 * Production source must not call OpenRouter, a localhost debug ingest,
 * a localhost MCP server, or a client site's wp-json directly.
 */
const FORBIDDEN: Array<{ label: string; pattern: RegExp }> = [
  { label: "direct OpenRouter API URL", pattern: /openrouter\.ai\/api/ },
  { label: "localhost debug ingest", pattern: /127\.0\.0\.1:7781/ },
  { label: "localhost MCP server", pattern: /localhost:3001\/api\/mcp/ },
  { label: "browser-built wp-json URL", pattern: /\/wp-json\/wp\/v2/ },
];

function productionFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      productionFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("server-side only (Wave 3)", () => {
  it("production source has no browser-direct third-party or wp-json calls", () => {
    const root = join(process.cwd(), "src");
    const offenders: string[] = [];
    for (const file of productionFiles(root)) {
      const source = readFileSync(file, "utf8");
      for (const { label, pattern } of FORBIDDEN) {
        if (pattern.test(source)) {
          offenders.push(`${file.split(sep).join("/")}: ${label}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("model calls build only the app API URL", () => {
    const url = openRouterChatCompletionUrl();
    expect(url).toContain("/api/openrouter/chat-completion");
    expect(url).not.toContain("openrouter.ai");
  });

  it("DataForSEO calls use the one shared app MCP address with no browser key", () => {
    const base = resolveMcpApiBase();
    expect(base.endsWith("/api/mcp")).toBe(true);
    expect(base).not.toContain("localhost");
    expect(existsSync(join(process.cwd(), "src/lib/dataforseo-request-auth.ts"))).toBe(false);
    const mcpTools = readFileSync(join(process.cwd(), "src/lib/mcp-tools.ts"), "utf8");
    expect(mcpTools).not.toContain("X-DataForSEO-Api-Key");
    expect(mcpTools).not.toContain("dataForSeoApiKey");
  });

  it("dev proxy passes upstream answers through with no fabricated responses", () => {
    const proxy = readFileSync(
      join(process.cwd(), "scripts/vite-local-wp-api-proxy-plugin.mjs"),
      "utf8",
    );
    expect(proxy).not.toContain("local-dev-token");
    expect(proxy).not.toContain("Default Team");
    expect(proxy).not.toContain("skipped: true");
    expect(proxy).not.toContain("rejectUnauthorized");
    expect(proxy).not.toContain("openrouter-chat-direct");
    expect(proxy).not.toContain("openrouter-models-direct");
    expect(proxy).not.toContain("dataforseo-llm-responses-direct");
  });
});
