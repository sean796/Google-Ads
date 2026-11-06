import { describe, expect, it } from "vitest";
import type { AgentConfig } from "@/types/agent-config";
import {
  assertHarnessTokenBudgetPreflight,
  computeHarnessSectionTokenBudgets,
  createHarnessTokenBudgetTracker,
  estimateTokensFromText,
  isHarnessSeoOpenerBodyAgent,
} from "@/lib/bulk/harness-section-max-tokens";
import { BLOG_HARNESS_SUMMARY_AGENT_ID } from "@/lib/bulk/blog-harness-summary-agent";

const bodyAgent = (overrides: Partial<AgentConfig> = {}): AgentConfig => ({
  id: "body-1",
  step: 1,
  title: "Section",
  description: "Desc",
  features: [],
  ...overrides,
});

const overviewAgent = (): AgentConfig => ({
  id: BLOG_HARNESS_SUMMARY_AGENT_ID,
  step: 0,
  title: "Overview",
  description: "Overview",
  features: [],
});

describe("computeHarnessSectionTokenBudgets", () => {
  it("allocates the full row budget across sections", () => {
    const sections = [
      { sectionKey: "Overview", agent: overviewAgent(), isOverview: true, bodySectionCount: 3 },
      { sectionKey: "Body A", agent: bodyAgent(), isOverview: false },
      { sectionKey: "Body B", agent: bodyAgent({ step: 2 }), isOverview: false },
    ];
    const slots = computeHarnessSectionTokenBudgets(sections, 6000);
    const allocated = slots.reduce((sum, slot) => sum + slot.maxTokens, 0);
    expect(allocated).toBe(6000);
    expect(slots.every((slot) => slot.maxTokens >= 256)).toBe(true);
  });

  it("gives heavier sections more tokens than lighter ones", () => {
    const sections = [
      { sectionKey: "Light", agent: bodyAgent({ step: 2 }), isOverview: false },
      {
        sectionKey: "Heavy",
        agent: bodyAgent({ features: ["[TABLE] pricing"], h3Enabled: true }),
        isOverview: false,
        isSeoOpener: true,
        importedExcerptChars: 900,
      },
    ];
    const slots = computeHarnessSectionTokenBudgets(sections, 8000);
    const light = slots.find((s) => s.sectionKey === "Light")!.maxTokens;
    const heavy = slots.find((s) => s.sectionKey === "Heavy")!.maxTokens;
    expect(heavy).toBeGreaterThan(light);
  });

  it("throws when row budget cannot cover sanity minimum per section", () => {
    expect(() =>
      computeHarnessSectionTokenBudgets(
        [{ sectionKey: "A", agent: bodyAgent(), isOverview: false }],
        128,
      ),
    ).toThrow(/Increase max tokens/);
  });
});

describe("assertHarnessTokenBudgetPreflight", () => {
  it("throws when total budget is below estimated need", () => {
    const sections = Array.from({ length: 8 }, (_, i) => ({
      sectionKey: `S${i}`,
      agent: bodyAgent({ step: i + 1, features: ["[TABLE]"] }),
      isOverview: false,
    }));
    const slots = computeHarnessSectionTokenBudgets(sections, 4000);
    expect(() => assertHarnessTokenBudgetPreflight(slots, 4000, sections.length)).toThrow(
      /Increase max tokens for this row/,
    );
  });

  it("passes when budget meets estimated need", () => {
    const sections = [
      { sectionKey: "Overview", agent: overviewAgent(), isOverview: true, bodySectionCount: 2 },
      { sectionKey: "Body", agent: bodyAgent(), isOverview: false },
    ];
    const slots = computeHarnessSectionTokenBudgets(sections, 24000);
    expect(() => assertHarnessTokenBudgetPreflight(slots, 24000, sections.length)).not.toThrow();
  });
});

describe("isHarnessSeoOpenerBodyAgent", () => {
  it("identifies first body step only", () => {
    expect(isHarnessSeoOpenerBodyAgent(bodyAgent({ step: 1 }))).toBe(true);
    expect(isHarnessSeoOpenerBodyAgent(bodyAgent({ step: 2 }))).toBe(false);
    expect(
      isHarnessSeoOpenerBodyAgent(bodyAgent({ id: BLOG_HARNESS_SUMMARY_AGENT_ID, step: 4 })),
    ).toBe(false);
  });
});

describe("createHarnessTokenBudgetTracker", () => {
  const slots = [
    { sectionKey: "Answer", maxTokens: 500, weight: 0.15, estimatedNeed: 72 },
    { sectionKey: "Body", maxTokens: 1500, weight: 1, estimatedNeed: 480 },
  ];

  it("records estimated versus actual tokens per section", () => {
    const seen: string[] = [];
    const tracker = createHarnessTokenBudgetTracker({
      totalBudget: 2000,
      slots,
      onUsage: (u) => seen.push(u.sectionKey),
    });
    const usage = tracker.record("Body", "p".repeat(400), "c".repeat(800));
    expect(usage.estimatedTokens).toBe(480);
    expect(usage.promptTokens).toBe(100);
    expect(usage.completionTokens).toBe(200);
    expect(usage.actualTokens).toBe(300);
    expect(seen).toEqual(["Body"]);

    const summary = tracker.summary();
    expect(summary.estimatedTokens).toBe(552);
    expect(summary.actualTokens).toBe(300);
    expect(summary.totalBudget).toBe(2000);
  });

  it("stops the run visibly when measured completion tokens pass the budget", () => {
    const tracker = createHarnessTokenBudgetTracker({ totalBudget: 300, slots });
    tracker.record("Answer", "", "c".repeat(400));
    expect(() => tracker.record("Body", "", "c".repeat(1000))).toThrow(
      /Harness token budget exceeded for this row/,
    );
    expect(() => tracker.record("Body", "", "c".repeat(1000))).toThrow(/budget of 300/);
  });

  it("estimateTokensFromText is deterministic", () => {
    expect(estimateTokensFromText("")).toBe(0);
    expect(estimateTokensFromText("abcd")).toBe(1);
    expect(estimateTokensFromText("abcde")).toBe(2);
  });
});
