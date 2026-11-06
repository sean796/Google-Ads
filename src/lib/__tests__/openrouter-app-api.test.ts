import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOpenRouterAppChatRequestBody,
  openRouterPromptText,
  postOpenRouterAppChat,
} from "@/lib/openrouter-app-api";
import { beginPromptTrace, endPromptTrace } from "@/lib/openrouter-prompt-trace";

describe("openRouterPromptText", () => {
  it("coerces non-string values without throwing", () => {
    expect(openRouterPromptText({ role: "system" })).toBe("[object Object]");
    expect(openRouterPromptText(42)).toBe("42");
  });
});

describe("buildOpenRouterAppChatRequestBody", () => {
  it("uses system and user when messages are omitted", () => {
    const body = buildOpenRouterAppChatRequestBody({
      model: "test/model",
      system: "sys",
      user: "usr",
      maxTokens: 100,
    });
    expect(body.system).toBe("sys");
    expect(body.user).toBe("usr");
    expect(body.messages).toBeUndefined();
  });

  it("prefers non-empty messages over empty system/user", () => {
    const body = buildOpenRouterAppChatRequestBody({
      model: "test/model",
      messages: [{ role: "user", content: "hello" }],
      system: "",
      user: "",
    });
    expect(body.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(body.system).toBeUndefined();
  });

  it("throws when there is no message content", () => {
    expect(() =>
      buildOpenRouterAppChatRequestBody({
        model: "test/model",
        messages: [{ role: "user", content: "   " }],
        system: "",
        user: "",
      }),
    ).toThrow(/no message content/i);
  });

  it("sends exactly one model and no fallback models array", () => {
    const body = buildOpenRouterAppChatRequestBody({
      model: "openai/gpt-5",
      messages: [{ role: "user", content: "hello" }],
    }) as Record<string, unknown>;
    expect(body.model).toBe("openai/gpt-5");
    expect(body.models).toBeUndefined();
  });
});

describe("postOpenRouterAppChat served model trace", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    endPromptTrace();
  });

  it("records the model the provider actually served", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          content: "hello back",
          finishReason: "stop",
          raw: {
            model: "google/gemini-2.5-flash",
            choices: [{ message: { content: "hello back" } }],
          },
        }),
      }) as unknown as Response),
    );

    beginPromptTrace("test run");
    await postOpenRouterAppChat({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: "hello" }],
    });
    const trace = endPromptTrace();
    expect(trace?.calls).toHaveLength(1);
    expect(trace?.calls[0]?.model).toBe("google/gemini-2.5-flash");
    expect(trace?.calls[0]?.servedModel).toBe("google/gemini-2.5-flash");
  });
});
