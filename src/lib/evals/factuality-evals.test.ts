import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FACTUALITY_JUDGE_SYSTEM_PROMPT,
  buildFactualityJudgeUserPrompt,
  gradeFactualityVerdicts,
  runFactualityJudge,
  type FactualityClaimVerdict,
} from "@/lib/evals/factuality-evals";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";

vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: vi.fn(),
}));
vi.mock("@/lib/optimization-settings-storage", () => ({
  getDecisionModel: () => "test/decision-model",
}));

const mockChat = vi.mocked(callOpenRouterChatCompletion);

const supported: FactualityClaimVerdict = {
  claim: "Acme Blinds has served Calgary since 1998.",
  verdict: "supported",
  evidence: "Acme Blinds has served Calgary since 1998.",
  reason: "Stated verbatim in the pack.",
};

describe("gradeFactualityVerdicts", () => {
  it("passes when every claim is supported with evidence", () => {
    const report = gradeFactualityVerdicts([supported]);
    expect(report.pass).toBe(true);
    expect(report.supportedCount).toBe(1);
    expect(report.contradictedCount).toBe(0);
    expect(report.unsupportedCount).toBe(0);
    expect(report.issues).toEqual([]);
  });

  it("fails a contradicted claim", () => {
    const report = gradeFactualityVerdicts([
      { claim: "Open seven days a week.", verdict: "contradicted", reason: "Pack says closed Sundays." },
    ]);
    expect(report.pass).toBe(false);
    expect(report.contradictedCount).toBe(1);
    expect(report.issues[0]?.code).toBe("contradicted-claim");
  });

  it("fails an unsupported claim", () => {
    const report = gradeFactualityVerdicts([
      { claim: "Lowest price in Canada, guaranteed.", verdict: "unsupported", reason: "Not in the pack." },
    ]);
    expect(report.pass).toBe(false);
    expect(report.unsupportedCount).toBe(1);
    expect(report.issues[0]?.code).toBe("unsupported-claim");
  });

  it("fails a supported claim that carries no pack evidence", () => {
    const missing = gradeFactualityVerdicts([{ claim: "Locally owned.", verdict: "supported", reason: "Pack states it." }]);
    expect(missing.pass).toBe(false);
    expect(missing.supportedCount).toBe(0);
    expect(missing.issues[0]?.code).toBe("supported-without-evidence");

    const blank = gradeFactualityVerdicts([{ ...supported, evidence: "   " }]);
    expect(blank.pass).toBe(false);
    expect(blank.issues[0]?.code).toBe("supported-without-evidence");
  });

  it("counts a mixed verdict set and fails overall", () => {
    const report = gradeFactualityVerdicts([
      supported,
      { claim: "Open Sundays.", verdict: "contradicted", reason: "Pack says closed Sundays." },
      { claim: "Free repairs forever.", verdict: "unsupported", reason: "Not in the pack." },
    ]);
    expect(report.pass).toBe(false);
    expect(report.supportedCount).toBe(1);
    expect(report.contradictedCount).toBe(1);
    expect(report.unsupportedCount).toBe(1);
    expect(report.issues).toHaveLength(2);
  });

  it("passes an empty verdict set (no factual claims made)", () => {
    const report = gradeFactualityVerdicts([]);
    expect(report.pass).toBe(true);
    expect(report.claims).toEqual([]);
  });

  it("rejects supported verdicts whose evidence is not in the source pack", () => {
    const pack = "Acme Blinds has served Calgary since 1998.";
    const report = gradeFactualityVerdicts(
      [
        supported,
        {
          claim: "Acme Blinds guarantees the lowest price in Canada, forever.",
          verdict: "supported",
          evidence: "Acme Blinds guarantees the lowest price in Canada, forever.",
          reason: "The source pack explicitly states this factual claim.",
        },
      ],
      pack,
    );
    expect(report.pass).toBe(false);
    expect(report.supportedCount).toBe(1);
    expect(report.issues[0]?.code).toBe("evidence-not-in-pack");
  });
});

