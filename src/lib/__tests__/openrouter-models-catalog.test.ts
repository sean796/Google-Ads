import { describe, expect, it } from "vitest";
import { modelMatchesOpenRouterQuery } from "@/lib/openrouter-models-catalog";

describe("modelMatchesOpenRouterQuery local filter", () => {
  const localEntry = { id: "qwen3:8b", name: "qwen3:8b", local: true };
  const remoteEntry = { id: "qwen/qwen3-max", name: "Qwen3 Max" };

  it("matches local-only when query is local", () => {
    expect(modelMatchesOpenRouterQuery(localEntry, "local")).toBe(true);
    expect(modelMatchesOpenRouterQuery(remoteEntry, "local")).toBe(false);
  });

  it("matches local rows with local prefix and name fragment", () => {
    expect(modelMatchesOpenRouterQuery(localEntry, "local qwen3")).toBe(true);
    expect(modelMatchesOpenRouterQuery(remoteEntry, "local qwen3")).toBe(false);
  });

  it("still matches id fragments without local prefix", () => {
    expect(modelMatchesOpenRouterQuery(localEntry, "qwen3")).toBe(true);
    expect(modelMatchesOpenRouterQuery(remoteEntry, "qwen3")).toBe(true);
  });
});
