import { beforeEach, describe, expect, it, vi } from "vitest";

const callAgentCategoryOpenRouterChat = vi.fn();

vi.mock("@/lib/openrouter-agent-category-api", () => ({
  callAgentCategoryOpenRouterChat: (...args: unknown[]) => callAgentCategoryOpenRouterChat(...args),
  streamAgentCategoryOpenRouterChat: vi.fn(),
  resolveModelForAgentCategory: () => "deepseek/deepseek-v4.1-flash",
}));

import {
  appChangelogWriterAgent,
  buildChangelogEntry,
  type ChangelogCommit,
} from "@/lib/changelog/changelog-agent";

const COMMITS: ChangelogCommit[] = [
  { hash: "aaa111", date: "2026-11-02", subject: "Add export button", body: "", files: ["src/App.tsx"] },
  { hash: "bbb222", date: "2026-11-05", subject: "Fix login loop", body: "", files: ["src/lib/api.ts"] },
];

const VALID_DRAFT = {
  title: "Export button and a login fix",
  highlights: ["Export button added", "Login loop fixed"],
  sections: [{ heading: "Fixed", items: ["Login loop fixed"] }],
};

describe("app changelog writer agent", () => {
  beforeEach(() => {
    callAgentCategoryOpenRouterChat.mockReset();
  });

  it("runs on the research category and parses a strict draft", async () => {
    callAgentCategoryOpenRouterChat.mockResolvedValue({ content: JSON.stringify(VALID_DRAFT) });

    const draft = await appChangelogWriterAgent.run(
      { commits: COMMITS, coveredThrough: "2026-10-30" },
      { apiKey: "sk-or-test" },
    );

    expect(draft.title).toBe("Export button and a login fix");
    expect(appChangelogWriterAgent.category).toBe("research");
    expect(appChangelogWriterAgent.resolveModel()).toBe("deepseek/deepseek-v4.1-flash");
    const call = callAgentCategoryOpenRouterChat.mock.calls[0]?.[0] as {
      category: string;
      user: string;
      system: string;
    };
    expect(call.category).toBe("research");
    expect(call.user).toContain("Fix login loop");
    expect(call.system).toContain("ONLY source of facts");
  });

  it("rejects malformed model output visibly", async () => {
    callAgentCategoryOpenRouterChat.mockResolvedValue({ content: "not json at all" });
    await expect(
      appChangelogWriterAgent.run({ commits: COMMITS, coveredThrough: null }, {}),
    ).rejects.toThrow();

    callAgentCategoryOpenRouterChat.mockResolvedValue({
      content: JSON.stringify({ ...VALID_DRAFT, title: "" }),
    });
    await expect(
      appChangelogWriterAgent.run({ commits: COMMITS, coveredThrough: null }, {}),
    ).rejects.toThrow();
  });

  it("rejects an empty commit pack before any model call", async () => {
    await expect(
      appChangelogWriterAgent.run({ commits: [], coveredThrough: null }, {}),
    ).rejects.toThrow();
    expect(callAgentCategoryOpenRouterChat).not.toHaveBeenCalled();
  });

  it("builds entry facts from the pack, never from the draft", () => {
    const entry = buildChangelogEntry(VALID_DRAFT, COMMITS, "2026-11-06");
    expect(entry.id).toBe("2026-11-02..2026-11-05");
    expect(entry.date).toBe("2026-11-06");
    expect(entry.rangeFrom).toBe("2026-11-02");
    expect(entry.rangeTo).toBe("2026-11-05");
    expect(entry.commitCount).toBe(2);
    expect(entry.title).toBe(VALID_DRAFT.title);
  });
});
