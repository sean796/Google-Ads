import { afterEach, describe, expect, it, vi } from "vitest";
import { generateSEOSlug, normalizeLocationForSeoSlug } from "../seo-slug-generator";
import { getMetaModel } from "../optimization-settings-storage";
import { writeGlobalMetaAgentModel } from "../global-agent-models";

describe("normalizeLocationForSeoSlug", () => {
  it("drops metropolitan area noise", () => {
    expect(normalizeLocationForSeoSlug("Marietta, Atlanta metropolitan area, GA")).toBe("Marietta, GA");
  });

  it("keeps city and state when no noise", () => {
    expect(normalizeLocationForSeoSlug("Marietta, GA")).toBe("Marietta, GA");
  });
});

describe("generateSEOSlug", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns empty when primary keyword is empty", async () => {
    await expect(generateSEOSlug("Title", "", "Marietta, GA", "sk-test")).resolves.toBe("");
  });

  it("returns empty when API key missing", async () => {
    await expect(generateSEOSlug("Title", "keyword", "Marietta, GA", "")).resolves.toBe("");
  });

  it("returns empty on fetch rejection", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network"));
    await expect(generateSEOSlug("Title", "keyword", "Marietta, GA", "sk-test")).resolves.toBe("");
  });

  it("returns empty when response not ok", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });
    await expect(generateSEOSlug("Title", "keyword", null, "sk-test")).resolves.toBe("");
  });

  it("returns empty when model content empty", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        content: "",
        raw: { choices: [{ message: { content: "" } }] },
      }),
    });
    await expect(generateSEOSlug("Title", "keyword", "Marietta, GA", "sk-test")).resolves.toBe("");
  });

  it("returns sanitized slug from model output", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        content: "chiro-sports-injury-douglasdale-calgary-ab",
        raw: {
          choices: [{ message: { content: "chiro-sports-injury-douglasdale-calgary-ab" } }],
        },
      }),
    });
    await expect(
      generateSEOSlug("Sports Injury Chiropractor in Douglasdale, Calgary", "sports injury chiropractor", "Douglasdale, Calgary, AB", "sk-test"),
    ).resolves.toBe("chiro-sports-injury-douglasdale-calgary-ab");
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.model).toBe(getMetaModel());
  });

  it("switches slug model when Meta agent model is updated in settings", async () => {
    const store = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (k: string) => store.get(k) ?? null,
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      removeItem: (k: string) => {
        store.delete(k);
      },
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("localStorage", storage);
    writeGlobalMetaAgentModel("google/gemini-4-argon");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        content: "custom-blinds-calgary-ab",
        raw: {
          choices: [{ message: { content: "custom-blinds-calgary-ab" } }],
        },
      }),
    });

    await expect(
      generateSEOSlug("Custom Blinds in Calgary", "custom blinds", "Calgary, AB", "sk-test"),
    ).resolves.toBe("custom-blinds-calgary-ab");
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.model).toBe("google/gemini-4-argon");
    vi.unstubAllGlobals();
  });
});
