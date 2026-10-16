import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listPulseAgentsByDomain,
  resolveModelForRegisteredAgent,
} from "@/lib/agent-pipeline/pulse-agent-registry";
import { writeGlobalBlogAgentModel, writeGlobalResearchAgentModel } from "@/lib/global-agent-models";
import {
  emcpCommandPlannerAgent,
  emcpElementorArchitectAgent,
  emcpSiteSchemaDoctorAgent,
} from "@/lib/emcp/neo-emcp-mastra-agents";
import {
  neoEmcpAuditAndFixWorkflow,
  neoEmcpCommandWorkflow,
} from "@/lib/emcp/neo-emcp-mastra-workflows";

const callOpenRouterChatCompletionMock = vi.fn();
const executeEmcpToolMock = vi.fn();
const executeEmcpBatchMock = vi.fn();
const fetchEmcpSiteCatalogMock = vi.fn();

vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: (...args: unknown[]) => callOpenRouterChatCompletionMock(...args),
}));

vi.mock("@/lib/master-instructions-storage", () => ({
  ensureMasterInstructionsInMemory: vi.fn().mockResolvedValue(undefined),
  appendMasterInstructionsToSystemPrompt: (s: string) => `${s}\n[MASTER_RULES]`,
}));

vi.mock("@/lib/emcp/neo-emcp-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/emcp/neo-emcp-api")>();
  return {
    ...actual,
    executeEmcpTool: (...args: unknown[]) => executeEmcpToolMock(...args),
    executeEmcpBatch: (...args: unknown[]) => executeEmcpBatchMock(...args),
    fetchEmcpSiteCatalog: (...args: unknown[]) => fetchEmcpSiteCatalogMock(...args),
  };
});

function createMemoryLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

