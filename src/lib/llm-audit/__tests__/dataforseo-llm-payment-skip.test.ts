import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mcp_DataForSEO_llm_responses_live } from "@/lib/mcp-tools";

vi.mock("@/lib/mcp-tools", () => ({
  mcp_DataForSEO_llm_responses_live: vi.fn(),
}));

import {
  dataforseoLlmResponsesLive,
  isDataForSeoPaymentFailure,
  isDfsLlmPaymentSkip,
  isDfsPaymentLatched,
  resetDfsPaymentLatch,
  DFS_LLM_PAYMENT_SKIP,
  DFS_LLM_UNAVAILABLE_SKIP,
} from "@/lib/llm-audit/dataforseo-llm-responses-live";

const liveParams = {
  platform: "chat_gpt" as const,
  model_name: "o4-mini",
  user_prompt: "window blinds",
};

describe("isDataForSeoPaymentFailure", () => {
  it("treats HTTP 402 as a DataForSEO payment skip", () => {
    expect(isDataForSeoPaymentFailure({ httpStatus: 402 })).toBe(true);
    expect(isDataForSeoPaymentFailure({ message: "HTTP 402" })).toBe(true);
    expect(isDataForSeoPaymentFailure({ json: { status_code: 40200 } })).toBe(true);
    expect(isDataForSeoPaymentFailure({ json: { status_code: 40210 } })).toBe(true);
    expect(isDfsLlmPaymentSkip(DFS_LLM_PAYMENT_SKIP)).toBe(true);
  });

  it("does not treat a normal live response as payment", () => {
    expect(isDataForSeoPaymentFailure({ httpStatus: 200, json: { status_code: 20000 } })).toBe(false);
  });
});

describe("DFS payment latch", () => {
  beforeEach(() => {
    resetDfsPaymentLatch();
    vi.mocked(mcp_DataForSEO_llm_responses_live).mockReset();
  });

  afterEach(() => {
    resetDfsPaymentLatch();
  });

  it("returns unavailable skip on MCP gateway 502 without throwing", async () => {
    const err = new Error("MCP API error (502): Bad Gateway");
    (err as Error & { status?: number }).status = 502;
    vi.mocked(mcp_DataForSEO_llm_responses_live).mockRejectedValue(err);

    const result = await dataforseoLlmResponsesLive(liveParams);
    expect(result).toEqual(DFS_LLM_UNAVAILABLE_SKIP);
  });

  it("returns unavailable skip on HTTP 422 Unprocessable Entity without throwing or gating", async () => {
    const err = new Error("MCP API error (422): Unprocessable Entity");
    (err as Error & { status?: number }).status = 422;
    vi.mocked(mcp_DataForSEO_llm_responses_live).mockRejectedValue(err);

    const result = await dataforseoLlmResponsesLive(liveParams);
    expect(result).toEqual(DFS_LLM_UNAVAILABLE_SKIP);
  });

  it("returns unavailable skip on skipped payload without throwing", async () => {
    vi.mocked(mcp_DataForSEO_llm_responses_live).mockResolvedValue({
      skipped: true,
      reason: "dfs_task_error",
      tasks: [],
    });

    const result = await dataforseoLlmResponsesLive(liveParams);
    expect(result).toEqual(DFS_LLM_UNAVAILABLE_SKIP);
  });

  it("skips later live calls after payment failure JSON", async () => {
    vi.mocked(mcp_DataForSEO_llm_responses_live).mockResolvedValue({
      status_code: 40200,
      status_message: "Payment Required",
    });

    const first = await dataforseoLlmResponsesLive(liveParams);
    expect(first).toEqual(DFS_LLM_PAYMENT_SKIP);
    expect(isDfsPaymentLatched()).toBe(true);
    expect(mcp_DataForSEO_llm_responses_live).toHaveBeenCalledTimes(1);

    const second = await dataforseoLlmResponsesLive({
      ...liveParams,
      platform: "gemini",
      model_name: "gemini-2.5-flash",
    });
    expect(second).toEqual(DFS_LLM_PAYMENT_SKIP);
    expect(mcp_DataForSEO_llm_responses_live).toHaveBeenCalledTimes(1);
  });
});