describe("runFactualityJudge (mocked transport)", () => {
  beforeEach(() => {
    mockChat.mockReset();
  });

  it("grades verdicts and calls the decision model with the strict format", async () => {
    mockChat.mockResolvedValue({
      raw: null,
      content: JSON.stringify({
        claims: [
          supported,
          { claim: "Lowest price in Canada.", verdict: "unsupported", evidence: "", reason: "Not in the pack." },
        ],
      }),
    });

    const report = await runFactualityJudge({
      articleText: "Acme Blinds has served Calgary since 1998. Lowest price in Canada.",
      sourceContext: "Acme Blinds has served Calgary since 1998.",
      apiKey: "test-key",
    });

    expect(report.pass).toBe(false);
    expect(report.supportedCount).toBe(1);
    expect(report.unsupportedCount).toBe(1);
    expect(mockChat).toHaveBeenCalledTimes(1);
    const call = mockChat.mock.calls[0]![0];
    expect(call.model).toBe("test/decision-model");
    expect(call.temperature).toBe(0);
    expect(call.responseFormat).toEqual({ type: "json_object" });
    expect(call.system).toContain("ONLY against the SOURCE PACK");
    expect(call.system).toContain('Output shape: {"claims"');
    expect(call.user).toContain("SOURCE PACK:");
    expect(call.user).toContain("ARTICLE:");
  });

  it("respects an explicit model override", async () => {
    mockChat.mockResolvedValue({ raw: null, content: JSON.stringify({ claims: [] }) });
    await runFactualityJudge({
      articleText: "Acme Blinds has served Calgary since 1998.",
      sourceContext: "Acme Blinds has served Calgary since 1998.",
      apiKey: "test-key",
      model: "custom/judge-model",
    });
    expect(mockChat.mock.calls[0]![0].model).toBe("custom/judge-model");
  });

  it("throws on malformed judge output instead of grading it", async () => {
    mockChat.mockResolvedValue({ raw: null, content: "not json at all" });
    await expect(
      runFactualityJudge({ articleText: "Some claim.", sourceContext: "Some source.", apiKey: "test-key" }),
    ).rejects.toThrow(/Invalid factuality verdicts JSON/);
  });

  it("throws on wrongly shaped judge output", async () => {
    mockChat.mockResolvedValue({ raw: null, content: JSON.stringify({ claims: [{ claim: "x" }] }) });
    await expect(
      runFactualityJudge({ articleText: "Some claim.", sourceContext: "Some source.", apiKey: "test-key" }),
    ).rejects.toThrow(/Invalid factuality verdicts JSON/);
  });

  it("rejects an empty article or source pack before calling the model", async () => {
    await expect(
      runFactualityJudge({ articleText: "   ", sourceContext: "Pack.", apiKey: "test-key" }),
    ).rejects.toThrow(/non-empty article/);
    await expect(
      runFactualityJudge({ articleText: "Claim.", sourceContext: " ", apiKey: "test-key" }),
    ).rejects.toThrow(/non-empty source pack/);
    expect(mockChat).not.toHaveBeenCalled();
  });
});

describe("factuality judge prompt contract", () => {
  it("states the pack-only rule and the evidence requirement", () => {
    expect(FACTUALITY_JUDGE_SYSTEM_PROMPT).toContain("ONLY against the SOURCE PACK");
    expect(FACTUALITY_JUDGE_SYSTEM_PROMPT).toContain("exact quote");
    expect(FACTUALITY_JUDGE_SYSTEM_PROMPT).toContain("does not count as evidence");
  });

  it("builds a user prompt with both sections", () => {
    const user = buildFactualityJudgeUserPrompt("Article body.", "Pack body.");
    expect(user).toContain("SOURCE PACK:\nPack body.");
    expect(user).toContain("ARTICLE:\nArticle body.");
  });
});
