import { describe, expect, it } from "vitest";
import {
  buildPromptTraceMarkdown,
  recordPromptTraceCall,
  beginPromptTrace,
  endPromptTrace,
} from "@/lib/openrouter-prompt-trace";

describe("prompt trace markdown", () => {
  it("shows the served model when it differs from the requested model", () => {
    beginPromptTrace("run");
    recordPromptTraceCall({
      model: "openai/gpt-5",
      servedModel: "google/gemini-2.5-flash",
      system: "sys",
      user: "usr",
      schemaName: null,
      durationMs: 1200,
      finishReason: "stop",
      response: "answer",
    });
    const trace = endPromptTrace();
    expect(trace?.calls[0]?.servedModel).toBe("google/gemini-2.5-flash");
    const md = buildPromptTraceMarkdown(trace!, { title: "t", path: "p" });
    expect(md).toContain("served: google/gemini-2.5-flash");
    expect(md).toContain("## Model: openai/gpt-5");
  });

  it("omits the served note when served matches requested", () => {
    beginPromptTrace("run");
    recordPromptTraceCall({
      model: "openai/gpt-5",
      servedModel: "openai/gpt-5",
      system: "sys",
      user: "usr",
      schemaName: null,
      durationMs: 100,
      finishReason: "stop",
      response: "answer",
    });
    const trace = endPromptTrace();
    const md = buildPromptTraceMarkdown(trace!, { title: "t", path: "p" });
    expect(md).not.toContain("served:");
  });
});
