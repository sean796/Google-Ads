import { describe, it, expect } from "vitest";
import {
  formatModelCatalogValidation,
  validateConfiguredModelsAgainstCatalog,
} from "../model-catalog-validation";
import type { OpenRouterModelCatalogEntry } from "@/lib/openrouter-models-catalog";

const entry = (id: string, name: string): OpenRouterModelCatalogEntry => ({
  id,
  name,
  promptUsdPerToken: null,
  completionUsdPerToken: null,
  imageUsdPerToken: null,
  contextLength: null,
  textOutput: true,
  imageOutput: false,
  videoOutput: false,
});

const catalog: OpenRouterModelCatalogEntry[] = [
  entry("openai/gpt-5", "GPT-5"),
  entry("google/gemini-2.5-pro", "Gemini 2.5 Pro"),
];

describe("validateConfiguredModelsAgainstCatalog", () => {
  it("is ok when every configured model exists in the catalog", () => {
    const v = validateConfiguredModelsAgainstCatalog(
      [
        { label: "Research agent", modelId: "openai/gpt-5" },
        { label: "Blog agent", modelId: "google/gemini-2.5-pro" },
      ],
      catalog,
    );
    expect(v.status).toBe("ok");
    expect(formatModelCatalogValidation(v)).toBeNull();
  });

  it("reports unknown models by label and id", () => {
    const v = validateConfiguredModelsAgainstCatalog(
      [
        { label: "Research agent", modelId: "openai/gpt-5" },
        { label: "Video agent", modelId: "acme/removed-model" },
      ],
      catalog,
    );
    expect(v.status).toBe("invalid");
    if (v.status === "invalid") {
      expect(v.unknown).toEqual([{ label: "Video agent", modelId: "acme/removed-model" }]);
    }
    expect(formatModelCatalogValidation(v)).toMatch(/Unknown model/);
    expect(formatModelCatalogValidation(v)).toMatch(/Video agent: acme\/removed-model/);
  });

  it("distinguishes unverified (catalog failed) from invalid", () => {
    const v = validateConfiguredModelsAgainstCatalog(
      [{ label: "Research agent", modelId: "acme/removed-model" }],
      null,
      "OpenRouter models HTTP 502",
    );
    expect(v.status).toBe("unverified");
    expect(formatModelCatalogValidation(v)).toMatch(/Could not verify/);
  });

  it("is unverified while the catalog is empty, never silently ok", () => {
    const v = validateConfiguredModelsAgainstCatalog(
      [{ label: "Research agent", modelId: "openai/gpt-5" }],
      [],
    );
    expect(v.status).toBe("unverified");
  });
});