describe("Neo EMCP Mastra Agents & Workflows Contract", () => {
  beforeEach(() => {
    const storage = createMemoryLocalStorage();
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("localStorage", storage);
    vi.clearAllMocks();
  });

  it("registers all 3 Neo EMCP agents under the emcp domain with dynamic category resolution", () => {
    const emcpAgents = listPulseAgentsByDomain("emcp");
    expect(emcpAgents.map((a) => a.id)).toEqual([
      "emcp.audit.site-schema-doctor",
      "emcp.builder.elementor-architect",
      "emcp.ops.command-planner",
    ]);

    writeGlobalResearchAgentModel("google/gemini-4-argon-research");
    writeGlobalBlogAgentModel("anthropic/claude-sonnet-4.5");

    expect(resolveModelForRegisteredAgent("emcp.audit.site-schema-doctor", "site-1")).toBe(
      "google/gemini-4-argon-research",
    );
    expect(resolveModelForRegisteredAgent("emcp.builder.elementor-architect", "site-1")).toBe(
      "anthropic/claude-sonnet-4.5",
    );
    expect(resolveModelForRegisteredAgent("emcp.ops.command-planner", "site-1")).toBe(
      "google/gemini-4-argon-research",
    );

    expect(emcpSiteSchemaDoctorAgent.id).toBe("emcp.audit.site-schema-doctor");
    expect(emcpElementorArchitectAgent.id).toBe("emcp.builder.elementor-architect");
    expect(emcpCommandPlannerAgent.id).toBe("emcp.ops.command-planner");
  });

  it("runs neoEmcpAuditAndFixWorkflow with dry_run preview and expected_version safety", async () => {
    executeEmcpToolMock
      .mockResolvedValueOnce({
        tool: "neo-pulse/read",
        operation: "audit",
        durationMs: 42,
        data: {
          ok: true,
          site_url: "https://blindswebsitet.wpenginepowered.com/",
          finding_count: 1,
          findings: [
            {
              check: 5,
              code: "pages_default_to_article",
              severity: "warning",
              message: "Pages output as Article by default.",
              fix_tool: "neo-pulse/write",
              fix_op: "set-type-rules",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        tool: "neo-pulse/read",
        operation: "get-business-details",
        durationMs: 25,
        data: {
          name: "DRC Blinds",
          version: "abc123def4560001",
        },
      })
      .mockResolvedValueOnce({
        tool: "neo-pulse/read",
        operation: "list-locations",
        durationMs: 30,
        data: {
          locations: [],
        },
      });

    callOpenRouterChatCompletionMock.mockResolvedValueOnce({
      content: JSON.stringify({
        summary: "Disable Article schema on Page post type.",
        remediationSteps: [
          {
            id: "fix-page-article",
            title: "Turn off default Article schema on Pages",
            tool: "neo-pulse/write",
            operation: "set-type-rules",
            arguments: {
              rules: { page: { schema: "off" } },
            },
            supportsDryRun: true,
            reason: "Pages should output WebPage instead of Article.",
          },
        ],
      }),
    });

    executeEmcpBatchMock.mockResolvedValueOnce({
      ok: true,
      siteUrl: "https://blindswebsitet.wpenginepowered.com",
      results: [
        {
          id: "fix-page-article_dry_run",
          tool: "neo-pulse/write",
          operation: "set-type-rules",
          ok: true,
          durationMs: 35,
          data: { dry_run: true, would_change: true },
        },
      ],
    });

    const events: string[] = [];
    const { output, artifacts } = await neoEmcpAuditAndFixWorkflow.run(
      {
        siteUrl: "https://blindswebsitet.wpenginepowered.com",
        username: "sean@neodigital.ca",
        appPassword: "test-password",
        dryRunOnly: true,
      },
      {
        apiKey: "sk-or-test",
        onStepProgress: (ev) => events.push(`${ev.stepId}:${ev.phase}`),
      },
    );

    expect(output.dryRunOnly).toBe(true);
    expect(output.findingCount).toBe(1);
    expect(output.dryRunResults).toHaveLength(1);
    expect(output.committedResults).toHaveLength(0);
    expect(artifacts.map((a) => a.name)).toEqual([
      "neo-emcp-site-audit.json",
      "neo-emcp-remediation-plan.json",
      "neo-emcp-remediation-results.json",
    ]);
    expect(events).toEqual([
      "emcp-collect-site-audit:start",
      "emcp-collect-site-audit:done",
      "emcp-plan-remediation:start",
      "emcp-plan-remediation:done",
      "emcp-execute-remediation:start",
      "emcp-execute-remediation:done",
    ]);
  });

  it("runs neoEmcpCommandWorkflow to discover catalog and execute planned MCP operations", async () => {
    fetchEmcpSiteCatalogMock.mockResolvedValueOnce({
      mcpUrl: "https://blindswebsitet.wpenginepowered.com/wp-json/mcp/emcp-tools-server",
      toolCount: 2,
      tools: [{ name: "neo-pulse/read" }, { name: "neo-pulse/write" }],
      neoPulseRead: {
        dispatcher: "neo-pulse/read",
        operations: {
          "get-business-details": { description: "Read business details", arguments: {} },
        },
      },
      neoPulseWrite: {
        dispatcher: "neo-pulse/write",
        operations: {
          "update-business-details": { description: "Update business details", arguments: {} },
        },
      },
      neoToolsRead: null,
      neoToolsWrite: null,
    });

    callOpenRouterChatCompletionMock.mockResolvedValueOnce({
      content: JSON.stringify({
        summary: "Read shared business details.",
        steps: [
          {
            id: "step-read-biz",
            title: "Read business details",
            tool: "neo-pulse/read",
            operation: "get-business-details",
            arguments: {},
            supportsDryRun: false,
            reason: "Inspect current shared business record.",
          },
        ],
      }),
    });

    executeEmcpBatchMock.mockResolvedValueOnce({
      ok: true,
      siteUrl: "https://blindswebsitet.wpenginepowered.com",
      results: [
        {
          id: "step-read-biz",
          tool: "neo-pulse/read",
          operation: "get-business-details",
          ok: true,
          durationMs: 22,
          data: { name: "DRC Blinds", version: "v1" },
        },
      ],
    });

    const { output } = await neoEmcpCommandWorkflow.run(
      {
        siteUrl: "https://blindswebsitet.wpenginepowered.com",
        username: "sean@neodigital.ca",
        appPassword: "test-password",
        dryRunOnly: true,
        instruction: "Show me the shared business details",
      },
      { apiKey: "sk-or-test" },
    );

    expect(output.summary).toBe("Read shared business details.");
    expect(output.results).toHaveLength(1);
    expect(output.results[0].ok).toBe(true);
  });
});
