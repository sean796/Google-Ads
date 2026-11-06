import { afterEach, describe, expect, it, vi } from "vitest";
import { savePromptTraceToHub } from "@/lib/wordpress-api/prompt-trace-api";
import type { PromptTrace } from "@/lib/openrouter-prompt-trace";

const trace: PromptTrace = {
  label: "Bulk run, 2 rows in parallel",
  startedAt: "2026-11-05T00:00:00.000Z",
  calls: [
    {
      model: "google/gemini-2.5-flash",
      servedModel: "google/gemini-2.5-flash",
      system: "sys",
      user: "usr",
      schemaName: null,
      durationMs: 1000,
      finishReason: "stop",
      response: "answer",
    },
  ],
};

describe("savePromptTraceToHub", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the trace to the hub prompt-traces route", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, id: 7, callCount: 1 }),
    }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await savePromptTraceToHub({
      siteUrl: "https://example.com",
      runLabel: trace.label,
      trace,
    });

    expect(result).toEqual({ id: 7, callCount: 1 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain("/api/prompt-traces");
    const body = JSON.parse(String(init.body)) as { siteUrl: string; trace: PromptTrace };
    expect(body.siteUrl).toBe("https://example.com");
    expect(body.trace.calls).toHaveLength(1);
  });

  it("throws with the hub error so the caller can warn visibly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ ok: false, error: "Unauthorized" }),
      }) as unknown as Response),
    );

    await expect(
      savePromptTraceToHub({ siteUrl: "https://example.com", runLabel: "run", trace }),
    ).rejects.toThrow("Unauthorized");
  });
});
