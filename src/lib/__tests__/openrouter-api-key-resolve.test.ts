import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { loadApiKey, saveApiKey } from "@/lib/api";
import {
  getOpenRouterApiKeyForApp,
  resolveOpenRouterApiKeyForHarness,
} from "@/lib/openrouter-api-key-resolve";

vi.mock("@/lib/api", () => ({
  loadApiKey: vi.fn(),
  saveApiKey: vi.fn(),
}));

describe("openrouter-api-key-resolve (Wave 0 keyless)", () => {
  beforeEach(() => {
    vi.mocked(loadApiKey).mockReturnValue("");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the local key when one is saved", async () => {
    vi.mocked(loadApiKey).mockReturnValue("client-key");
    await expect(resolveOpenRouterApiKeyForHarness()).resolves.toBe("client-key");
    expect(getOpenRouterApiKeyForApp()).toBe("client-key");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns empty string and never fetches or saves when no local key exists", async () => {
    await expect(resolveOpenRouterApiKeyForHarness()).resolves.toBe("");
    expect(getOpenRouterApiKeyForApp()).toBe("");
    expect(fetch).not.toHaveBeenCalled();
    expect(saveApiKey).not.toHaveBeenCalled();
  });
});
