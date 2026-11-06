import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AgentMailInboundRecord } from "@/lib/agentmail/agentmail-inbound-api";

vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: vi.fn(),
}));

vi.mock("@/lib/bulk/blog-import-openrouter-run", () => ({
  extractBlogImportViaOpenRouter: vi.fn(async (file: File) => ({
    keyword: "test-keyword",
    title: file.name.replace(/\.[^.]+$/, ""),
    meta_description: "Test meta description for SEO.",
    imported_sections_json: JSON.stringify([
      { h2: "Intro", body: "Body one" },
      { h2: "Details", body: "Body two" },
    ]),
    prompt_modifier: "imported",
    keyword_questions_json: JSON.stringify(["Intro", "Details"]),
  })),
  resolveBlogImportRowViaOpenRouter: vi.fn(async (file: File) => ({
    keyword: "test-keyword",
    title: file.name.replace(/\.[^.]+$/, ""),
    imported_sections_json: JSON.stringify([
      { h2: "Intro", body: "Body one" },
      { h2: "Details", body: "Body two" },
    ]),
    prompt_modifier: "imported",
    keyword_questions_json: JSON.stringify(["Intro", "Details"]),
  })),
}));

vi.mock("@/lib/agentmail/agentmail-inbound-api", () => ({
  fetchAgentMailInbound: vi.fn(),
}));

vi.mock("@/lib/openrouter-api-key-resolve", () => ({
  resolveOpenRouterApiKeyForHarness: vi.fn(async () => "test-openrouter-key"),
}));

import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { fetchAgentMailInbound } from "@/lib/agentmail/agentmail-inbound-api";
import { classifyAgentMailEmail, runAgentMailEmailIntake } from "@/lib/agentmail/agentmail-email-intake";

const baseInbound: AgentMailInboundRecord = {
  messageId: "<msg-1@agentmail.to>",
  storageKey: "abc",
  inboxId: "neo-pulse@agentmail.to",
  from: "client@example.com",
  subject: "Blog drafts attached",
  text: "Please publish these blogs based on intent for local SEO.",
  html: "",
  preview: "Please publish these blogs",
  attachments: [
    {
      attachmentId: "att_1",
      filename: "draft-one.md",
      contentType: "text/markdown",
      size: 120,
      dataBase64: btoa("## Intro\n\nFirst section.\n\n## Details\n\nSecond section."),
    },
  ],
  receivedAt: new Date().toISOString(),
};

describe("classifyAgentMailEmail", () => {
  beforeEach(() => {
    vi.mocked(callOpenRouterChatCompletion).mockReset();
  });

  it("returns blog request with attachment import source", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValue({
      raw: {},
      content: JSON.stringify({
        isBlogRequest: true,
        reason: "Sender asked for blog publishing",
        intent: "Local SEO blog posts",
        sources: [{ kind: "attachment", filename: "draft-one.md", treatment: "import_draft" }],
      }),
    });

    const result = await classifyAgentMailEmail(baseInbound, "test-key");
    expect(result.isBlogRequest).toBe(true);
    expect(result.intent).toBe("Local SEO blog posts");
    expect(result.sources).toEqual([
      { kind: "attachment", filename: "draft-one.md", treatment: "import_draft" },
    ]);
  });

  it("returns non-blog classification", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValue({
      raw: {},
      content: JSON.stringify({
        isBlogRequest: false,
        reason: "General question only",
        intent: "",
        sources: [],
      }),
    });

    const result = await classifyAgentMailEmail(baseInbound, "test-key");
    expect(result.isBlogRequest).toBe(false);
    expect(result.reason).toBe("General question only");
  });

  it("throws on malformed classifier JSON", async () => {
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValue({
      raw: {},
      content: "{not valid json",
    });

    await expect(classifyAgentMailEmail(baseInbound, "test-key")).rejects.toThrow(
      "Invalid agentmail classification JSON",
    );
  });
});

describe("runAgentMailEmailIntake", () => {
  beforeEach(() => {
    vi.mocked(fetchAgentMailInbound).mockReset();
    vi.mocked(callOpenRouterChatCompletion).mockReset();
  });

  it("builds import rows from classified attachment", async () => {
    vi.mocked(fetchAgentMailInbound).mockResolvedValue(baseInbound);
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValue({
      raw: {},
      content: JSON.stringify({
        isBlogRequest: true,
        reason: "Blog request",
        intent: "Local SEO intent",
        sources: [{ kind: "attachment", filename: "draft-one.md", treatment: "import_draft" }],
      }),
    });

    const result = await runAgentMailEmailIntake(1, baseInbound.messageId);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.imported_sections_json).toContain("Intro");
    expect(result.classification.intent).toBe("Local SEO intent");
  });

  it("throws when email is not a blog request", async () => {
    vi.mocked(fetchAgentMailInbound).mockResolvedValue(baseInbound);
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValue({
      raw: {},
      content: JSON.stringify({
        isBlogRequest: false,
        reason: "Not a blog request",
        intent: "",
        sources: [],
      }),
    });

    await expect(runAgentMailEmailIntake(1, baseInbound.messageId)).rejects.toThrow(
      "Not a blog request",
    );
  });

  it("uses body import when classification selects body source", async () => {
    const bodyInbound: AgentMailInboundRecord = {
      ...baseInbound,
      attachments: [],
      text: "## Intro\n\nFirst section.\n\n## Details\n\nSecond section.",
    };
    vi.mocked(fetchAgentMailInbound).mockResolvedValue(bodyInbound);
    vi.mocked(callOpenRouterChatCompletion).mockResolvedValue({
      raw: {},
      content: JSON.stringify({
        isBlogRequest: true,
        reason: "Draft in body",
        intent: "Intent from email",
        sources: [{ kind: "body", treatment: "import_draft" }],
      }),
    });

    const result = await runAgentMailEmailIntake(1, bodyInbound.messageId);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0]?.imported_sections_json).toContain("Intro");
  });
});
