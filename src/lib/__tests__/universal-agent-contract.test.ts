import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createPulseAgent,
  createStep,
  createWorkflow,
} from "@/lib/agent-pipeline";
import {
  getPulseAgentById,
  listPulseAgentsByCategory,
  listPulseAgentsByDomain,
  PULSE_AGENT_REGISTRY,
  resolveModelForRegisteredAgent,
} from "@/lib/agent-pipeline/pulse-agent-registry";
import {
  writeGlobalAdsAgentModel,
  writeGlobalBlogAgentModel,
  writeGlobalImageAgentModel,
  writeGlobalMetaAgentModel,
  writeGlobalReportAgentModel,
  writeGlobalResearchAgentModel,
  writeGlobalVideoAgentModel,
} from "@/lib/global-agent-models";

const callOpenRouterChatCompletionMock = vi.fn();
const streamOpenRouterAppChatMock = vi.fn();

vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: (...args: unknown[]) => callOpenRouterChatCompletionMock(...args),
}));

vi.mock("@/lib/openrouter-app-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/openrouter-app-api")>();
  return {
    ...actual,
    streamOpenRouterAppChat: (...args: unknown[]) => streamOpenRouterAppChatMock(...args),
  };
});

vi.mock("@/lib/master-instructions-storage", () => ({
  ensureMasterInstructionsInMemory: vi.fn().mockResolvedValue(undefined),
  appendMasterInstructionsToSystemPrompt: (s: string) => `${s}\n[MASTER_RULES]`,
}));

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

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      walkTsFiles(full, out);
    } else if (
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx")
    ) {
      out.push(full);
    }
  }
  return out;
}

