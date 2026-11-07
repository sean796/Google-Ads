import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openrouter-agent-category-api", () => ({
  resolveModelForAgentCategory: () => "deepseek/deepseek-v4.1-flash",
}));

import { buildUnifiedAgentLibraryEntries } from "@/lib/agent-library/agent-library-api";

describe("agent library entries", () => {
  it("gives the App Changelog Writer an Open path to the Changelog screen", () => {
    const entries = buildUnifiedAgentLibraryEntries([], {});
    const changelog = entries.find((e) => e.id === "reporting.changelog.app-update-log");
    expect(changelog).toBeDefined();
    expect(changelog?.appPath).toBe("/changelog");
    expect(changelog?.category).toBe("research");
    expect(changelog?.origin).toBe("pulse-mastra");
  });

  it("leaves plain agents without an Open path", () => {
    const entries = buildUnifiedAgentLibraryEntries([], {});
    const withoutPath = entries.filter((e) => e.id !== "reporting.changelog.app-update-log");
    expect(withoutPath.length).toBeGreaterThan(40);
    expect(withoutPath.every((e) => e.appPath === undefined)).toBe(true);
  });
});