describe("Universal Mastra-style Agent & Pipeline Contract", () => {
  beforeEach(() => {
    const storage = createMemoryLocalStorage();
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("localStorage", storage);
    vi.clearAllMocks();
  });

  it("validates PULSE_AGENT_REGISTRY completeness and switches models dynamically per category", () => {
    expect(PULSE_AGENT_REGISTRY.length).toBeGreaterThanOrEqual(30);
    const seenIds = new Set<string>();

    for (const agent of PULSE_AGENT_REGISTRY) {
      expect(seenIds.has(agent.id), `duplicate agent id: ${agent.id}`).toBe(false);
      seenIds.add(agent.id);
      expect(agent.label.trim().length).toBeGreaterThan(2);
      expect(agent.reason.trim().length).toBeGreaterThan(10);
      expect(agent.sourceModule.startsWith("src/")).toBe(true);
    }

    writeGlobalResearchAgentModel("google/gemini-4-argon-research");
    writeGlobalBlogAgentModel("google/gemini-4-argon-blog");
    writeGlobalMetaAgentModel("google/gemini-4-argon-meta");
    writeGlobalImageAgentModel("google/gemini-3.1-flash-image-pro");
    writeGlobalReportAgentModel("openai/gpt-5-report");
    writeGlobalAdsAgentModel("openai/gpt-5-ads");
    writeGlobalVideoAgentModel("heygen/video-2");

    expect(resolveModelForRegisteredAgent("aiseo.meta.all-meta-batch", "site-1")).toBe(
      "google/gemini-4-argon-meta",
    );
    expect(resolveModelForRegisteredAgent("aiseo.content.headers", "site-1")).toBe(
      "google/gemini-4-argon-blog",
    );
    expect(resolveModelForRegisteredAgent("aiseo.research.topic-fanout-planner", "site-1")).toBe(
      "google/gemini-4-argon-research",
    );
    expect(resolveModelForRegisteredAgent("image.generator.openrouter", "site-1")).toBe(
      "google/gemini-3.1-flash-image-pro",
    );
    expect(resolveModelForRegisteredAgent("reporting.gsc.section-writer", "site-1")).toBe(
      "openai/gpt-5-report",
    );
    expect(resolveModelForRegisteredAgent("ads.ppc.reporting", "site-1")).toBe(
      "openai/gpt-5-ads",
    );
    expect(resolveModelForRegisteredAgent("video.render.heygen", "site-1")).toBe(
      "heygen/video-2",
    );

    expect(getPulseAgentById("blog.slug.seo-generator")?.category).toBe("meta");
    expect(listPulseAgentsByCategory("meta").length).toBeGreaterThanOrEqual(7);
    expect(listPulseAgentsByDomain("aiseo").length).toBeGreaterThanOrEqual(15);
  });

  it("executes createPulseAgent with category model resolution, Master Instructions, Word Blacklist, and Zod validation", async () => {
    writeGlobalMetaAgentModel("google/gemini-4-argon");

    const testMetaAgent = createPulseAgent({
      id: "test.meta.agent",
      label: "Test Meta Agent",
      category: "meta",
      domain: "aiseo",
      reason: "Tests declarative category model resolution and Zod schema parsing.",
      useMasterInstructions: true,
      useWordBlacklist: true,
      temperature: 0.2,
      maxTokens: 256,
      inputSchema: z.object({ url: z.string().url(), keyword: z.string().min(2) }),
      outputSchema: z.object({ title: z.string(), metaDescription: z.string() }),
      buildSystemPrompt: () => "You optimize title and meta.",
      buildUserPrompt: (input) => `URL: ${input.url}\nKeyword: ${input.keyword}`,
    });

    callOpenRouterChatCompletionMock.mockResolvedValueOnce({
      content: JSON.stringify({
        title: "Custom Window Blinds for Modern Homes",
        metaDescription: "Explore custom window blinds designed for light control and privacy.",
      }),
    });

    const out = await testMetaAgent.run(
      { url: "https://example.com/blinds", keyword: "custom window blinds" },
      { apiKey: "sk-or-test", siteId: "site-1" },
    );

    expect(out.title).toBe("Custom Window Blinds for Modern Homes");
    expect(callOpenRouterChatCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "google/gemini-4-argon",
        system: expect.stringContaining("[MASTER_RULES]"),
        user: expect.stringContaining("WORD BLACKLIST"),
      }),
    );

    // Switch Meta model in settings and confirm the same agent instance immediately switches
    writeGlobalMetaAgentModel("anthropic/claude-sonnet-4.5");
    streamOpenRouterAppChatMock.mockResolvedValueOnce({
      content: JSON.stringify({
        title: "Motorized Window Blinds for Living Rooms",
        metaDescription: "Compare motorized window blinds with quiet operation and clean fit.",
      }),
      reasoning: "",
    });

    const streamed = await testMetaAgent.stream(
      { url: "https://example.com/blinds", keyword: "motorized window blinds" },
      { apiKey: "sk-or-test", siteId: "site-1", onDelta: () => {} },
    );

    expect(streamed.title).toBe("Motorized Window Blinds for Living Rooms");
    expect(streamOpenRouterAppChatMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "anthropic/claude-sonnet-4.5",
      }),
    );
  });

  it("composes createStep and createWorkflow (.then, .parallel, .commit) with Details drawer progress and artifacts", async () => {
    const step1 = createStep({
      id: "step-element",
      title: "AI titles",
      inputSchema: z.object({ url: z.string(), title: z.string() }),
      outputSchema: z.object({ url: z.string(), title: z.string(), html: z.string() }),
      artifact: (out) => ({
        name: "ai-title.json",
        content: JSON.stringify({ url: out.url, title: out.title }),
        mimeType: "application/json",
      }),
      execute: async ({ inputData }) => ({
        url: inputData.url,
        title: `${inputData.title} Optimized`,
        html: "<p>Updated body</p>",
      }),
    });

    const step2 = createStep({
      id: "step-content",
      title: "Post content",
      inputSchema: z.object({ url: z.string(), title: z.string(), html: z.string() }),
      outputSchema: z.object({ url: z.string(), title: z.string(), html: z.string() }),
      artifact: (out) => ({
        name: "content-page.html",
        content: out.html,
        mimeType: "text/html",
      }),
      execute: async ({ inputData }) => inputData,
    });

    const step3 = createStep({
      id: "step-upload",
      title: "WordPress upload",
      inputSchema: z.object({ url: z.string(), title: z.string(), html: z.string() }),
      outputSchema: z.object({ ok: z.boolean(), url: z.string() }),
      artifact: (out) => ({
        name: "wordpress.json",
        content: JSON.stringify(out),
        mimeType: "application/json",
      }),
      execute: async ({ inputData }) => ({ ok: true, url: inputData.url }),
    });

    const workflow = createWorkflow({
      id: "aiseo.title.workflow",
      runKind: "aiTitle",
      inputSchema: z.object({ url: z.string(), title: z.string() }),
      outputSchema: z.object({ ok: z.boolean(), url: z.string() }),
    })
      .then(step1)
      .then(step2)
      .then(step3)
      .commit();

    expect(workflow.getPipelineTitles()).toEqual([
      "AI titles",
      "Post content",
      "WordPress upload",
    ]);

    const events: string[] = [];
    const { output, artifacts } = await workflow.run(
      { url: "https://example.com/page", title: "Initial" },
      {
        onStepProgress: (ev) => events.push(`${ev.title}:${ev.phase}`),
      },
    );

    expect(output).toEqual({ ok: true, url: "https://example.com/page" });
    expect(artifacts.map((a) => a.name)).toEqual([
      "ai-title.json",
      "content-page.html",
      "wordpress.json",
    ]);
    expect(events).toEqual([
      "AI titles:start",
      "AI titles:done",
      "Post content:start",
      "Post content:done",
      "WordPress upload:start",
      "WordPress upload:done",
    ]);
  });

  it("forbids hardcoded OpenRouter model IDs in feature files outside defaults and preset catalogs", () => {
    const srcRoot = resolve("src");
    const allowedRelativeFiles = new Set([
      "lib/optimization-settings-defaults.ts",
      "lib/global-agent-models.ts",
      "lib/image-model-defaults.ts",
      "lib/video-generator/video-model-defaults.ts",
      "lib/llm-audit/llm-audit-openrouter.ts",
    ]);

    const hardcodedModelRegex =
      /["'`](?:google\/gemini-[a-z0-9._-]+|deepseek\/deepseek-[a-z0-9._-]+|openai\/gpt-[a-z0-9._-]+|anthropic\/claude-[a-z0-9._-]+)["'`]/g;

    const violations: string[] = [];
    for (const file of walkTsFiles(srcRoot)) {
      const rel = relative(srcRoot, file).replace(/\\/g, "/");
      if (allowedRelativeFiles.has(rel)) continue;
      const content = readFileSync(file, "utf8");
      // Strip block and line comments before scanning
      const codeOnly = content
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      const matches = codeOnly.match(hardcodedModelRegex);
      if (matches?.length) {
        violations.push(`${rel}: ${matches.join(", ")}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
